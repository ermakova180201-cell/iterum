const encoder = new TextEncoder();

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
    return json({ authenticated: !!user, user: user ? { email: user.email } : null });
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
