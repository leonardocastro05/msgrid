// ── Estado del wizard ──────────────────────────────────────────────────────
let wizardPaso = 1;
const WIZARD_TOTAL_PASOS = 5;

document.addEventListener("DOMContentLoaded", () => {
  protegerPagina();
  pintarAdminTag();
  cargarCopas();
  construirPuntosGrid(10);

  document
    .getElementById("wBanner")
    .addEventListener("change", previsualizarBanner);
  document
    .getElementById("wParticipantes")
    .addEventListener("input", actualizarContadorParticipantes);
  document
    .getElementById("wClasificados")
    .addEventListener("input", actualizarHintClasificados);
});

// Cubre el caso de volver atrás desde copa.html (caché del navegador)
window.addEventListener("pageshow", (e) => {
  if (e.persisted) cargarCopas();
});

// ── Auth helpers ──────────────────────────────────────────────────────────
function protegerPagina() {
  if (!estaLogueado()) window.location.href = "login.html";
}

function pintarAdminTag() {
  const admin = getAdmin();
  document.getElementById("adminTag").textContent = admin?.username || "";
}

// ── Cargar y pintar copas ─────────────────────────────────────────────────
async function cargarCopas() {
  try {
    const res = await fetchMisCopas();
    pintarCopas(res.copas || []);
  } catch (err) {
    console.error("Error cargando copas:", err.message);
  }
}

