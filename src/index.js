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


  if (request.method === "GET" && url.pathname === "/api/player/archive") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Требуется вход в аккаунт." }, 401);
    const cases = await env.DB.prepare(
      "SELECT id, title, case_code, description FROM cases WHERE status = 'active' ORDER BY created_at"
    ).all();
    const materials = await env.DB.prepare(
      "SELECT materials.id, materials.case_id, materials.material_type, materials.title, materials.summary, materials.content, materials.release_order, materials.created_at FROM materials JOIN cases ON cases.id = materials.case_id WHERE cases.status = 'active' AND materials.is_published = 1 ORDER BY cases.created_at, materials.release_order, materials.created_at"
    ).all();
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
        "SELECT materials.id, materials.case_id, cases.title AS case_title, materials.material_type, materials.title, materials.summary, materials.release_order, materials.is_published, materials.created_at FROM materials JOIN cases ON cases.id = materials.case_id ORDER BY materials.created_at DESC"
      ).all();
      return json({ cases: cases.results || [], materials: materials.results || [] });
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

    const materialRoute = url.pathname.match(/^\/api\/admin\/materials\/([a-f0-9]+)(?:\/(publish))?$/);
    if (materialRoute) {
      const materialId = materialRoute[1];
      const isPublishRoute = materialRoute[2] === "publish";
      if (request.method === "GET" && !isPublishRoute) {
        const material = await env.DB.prepare(
          "SELECT id, case_id, material_type, title, summary, content, release_order, is_published FROM materials WHERE id = ?"
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
        const allowedTypes = ["email", "publication", "document", "photo", "audio", "map", "other"];
        if (!caseId || !allowedTypes.includes(type) || !title || title.length > 200 ||
            summary.length > 1000 || content.length > 50000 ||
            !Number.isInteger(releaseOrder) || releaseOrder < 0 || releaseOrder > 100000) {
          return json({ error: "Проверьте тип, название, текст и порядок открытия материала." }, 400);
        }
        const targetCase = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(caseId).first();
        if (!targetCase) return json({ error: "Выбранное дело не найдено." }, 404);
        const existing = await env.DB.prepare("SELECT id FROM materials WHERE id = ?").bind(materialId).first();
        if (!existing) return json({ error: "Материал не найден." }, 404);
        await env.DB.prepare(
          "UPDATE materials SET case_id = ?, material_type = ?, title = ?, summary = ?, content = ?, release_order = ? WHERE id = ?"
        ).bind(caseId, type, title, summary, content, releaseOrder, materialId).run();
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
      const allowedTypes = ["email", "publication", "document", "photo", "audio", "map", "other"];
      if (!caseId || !allowedTypes.includes(type) || !title || title.length > 200 ||
          summary.length > 1000 || content.length > 50000 ||
          !Number.isInteger(releaseOrder) || releaseOrder < 0 || releaseOrder > 100000) {
        return json({ error: "Проверьте тип, название, текст и порядок открытия материала." }, 400);
      }
      const targetCase = await env.DB.prepare("SELECT id FROM cases WHERE id = ?").bind(caseId).first();
      if (!targetCase) return json({ error: "Выбранное дело не найдено." }, 404);
      const id = randomToken(16);
      await env.DB.prepare(
        "INSERT INTO materials (id, case_id, material_type, title, summary, content, release_order, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
      ).bind(id, caseId, type, title, summary, content, releaseOrder).run();
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
