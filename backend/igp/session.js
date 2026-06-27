/**
 * backend/igp/session.js
 *
 * Gestiona la sesión con iGPManager.
 * - Hace login con las credenciales del .env (IGP_EMAIL / IGP_PASSWORD)
 * - Cachea el cookie de sesión en memoria (se pierde al reiniciar)
 * - Se renueva automáticamente al expirar
 *
 * NOTA: si el login falla con 401/403, abre iGPManager en el navegador,
 * inspecciona Network → la petición de login → copia el endpoint y body exactos
 * y ajusta LOGIN_URL / loginBody() debajo.
 */

const fetch = require("node-fetch");

const BASE = "https://igpmanager.com/index.php";
const LOGIN_URL = `${BASE}?action=logon&addon=igp&ajax=1&jsReply=logon`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9",
};

let _cookie = null;
let _expiry = 0;
const SESSION_TTL_MS = 55 * 60 * 1000; // renovar cada 55 min

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
  const email = process.env.IGP_EMAIL;
  const password = process.env.IGP_PASSWORD;

  if (!email || !password) {
    throw new Error("Faltan IGP_EMAIL o IGP_PASSWORD en el .env del backend");
  }

  const body = new URLSearchParams({
    email,
    password,
    csrfName: "",
    csrfToken: "",
  });

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: body.toString(),
    redirect: "manual",
  });

  // Capturar cookies de la respuesta
  const rawCookies = res.headers.raw()["set-cookie"] || [];
  if (!rawCookies.length) {
    // Si no hay cookies, puede que las credenciales sean incorrectas
    const text = await res.text().catch(() => "");
    throw new Error(
      `iGPManager login fallido (${res.status}). ` +
        `Verifica IGP_EMAIL y IGP_PASSWORD. Respuesta: ${text.slice(0, 200)}`,
    );
  }

  // Unir solo la parte "name=value" de cada cookie
  _cookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  _expiry = Date.now() + SESSION_TTL_MS;

  console.log("✅ Sesión iGPManager renovada");
  return _cookie;
}

// ─── Obtener sesión (renovando si es necesario) ───────────────────────────────
async function getSession() {
  if (!_cookie || Date.now() > _expiry) {
    await login();
  }
  return _cookie;
}

// ─── Fetch autenticado contra iGPManager ─────────────────────────────────────
async function igpFetch(params) {
  const cookie = await getSession();
  const url = `${BASE}?${params}&csrfName=&csrfToken=`;

  const res = await fetch(url, {
    headers: { ...HEADERS, Cookie: cookie },
  });

  if (!res.ok) {
    throw new Error(`iGPManager error ${res.status} para: ${params}`);
  }

  const data = await res.json();

  // Si iGP devuelve un indicador de sesión caducada, relanzar login una vez
  if (data && data.error === "session_expired") {
    _cookie = null;
    const cookie2 = await getSession();
    const res2 = await fetch(url, { headers: { ...HEADERS, Cookie: cookie2 } });
    return res2.json();
  }

  return data;
}

module.exports = { igpFetch, login };