function pintarCopas(copas) {
  const grid = document.getElementById("copasGrid");
  const empty = document.getElementById("emptyState");

  if (!copas.length) {
    grid.style.display = "none";
    empty.style.display = "block";
    return;
  }

  grid.style.display = "grid";
  empty.style.display = "none";

  const SERVER_BASE = API_BASE.replace("/api", "");

  grid.innerHTML = copas
    .map((copa) => {
      const bannerUrl = copa.bannerUrl
        ? copa.bannerUrl.startsWith("http")
          ? copa.bannerUrl
          : `${SERVER_BASE}${copa.bannerUrl}`
        : "";

      const bannerStyle = bannerUrl
        ? `background-image: url('${escapeAttr(bannerUrl)}')`
        : "";

      const faseLabel =
        {
          jornadas: "Jornadas",
          eliminatoria: "Eliminatoria",
          finalizado: "Finalizada",
        }[copa.fase] || copa.fase;

      return `
        <div class="copa-card" onclick="abrirCopa('${copa._id}')">
          <div class="copa-banner" style="${bannerStyle}">
            <span class="copa-fase-tag ${copa.fase}">${faseLabel}</span>
          </div>
          <div class="copa-body">
            <div class="copa-nombre">${escapeHtml(copa.nombre)}</div>
            <div class="copa-meta">
              <span><span class="material-icons">groups</span> ${copa.participantes?.length || 0}</span>
              <span><span class="material-icons">calendar_today</span> ${copa.numJornadas} jornadas</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function abrirCopa(id) {
  window.location.href = `copa.html?id=${id}`;
}

// ── Banner: previsualización y subida ─────────────────────────────────────
function previsualizarBanner() {
  const input = document.getElementById("wBanner");
  const file = input.files[0];
  const preview = document.getElementById("bannerPreview");
  const img = document.getElementById("bannerImg");
  const texto = document.getElementById("bannerUploadText");

  if (file) {
    img.src = URL.createObjectURL(file);
    preview.style.display = "block";
    texto.textContent = file.name;
  } else {
    preview.style.display = "none";
    texto.textContent = "Seleccionar imagen…";
  }
}

async function subirBanner() {
  const input = document.getElementById("wBanner");
  if (!input.files || !input.files[0]) return "";

  const formData = new FormData();
  formData.append("banner", input.files[0]);

  const token = getToken();
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData, // sin Content-Type, el navegador lo pone solo
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error subiendo imagen");
  return data.url;
}

// ── Wizard: navegación ────────────────────────────────────────────────────
function abrirWizard() {
  wizardPaso = 1;
  document.getElementById("wizardOverlay").classList.add("open");
  document.getElementById("wNombre").value = "";
  document.getElementById("wBanner").value = "";
  document.getElementById("bannerPreview").style.display = "none";
  document.getElementById("bannerUploadText").textContent =
    "Seleccionar imagen…";
  document.getElementById("wParticipantes").value = "";
  document.getElementById("wJornadas").value = 10;
  document.getElementById("wClasificados").value = 8;
  construirPuntosGrid(10);
  actualizarContadorParticipantes();
  actualizarHintClasificados();
  renderizarPasoWizard();
}

function cerrarWizard() {
  document.getElementById("wizardOverlay").classList.remove("open");
  ocultarErrorWizard();
}

function renderizarPasoWizard() {
  document.querySelectorAll(".wizard-step").forEach((el) => {
    el.classList.toggle("active", parseInt(el.dataset.step, 10) === wizardPaso);
  });
  document.querySelectorAll(".wizard-steps span").forEach((el) => {
    const n = parseInt(el.dataset.step, 10);
    el.classList.remove("done", "active");
    if (n < wizardPaso) el.classList.add("done");
    if (n === wizardPaso) el.classList.add("active");
  });
  document.getElementById("wizardStepLabel").textContent =
    `Paso ${wizardPaso} de ${WIZARD_TOTAL_PASOS}`;
  document.getElementById("btnAtras").style.display =
    wizardPaso > 1 ? "inline-block" : "none";
  document.getElementById("btnSiguiente").textContent =
    wizardPaso === WIZARD_TOTAL_PASOS ? "Crear copa" : "Siguiente";

  if (wizardPaso === 5) pintarResumen();
  ocultarErrorWizard();
}

function wizardAtras() {
  if (wizardPaso > 1) {
    wizardPaso -= 1;
    renderizarPasoWizard();
  }
}

async function wizardSiguiente() {
  if (!validarPasoActual()) return;

  if (wizardPaso < WIZARD_TOTAL_PASOS) {
    wizardPaso += 1;
    renderizarPasoWizard();
  } else {
    await crearCopaDesdeWizard();
  }
}

function validarPasoActual() {
  ocultarErrorWizard();

  if (wizardPaso === 1) {
    const nombre = document.getElementById("wNombre").value.trim();
    if (!nombre) return mostrarErrorWizard("Ponle un nombre a la copa.");
  }

  if (wizardPaso === 2) {
    const lista = obtenerParticipantes();
    if (lista.length < 2)
      return mostrarErrorWizard("Necesitas al menos 2 participantes.");
  }

  if (wizardPaso === 4) {
    const jornadas = parseInt(document.getElementById("wJornadas").value, 10);
    const clasificados = parseInt(
      document.getElementById("wClasificados").value,
      10,
    );
    const totalParticipantes = obtenerParticipantes().length;

    if (!jornadas || jornadas < 1)
      return mostrarErrorWizard("El número de jornadas debe ser al menos 1.");
    if (!clasificados || clasificados < 2)
      return mostrarErrorWizard("Deben clasificar al menos 2 participantes.");
    if (clasificados > totalParticipantes)
      return mostrarErrorWizard(
        `No puedes clasificar a más de ${totalParticipantes} (el total de participantes).`,
      );
  }

  return true;
}

function mostrarErrorWizard(msg) {
  const el = document.getElementById("wizardError");
  el.textContent = msg;
  el.style.display = "block";
  return false;
}

function ocultarErrorWizard() {
  document.getElementById("wizardError").style.display = "none";
}

// ── Wizard: helpers de cada paso ──────────────────────────────────────────
function obtenerParticipantes() {
  return document
    .getElementById("wParticipantes")
    .value.split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

function actualizarContadorParticipantes() {
  const n = obtenerParticipantes().length;
  document.getElementById("contadorParticipantes").textContent =
    `${n} participante${n === 1 ? "" : "s"}`;
}

function actualizarHintClasificados() {
  const total = obtenerParticipantes().length;
  const clasificados =
    parseInt(document.getElementById("wClasificados").value, 10) || 0;
  const hint = document.getElementById("hintClasificados");
  if (total > 0) {
    hint.textContent = `De ${total} participantes, pasarán los ${clasificados} primeros de la clasificación general.`;
  } else {
    hint.textContent = "";
  }
}

function construirPuntosGrid(n) {
  const grid = document.getElementById("puntosGrid");
  const valoresActuales = leerTablaPuntos();
  const defaults = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  grid.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const valor =
      valoresActuales[i] !== undefined ? valoresActuales[i] : defaults[i] || 0;
    const slot = document.createElement("div");
    slot.className = "punto-slot";
    slot.innerHTML = `
      <label>P${i + 1}</label>
      <input type="number" min="0" value="${valor}" data-pos="${i}" />
    `;
    grid.appendChild(slot);
  }
}

function usarPuntosF1() {
  const defaults = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  document.querySelectorAll("#puntosGrid input").forEach((input, i) => {
    input.value = defaults[i] !== undefined ? defaults[i] : 0;
  });
}

function leerTablaPuntos() {
  return Array.from(document.querySelectorAll("#puntosGrid input")).map(
    (input) => parseInt(input.value, 10) || 0,
  );
}

function pintarResumen() {
  const nombre = document.getElementById("wNombre").value.trim();
  const bannerFile = document.getElementById("wBanner").files?.[0];
  const participantes = obtenerParticipantes();
  const jornadas = document.getElementById("wJornadas").value;
  const clasificados = document.getElementById("wClasificados").value;
  const tablaPuntos = leerTablaPuntos();

  document.getElementById("resumenList").innerHTML = `
    <div class="resumen-item"><span>Nombre</span><span>${escapeHtml(nombre)}</span></div>
    <div class="resumen-item"><span>Banner</span><span>${bannerFile ? escapeHtml(bannerFile.name) : "Por defecto"}</span></div>
    <div class="resumen-item"><span>Participantes</span><span>${participantes.length}</span></div>
    <div class="resumen-item"><span>Jornadas</span><span>${jornadas}</span></div>
    <div class="resumen-item"><span>Clasificados a octavos</span><span>${clasificados}</span></div>
    <div class="resumen-item"><span>Puntos (1º → último)</span><span>${tablaPuntos.join("-")}</span></div>
  `;
}

// ── Crear copa ────────────────────────────────────────────────────────────
async function crearCopaDesdeWizard() {
  const btn = document.getElementById("btnSiguiente");
  btn.disabled = true;
  btn.textContent = "Creando...";

  try {
    const bannerUrl = await subirBanner();

    const payload = {
      nombre: document.getElementById("wNombre").value.trim(),
      bannerUrl,
      participantes: obtenerParticipantes(),
      tablaPuntos: leerTablaPuntos(),
      numJornadas: parseInt(document.getElementById("wJornadas").value, 10),
      numClasificados: parseInt(
        document.getElementById("wClasificados").value,
        10,
      ),
    };

    const res = await crearCopa(payload);
    cerrarWizard();
    abrirCopa(res.copa._id);
  } catch (err) {
    mostrarErrorWizard(err.message || "No se pudo crear la copa.");
    btn.disabled = false;
    btn.textContent = "Crear copa";
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "%27").replace(/"/g, "%22");
}
