// ── Gestión del token ──────────────────────────────────────────────
function getToken() {
  return localStorage.getItem("srs_token");
}
function setToken(t) {
  localStorage.setItem("srs_token", t);
}
function removeToken() {
  localStorage.removeItem("srs_token");
  localStorage.removeItem("srs_admin");
}
function getAdmin() {
  const a = localStorage.getItem("srs_admin");
  return a ? JSON.parse(a) : null;
}
function setAdmin(a) {
  localStorage.setItem("srs_admin", JSON.stringify(a));
}
function estaLogueado() {
  return !!getToken();
}

// ── Fetch con auth ──────────────────────────────────────────────────
async function apiFetch(path, opciones = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(opciones.headers || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opciones, headers });
  const data = await res.json();

  if (res.status === 401) {
    removeToken();
    window.location.href = "/pages/login.html";
    return;
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ── Helpers de auth ─────────────────────────────────────────────────
async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  setAdmin(data.admin);
  return data;
}

async function logout() {
  removeToken();
  window.location.href = "/pages/login.html";
}

// ── Helpers de datos ────────────────────────────────────────────────
async function fetchResultado(liga, temporada, carrera, sesion = "carrera") {
  return apiFetch(
    `/resultado?liga=${liga}&temporada=${temporada}&carrera=${carrera}&sesion=${sesion}`,
  );
}

async function fetchClasificacion(liga, temporada) {
  return apiFetch(`/clasificacion?liga=${liga}&temporada=${temporada}`);
}

async function fetchCalendario(liga, temporada) {
  return apiFetch(`/calendario?liga=${liga}&temporada=${temporada}`);
}

async function fetchMisLigas() {
  return apiFetch("/ligas");
}

async function crearLiga(datos) {
  return apiFetch("/ligas", { method: "POST", body: JSON.stringify(datos) });
}

async function sincronizarLiga(ligaId) {
  return apiFetch(`/ligas/${ligaId}/sync`, { method: "POST" });
}

async function fetchTorneos(ligaId) {
  return apiFetch(`/torneos?liga=${ligaId}`);
}

async function fetchTorneo(torneoId) {
  return apiFetch(`/torneos/${torneoId}`);
}

async function crearTorneo(datos) {
  return apiFetch("/torneos", { method: "POST", body: JSON.stringify(datos) });
}

async function iniciarTorneo(torneoId) {
  return apiFetch(`/torneos/${torneoId}/iniciar`, { method: "POST" });
}

async function actualizarPartido(torneoId, datos) {
  return apiFetch(`/torneos/${torneoId}/partido`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

// ── Helpers de Copas ────────────────────────────────────────────────
async function fetchMisCopas() {
  return apiFetch("/copas");
}

async function fetchCopa(copaId) {
  return apiFetch(`/copas/${copaId}`);
}

async function crearCopa(datos) {
  return apiFetch("/copas", { method: "POST", body: JSON.stringify(datos) });
}

async function registrarJornada(copaId, numero, ordenLlegada) {
  return apiFetch(`/copas/${copaId}/jornada/${numero}`, {
    method: "PUT",
    body: JSON.stringify({ ordenLlegada }),
  });
}

async function generarBracket(copaId) {
  return apiFetch(`/copas/${copaId}/generar-bracket`, { method: "POST" });
}

async function registrarGanadorPartido(copaId, ronda, orden, ganador) {
  return apiFetch(`/copas/${copaId}/partido`, {
    method: "PUT",
    body: JSON.stringify({ ronda, orden, ganador }),
  });
}

async function borrarCopa(copaId) {
  return apiFetch(`/copas/${copaId}`, { method: "DELETE" });
}
