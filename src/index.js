const encoder = new TextEncoder();
const ADMIN_EMAIL = "ermakova18.02.01@gmail.com";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const entry = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : "";
}

function sessionCookie(token, maxAge) {
  return `iterum_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function currentUser(request, env) {
  const token = cookieValue(request, "iterum_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?"
  ).bind(tokenHash, new Date().toISOString()).first();
  return row || null;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/me") {
    const user = await currentUser(request, env);
    if (!user) return json({ authenticated: false, user: null });
    // A lightweight read confirms that the Worker can reach the migrated D1 schema.
    await env.DB.prepare("SELECT COUNT(*) AS total FROM cases").first();
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    return json({
      authenticated: true,
      user: { email: user.email },
      databaseConnected: true,
      isAdmin,
      adminConfigured: true
    });
  }


  const materialFilesRoute = url.pathname.match(/^\/api\/player\/materials\/([a-f0-9]+)\/files$/);
  if (request.method === "GET" && materialFilesRoute) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    const materialId = materialFilesRoute[1];
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    const material = await env.DB.prepare(
      "SELECT m.id, m.case_id, m.is_published, m.delivery_mode, c.status AS case_status FROM materials m JOIN cases c ON c.id = m.case_id WHERE m.id = ?"
    ).bind(materialId).first();
    if (!material) return json({ error: "Материал не найден." }, 404);
    if (!isAdmin && (material.is_published !== 1 || material.case_status !== "active")) return json({ error: "Материал недоступен." }, 403);
    if (!isAdmin && material.delivery_mode === "triggered") {
      const unlocked = await env.DB.prepare("SELECT 1 FROM material_unlocks WHERE user_id = ? AND material_id = ? AND unlocked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(user.id, materialId).first();
      if (!unlocked) return json({ error: "Материал ещё не открыт." }, 403);
    }
    const files = await env.DB.prepare("SELECT id, file_name, content_type, file_size, created_at FROM material_files WHERE material_id = ? ORDER BY created_at").bind(materialId).all();
    return json({ files: files.results || [], is_preview: isAdmin && (material.is_published !== 1 || material.case_status !== "active") });
  }

  const privateFileRoute = url.pathname.match(/^\/api\/material-files\/([a-f0-9]+)$/);
  if (request.method === "GET" && privateFileRoute) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    // Read only metadata first. The file BLOB is sliced into small pieces below
    // so a single large D1 result does not have to be held in Worker memory.
    const file = await env.DB.prepare(
      "SELECT f.id, f.file_name, f.content_type, f.file_size, m.id AS material_id, m.is_published, m.delivery_mode, c.status AS case_status FROM material_files f JOIN materials m ON m.id = f.material_id JOIN cases c ON c.id = m.case_id WHERE f.id = ?"
    ).bind(privateFileRoute[1]).first();
    if (!file) return json({ error: "Файл не найден." }, 404);
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    if (!isAdmin && (file.is_published !== 1 || file.case_status !== "active")) return json({ error: "Файл недоступен." }, 403);
    if (!isAdmin && file.delivery_mode === "triggered") {
      const unlocked = await env.DB.prepare("SELECT 1 FROM material_unlocks WHERE user_id = ? AND material_id = ? AND unlocked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(user.id, file.material_id).first();
      if (!unlocked) return json({ error: "Файл ещё не открыт." }, 403);
    }
    const safeName = String(file.file_name || "attachment").replace(/[\\r\\n"]/g, "_");
    const totalSize = Number(file.file_size) || 0;
    if (!totalSize) return json({ error: "Файл отсутствует в хранилище." }, 404);
    const chunkSize = 64 * 1024;
    let offset = 0;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          if (offset >= totalSize) {
            controller.close();
            return;
          }
          // SQLite substr() uses 1-based offsets and preserves the BLOB type.
          const row = await env.DB.prepare(
            "SELECT substr(file_data, ?, ?) AS chunk FROM material_files WHERE id = ?"
          ).bind(offset + 1, Math.min(chunkSize, totalSize - offset), file.id).first();
          if (!row || row.chunk == null) {
            controller.error(new Error("Не удалось прочитать часть файла из D1."));
            return;
          }
          let bytes = row.chunk;
          if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
          else if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
          if (!bytes.byteLength) {
            controller.error(new Error("Получена пустая часть файла из D1."));
            return;
          }
          offset += bytes.byteLength;
          controller.enqueue(bytes);
          if (offset >= totalSize) controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
    return new Response(body, {
      headers: {
        "content-type": file.content_type || "application/octet-stream",
        "content-length": String(totalSize),
        "content-disposition": "inline; filename*=UTF-8''" + encodeURIComponent(safeName),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; frame-ancestors 'self'"
      }
    });
  }

  const playerReadRoute = url.pathname.match(/^\/api\/player\/materials\/([a-f0-9]+)\/read$/);
  if (request.method === "POST" && playerReadRoute) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    const materialId = playerReadRoute[1];
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    const material = await env.DB.prepare("SELECT m.id, m.case_id, m.delivery_mode, m.is_published, c.status AS case_status FROM materials m JOIN cases c ON c.id = m.case_id WHERE m.id = ?").bind(materialId).first();
    if (!material) return json({ error: "Материал не найден." }, 404);
    const isLiveMaterial = material.is_published === 1 && material.case_status === "active";
    if (!isAdmin && !isLiveMaterial) return json({ error: "Материал недоступен." }, 403);
    if (!isAdmin && material.delivery_mode === "triggered") {
      const unlocked = await env.DB.prepare("SELECT 1 FROM material_unlocks WHERE user_id = ? AND material_id = ? AND unlocked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(user.id, materialId).first();
      if (!unlocked) return json({ error: "Этот материал ещё не открыт." }, 403);
    }
    await env.DB.prepare("INSERT OR IGNORE INTO player_material_reads (user_id, material_id) VALUES (?, ?)").bind(user.id, materialId).run();
    if (isLiveMaterial) {
      await env.DB.prepare("INSERT OR IGNORE INTO material_unlocks (user_id, material_id, unlocked_at) SELECT ?, id, CASE WHEN material_type = 'email' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 minute') ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END FROM materials WHERE trigger_material_id = ? AND delivery_mode = 'triggered' AND is_published = 1").bind(user.id, materialId).run();
    }
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/player/search") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    const query = (url.searchParams.get("q") || "").trim();
    if (query.length < 2) return json({ results: [] });
    const needle = query.toLocaleLowerCase("ru-RU");
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    const candidates = await env.DB.prepare(
      "SELECT m.id, m.case_id, c.title AS case_title, m.title, m.summary, m.content, EXISTS(SELECT 1 FROM player_material_reads r WHERE r.user_id = ? AND r.material_id = m.id) AS is_read, 0 AS is_preview FROM materials m JOIN cases c ON c.id = m.case_id WHERE c.status = 'active' AND m.is_published = 1 AND m.is_searchable = 1 AND (m.delivery_mode = 'automatic' OR EXISTS(SELECT 1 FROM material_unlocks u WHERE u.user_id = ? AND u.material_id = m.id AND u.unlocked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) ORDER BY m.release_order, m.created_at LIMIT 200"
    ).bind(user.id, user.id).all();
    let searchableMaterials = candidates.results || [];
    if (isAdmin) {
      const drafts = await env.DB.prepare(
        "SELECT m.id, m.case_id, c.title AS case_title, m.title, m.summary, m.content, 1 AS is_read, 1 AS is_preview FROM materials m JOIN cases c ON c.id = m.case_id WHERE m.is_searchable = 1 AND (c.status = 'draft' OR m.is_published = 0) ORDER BY m.release_order, m.created_at LIMIT 200"
      ).all();
      searchableMaterials = [...searchableMaterials, ...(drafts.results || [])];
    }
    const filtered = searchableMaterials.filter(item =>
      [item.title, item.summary, item.content].some(value => String(value || "").toLocaleLowerCase("ru-RU").includes(needle))
    );
    return json({ results: filtered.slice(0, 30) });
  }

  if (request.method === "GET" && url.pathname === "/api/player/archive") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
    let cases = await env.DB.prepare(
      "SELECT id, title, case_code, description, status FROM cases WHERE status = 'active' ORDER BY created_at"
    ).all();
    let materials = await env.DB.prepare(
      "SELECT materials.id, materials.case_id, cases.title AS case_title, materials.material_type, materials.title, materials.summary, materials.content, materials.release_order, materials.created_at, materials.sender_name, materials.sender_address, materials.sent_at, materials.is_published, 0 AS is_preview, EXISTS(SELECT 1 FROM player_material_reads r WHERE r.user_id = ? AND r.material_id = materials.id) AS is_read FROM materials JOIN cases ON cases.id = materials.case_id WHERE cases.status = 'active' AND materials.is_published = 1 AND (materials.delivery_mode = 'automatic' OR EXISTS(SELECT 1 FROM material_unlocks u WHERE u.user_id = ? AND u.material_id = materials.id AND u.unlocked_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) ORDER BY cases.created_at, materials.release_order, materials.created_at"
    ).bind(user.id, user.id).all();
    if (isAdmin) {
      const draftCases = await env.DB.prepare(
        "SELECT id, title, case_code, description, status FROM cases WHERE status = 'draft' ORDER BY created_at DESC"
      ).all();
      const draftMaterials = await env.DB.prepare(
        "SELECT materials.id, materials.case_id, cases.title AS case_title, materials.material_type, materials.title, materials.summary, materials.content, materials.release_order, materials.created_at, materials.sender_name, materials.sender_address, materials.sent_at, materials.is_published, 1 AS is_preview, EXISTS(SELECT 1 FROM player_material_reads r WHERE r.user_id = ? AND r.material_id = materials.id) AS is_read FROM materials JOIN cases ON cases.id = materials.case_id WHERE cases.status = 'draft' OR materials.is_published = 0 ORDER BY cases.created_at DESC, materials.release_order, materials.created_at"
      ).bind(user.id).all();
      cases = { results: [...(cases.results || []), ...(draftCases.results || [])] };
      materials = { results: [...(materials.results || []), ...(draftMaterials.results || [])] };
    }
    return json({ cases: cases.results || [], materials: materials.results || [] });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    if (user.email.toLowerCase() !== ADMIN_EMAIL) {
      return json({ error: "Доступ к панели администратора запрещён." }, 403);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
      const cases = await env.DB.prepare(
        "SELECT id, title, case_code, description, status, created_at FROM cases ORDER BY created_at DESC"
      ).all();
      const materials = await env.DB.prepare(
        "SELECT materials.id, materials.case_id, cases.title AS case_title, materials.material_type, materials.title, materials.summary, materials.release_order, materials.is_published, materials.delivery_mode, materials.trigger_material_id, materials.is_searchable, materials.sender_name, materials.sender_address, materials.sent_at, materials.created_at FROM materials JOIN cases ON cases.id = materials.case_id ORDER BY materials.created_at DESC"
      ).all();
      return json({ cases: cases.results || [], materials: materials.results || [] });
    }


    const resetProgressRoute = url.pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/reset-progress$/);
    if (request.method === "POST" && resetProgressRoute) {
      const caseId = resetProgressRoute[1];
      const existing = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(caseId).first();
      if (!existing) return json({ error: "Дело не найдено." }, 404);

      const results = await env.DB.batch([
        env.DB.prepare("DELETE FROM player_material_reads WHERE user_id = ? AND material_id IN (SELECT id FROM materials WHERE case_id = ?)").bind(user.id, caseId),
        env.DB.prepare("DELETE FROM material_unlocks WHERE user_id = ? AND material_id IN (SELECT id FROM materials WHERE case_id = ?)").bind(user.id, caseId),
        env.DB.prepare("DELETE FROM player_progress WHERE user_id = ? AND case_id = ?").bind(user.id, caseId),
        env.DB.prepare("DELETE FROM player_notes WHERE user_id = ? AND case_id = ?").bind(user.id, caseId),
        env.DB.prepare("DELETE FROM player_clues WHERE user_id = ? AND case_id = ?").bind(user.id, caseId)
      ]);
      const removed = (results || []).reduce((sum, item) => sum + Number(item.meta?.changes || 0), 0);
      return json({ ok: true, removedRecords: removed });
    }

    const caseStatusRoute = url.pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/status$/);
    if (request.method === "POST" && caseStatusRoute) {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Проверьте действие." }, 400); }
      if (!["draft", "active"].includes(body.status)) return json({ error: "Недопустимый статус дела." }, 400);
      const existing = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(caseStatusRoute[1]).first();
      if (!existing) return json({ error: "Дело не найдено." }, 404);
      await env.DB.prepare("UPDATE cases SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(body.status, caseStatusRoute[1]).run();
      return json({ ok: true, status: body.status });
    }

    const uploadFilesRoute = url.pathname.match(/^\/api\/admin\/materials\/([a-f0-9]+)\/files$/);
    if (request.method === "POST" && uploadFilesRoute) {
      const materialId = uploadFilesRoute[1];
      const material = await env.DB.prepare("SELECT id FROM materials WHERE id = ?").bind(materialId).first();
      if (!material) return json({ error: "Материал не найден." }, 404);
      let form;
      try { form = await request.formData(); } catch { return json({ error: "Не удалось прочитать выбранные файлы." }, 400); }
      const uploads = form.getAll("files").filter(file => file && typeof file.arrayBuffer === "function" && file.size > 0);
      if (!uploads.length) return json({ error: "Выберите хотя бы один файл." }, 400);
      if (uploads.length > 8) return json({ error: "За один раз можно добавить не более 8 файлов." }, 400);
      const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "audio/mpeg", "audio/wav", "audio/ogg"]);
      for (const file of uploads) {
        if (!allowed.has(file.type)) return json({ error: "Поддерживаются PDF, JPG, PNG, WEBP, GIF, MP3, WAV и OGG." }, 400);
        if (file.size > 1 * 1024 * 1024) return json({ error: "Размер одного файла не должен превышать 1 МБ. Большие файлы можно будет подключить позже через отдельное хранилище." }, 400);
      }
      const saved = [];
      for (const file of uploads) {
        const id = randomToken(16);
        const originalName = String(file.name || "attachment").replace(/[\r\n]/g, "_").slice(0, 180);
        try {
          const fileData = new Uint8Array(await file.arrayBuffer());
          await env.DB.prepare(
            "INSERT INTO material_files (id, material_id, file_name, content_type, file_size, object_key, file_data) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(id, materialId, originalName, file.type, file.size, id, fileData).run();
        } catch (error) {
          console.error("Material attachment save failed:", error);
          const reason = error && error.message ? String(error.message).slice(0, 240) : "неизвестная ошибка базы данных";
          return json({ error: "Материал сохранён, но фотографию «" + originalName + "» не удалось записать. Причина: " + reason }, 500);
        }
        saved.push({ id, file_name: originalName, content_type: file.type, file_size: file.size });
      }
      return json({ ok: true, files: saved });
    }

    const deleteFileRoute = url.pathname.match(/^\/api\/admin\/material-files\/([a-f0-9]+)$/);
    if (request.method === "DELETE" && deleteFileRoute) {
      const file = await env.DB.prepare("SELECT id FROM material_files WHERE id = ?").bind(deleteFileRoute[1]).first();
      if (!file) return json({ error: "Файл не найден." }, 404);
      await env.DB.prepare("DELETE FROM material_files WHERE id = ?").bind(file.id).run();
      return json({ ok: true });
    }

    const materialRoute = url.pathname.match(/^\/api\/admin\/materials\/([a-f0-9]+)(?:\/(publish))?$/);
    if (materialRoute) {
      const materialId = materialRoute[1];
      const isPublishRoute = materialRoute[2] === "publish";
      if (request.method === "GET" && !isPublishRoute) {
        const material = await env.DB.prepare(
          "SELECT id, case_id, material_type, title, summary, content, release_order, is_published, delivery_mode, trigger_material_id, is_searchable, sender_name, sender_address, sent_at FROM materials WHERE id = ?"
        ).bind(materialId).first();
        if (!material) return json({ error: "Материал не найден." }, 404);
        return json({ material });
      }

      if (request.method === "PUT" && !isPublishRoute) {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Проверьте введённые данные." }, 400); }
        const caseId = String(body.caseId || "");
        const type = String(body.type || "");
        const title = String(body.title || "").trim();
        const summary = String(body.summary || "").trim();
        const content = String(body.content || "").trim();
        const releaseOrder = Number(body.releaseOrder ?? 0);
        const deliveryMode = String(body.deliveryMode || "automatic");
        const triggerMaterialId = String(body.triggerMaterialId || "") || null;
        const isSearchable = body.isSearchable ? 1 : 0;
        const senderName = String(body.senderName || "").trim();
        const senderAddress = String(body.senderAddress || "").trim();
        const sentAt = String(body.sentAt || "").trim();
        const allowedTypes = ["email", "publication", "document", "photo", "audio", "map", "other"];
        if (!caseId || !allowedTypes.includes(type) || !title || title.length > 200 ||
            summary.length > 1000 || content.length > 50000 ||
            !["automatic", "triggered"].includes(deliveryMode) || (deliveryMode === "triggered" && (!triggerMaterialId || triggerMaterialId === materialId)) ||
            (type === "email" && (senderName.length > 120 || senderAddress.length > 200 || sentAt.length > 40)) ||
            !Number.isInteger(releaseOrder) || releaseOrder < 0 || releaseOrder > 100000) {
          return json({ error: "Проверьте тип, название, текст и порядок открытия материала." }, 400);
        }
        const targetCase = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(caseId).first();
        if (!targetCase) return json({ error: "Выбранное дело не найдено." }, 404);
        const existing = await env.DB.prepare("SELECT id FROM materials WHERE id = ?").bind(materialId).first();
        if (!existing) return json({ error: "Материал не найден." }, 404);
        if (deliveryMode === "triggered") {
          const prerequisite = await env.DB.prepare("SELECT id FROM materials WHERE id = ? AND case_id = ?").bind(triggerMaterialId, caseId).first();
          if (!prerequisite) return json({ error: "Выберите существующий материал из этого дела как условие открытия." }, 400);
        }
        await env.DB.prepare(
          "UPDATE materials SET case_id = ?, material_type = ?, title = ?, summary = ?, content = ?, release_order = ?, delivery_mode = ?, trigger_material_id = ?, is_searchable = ?, sender_name = ?, sender_address = ?, sent_at = ? WHERE id = ?"
        ).bind(caseId, type, title, summary, content, releaseOrder, deliveryMode, deliveryMode === "triggered" ? triggerMaterialId : null, type === "document" ? isSearchable : 0, type === "email" ? senderName : "", type === "email" ? senderAddress : "", type === "email" ? sentAt : "", materialId).run();
        return json({ ok: true });
      }

      if (request.method === "DELETE" && !isPublishRoute) {
        const existing = await env.DB.prepare(
          "SELECT id, is_published FROM materials WHERE id = ?"
        ).bind(materialId).first();
        if (!existing) return json({ error: "Материал не найден." }, 404);
        if (existing.is_published === 1) {
          return json({ error: "Опубликованный материал нельзя удалить. Сначала снимите его с публикации." }, 409);
        }
        await env.DB.prepare("DELETE FROM material_unlocks WHERE material_id = ?").bind(materialId).run();
        await env.DB.prepare("DELETE FROM player_material_reads WHERE material_id = ?").bind(materialId).run();
        await env.DB.prepare("DELETE FROM material_files WHERE material_id = ?").bind(materialId).run();
        await env.DB.prepare("UPDATE materials SET trigger_material_id = NULL WHERE trigger_material_id = ?").bind(materialId).run();
        await env.DB.prepare("DELETE FROM materials WHERE id = ? AND is_published = 0").bind(materialId).run();
        return json({ ok: true });
      }

      if (request.method === "POST" && isPublishRoute) {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Проверьте действие." }, 400); }
        if (typeof body.published !== "boolean") return json({ error: "Не указано состояние публикации." }, 400);
        const existing = await env.DB.prepare("SELECT id FROM materials WHERE id = ?").bind(materialId).first();
        if (!existing) return json({ error: "Материал не найден." }, 404);
        await env.DB.prepare("UPDATE materials SET is_published = ? WHERE id = ?")
          .bind(body.published ? 1 : 0, materialId).run();
        if (body.published) {
          await env.DB.prepare("INSERT INTO material_unlocks (user_id, material_id, unlocked_at) SELECT r.user_id, m.id, CASE WHEN m.material_type = 'email' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 minute') ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END FROM player_material_reads r JOIN materials m ON m.id = ? WHERE r.material_id = m.trigger_material_id AND m.delivery_mode = 'triggered' ON CONFLICT(user_id, material_id) DO UPDATE SET unlocked_at = excluded.unlocked_at").bind(materialId).run();
        }
        return json({ ok: true, published: body.published });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/cases") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Проверьте введённые данные." }, 400); }
      const title = String(body.title || "").trim();
      const caseCode = String(body.caseCode || "").trim().toUpperCase();
      const description = String(body.description || "").trim();
      if (!title || title.length > 160 || !/^[A-Z0-9_-]{2,32}$/.test(caseCode) || description.length > 1000) {
        return json({ error: "Проверьте название, код дела и описание." }, 400);
      }
      const id = randomToken(16);
      try {
        await env.DB.prepare(
          "INSERT INTO cases (id, title, case_code, description, status) VALUES (?, ?, ?, ?, 'draft')"
        ).bind(id, title, caseCode, description).run();
      } catch {
        return json({ error: "Не удалось создать дело. Возможно, такой код уже используется." }, 409);
      }
      return json({ ok: true, id });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/materials") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Проверьте введённые данные." }, 400); }
      const caseId = String(body.caseId || "");
      const type = String(body.type || "");
      const title = String(body.title || "").trim();
      const summary = String(body.summary || "").trim();
      const content = String(body.content || "").trim();
      const releaseOrder = Number(body.releaseOrder ?? 0);
      const deliveryMode = String(body.deliveryMode || "automatic");
      const triggerMaterialId = String(body.triggerMaterialId || "") || null;
      const isSearchable = body.isSearchable ? 1 : 0;
      const senderName = String(body.senderName || "").trim();
      const senderAddress = String(body.senderAddress || "").trim();
      const sentAt = String(body.sentAt || "").trim();
      const allowedTypes = ["email", "publication", "document", "photo", "audio", "map", "other"];
      if (!caseId || !allowedTypes.includes(type) || !title || title.length > 200 ||
          summary.length > 1000 || content.length > 50000 ||
          !["automatic", "triggered"].includes(deliveryMode) || (deliveryMode === "triggered" && !triggerMaterialId) ||
          (type === "email" && (senderName.length > 120 || senderAddress.length > 200 || sentAt.length > 40)) ||
          !Number.isInteger(releaseOrder) || releaseOrder < 0 || releaseOrder > 100000) {
        return json({ error: "Проверьте тип, название, текст и порядок открытия материала." }, 400);
      }
      const targetCase = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(caseId).first();
      if (!targetCase) return json({ error: "Выбранное дело не найдено." }, 404);
      if (deliveryMode === "triggered") {
        const prerequisite = await env.DB.prepare("SELECT id FROM materials WHERE id = ? AND case_id = ?").bind(triggerMaterialId, caseId).first();
        if (!prerequisite) return json({ error: "Выберите существующий материал из этого дела как условие открытия." }, 400);
      }
      const id = randomToken(16);
      await env.DB.prepare(
        "INSERT INTO materials (id, case_id, material_type, title, summary, content, release_order, is_published, delivery_mode, trigger_material_id, is_searchable, sender_name, sender_address, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)"
      ).bind(id, caseId, type, title, summary, content, releaseOrder, deliveryMode, deliveryMode === "triggered" ? triggerMaterialId : null, type === "document" ? isSearchable : 0, type === "email" ? senderName : "", type === "email" ? senderAddress : "", type === "email" ? sentAt : "").run();
      return json({ ok: true, id });
    }

    return json({ error: "Не найдено." }, 404);
  }

  if (request.method === "POST" && (url.pathname === "/api/register" || url.pathname === "/api/login")) {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Проверьте введённые данные." }, 400); }
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "Введите корректный адрес электронной почты." }, 400);
    }
    if (password.length < 10 || password.length > 200) {
      return json({ error: "Пароль должен содержать от 10 до 200 символов." }, 400);
    }

    if (url.pathname === "/api/register") {
      const salt = randomToken(16);
      const hash = await passwordHash(password, salt);
      const userId = randomToken(16);
      try {
        await env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)"
        ).bind(userId, email, hash, salt).run();
      } catch {
        return json({ error: "Аккаунт с таким адресом уже существует или регистрация временно недоступна." }, 409);
      }
    }

    const user = await env.DB.prepare(
      "SELECT id, email, password_hash, password_salt FROM users WHERE email = ?"
    ).bind(email).first();
    if (!user) return json({ error: "Неверный адрес электронной почты или пароль." }, 401);
    if (url.pathname === "/api/login") {
      const candidate = await passwordHash(password, user.password_salt);
      if (candidate !== user.password_hash) {
        return json({ error: "Неверный адрес электронной почты или пароль." }, 401);
      }
    }

    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(randomToken(16), user.id, tokenHash, expiresAt).run();
    return json(
      { ok: true, user: { email: user.email } },
      200,
      { "set-cookie": sessionCookie(token, 30 * 24 * 60 * 60) }
    );
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const token = cookieValue(request, "iterum_session");
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    }
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  return json({ error: "Не найдено." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        if (!env.DB) return json({ error: "База данных пока не подключена." }, 503);
        return await handleApi(request, env);
      } catch {
        return json({ error: "Внутренняя ошибка. Попробуйте позже." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
