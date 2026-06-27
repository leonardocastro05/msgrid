// ── Estado global de la página ──────────────────────────────────────────────
let copaActual = null;
let copaId = null;
let jornadaActivaNum = 1;
let sortableInstance = null;
let partidoSeleccionado = null; // { ronda, orden } para el modal de ganador

document.addEventListener('DOMContentLoaded', () => {
  protegerPagina();

  const params = new URLSearchParams(window.location.search);
  copaId = params.get('id');

  if (!copaId) {
    window.location.href = 'dashboard.html';
    return;
  }

  cargarCopa();
});

function protegerPagina() {
  if (!estaLogueado()) {
    window.location.href = 'login.html';
  }
}

// ── Carga y render general ──────────────────────────────────────────────────
async function cargarCopa() {
  try {
    const res = await fetchCopa(copaId);
    copaActual = res.copa;
    pintarCabecera();
    pintarTabsDisponibles();

    // Si ya no estamos en fase de jornadas, ir directo a la pestaña relevante
    if (copaActual.fase === 'jornadas') {
      jornadaActivaNum = primeraJornadaIncompleta();
      pintarJornadaActiva();
      pintarCarrusel();
    } else {
      cambiarTab('bracket');
    }

    pintarClasificacion();
    pintarBracket();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo cargar la copa', true);
  }
}

function pintarCabecera() {
  document.getElementById('copaNombre').textContent = copaActual.nombre;
  if (copaActual.bannerUrl) {
    document.getElementById('copaBanner').style.backgroundImage = `url('${copaActual.bannerUrl}')`;
  }
  const faseLabels = { jornadas: 'Fase de jornadas', eliminatoria: 'Fase eliminatoria', finalizado: 'Finalizada' };
  const tag = document.getElementById('faseTag');
  tag.textContent = faseLabels[copaActual.fase] || copaActual.fase;
  tag.className = `copa-fase-tag ${copaActual.fase}`;
}

function pintarTabsDisponibles() {
  const tabJornadas = document.querySelector('.tab[data-panel="jornadas"]');
  // La pestaña de jornadas solo tiene sentido mientras estemos en esa fase
  if (copaActual.fase !== 'jornadas') {
    tabJornadas.style.display = 'none';
  }
}

function cambiarTab(panel) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === panel));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${panel}`));
}

// ── PANEL JORNADAS ───────────────────────────────────────────────────────────
function primeraJornadaIncompleta() {
  const incompleta = copaActual.jornadas.find((j) => !j.completada);
  return incompleta ? incompleta.numero : copaActual.jornadas[copaActual.jornadas.length - 1].numero;
}

function pintarJornadaActiva() {
  const jornada = copaActual.jornadas.find((j) => j.numero === jornadaActivaNum);
  document.getElementById('jornadaTitulo').textContent = `Jornada ${jornadaActivaNum}`;

  const statusEl = document.getElementById('jornadaStatus');
  statusEl.textContent = jornada.completada ? 'Completada' : 'Pendiente';
  statusEl.classList.toggle('completa', jornada.completada);

  // Orden a mostrar: si ya tiene resultado, ese orden; si no, el orden de los participantes tal cual
  const orden = jornada.completada && jornada.resultados.length
    ? jornada.resultados.map((r) => r.nombre)
    : [...copaActual.participantes];

  renderDragList(orden);
  actualizarBloqueGenerarBracket();
}

function renderDragList(ordenNombres) {
  const list = document.getElementById('dragList');
  const tabla = copaActual.tablaPuntos;

  list.innerHTML = ordenNombres.map((nombre, i) => `
    <div class="drag-item" data-nombre="${escapeAttr(nombre)}">
      <span class="drag-pos">${i + 1}</span>
      <span class="drag-handle"><span class="material-icons">drag_indicator</span></span>
      <span class="drag-name">${escapeHtml(nombre)}</span>
      <span class="drag-points">${tabla[i] || 0} pts</span>
    </div>
  `).join('');

  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = new Sortable(list, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: renumerarDragList,
  });
}

function renumerarDragList() {
  const items = document.querySelectorAll('#dragList .drag-item');
  const tabla = copaActual.tablaPuntos;
  items.forEach((item, i) => {
    item.querySelector('.drag-pos').textContent = i + 1;
    item.querySelector('.drag-points').textContent = `${tabla[i] || 0} pts`;
  });
}

async function guardarJornadaActual() {
  const items = document.querySelectorAll('#dragList .drag-item');
  const ordenLlegada = Array.from(items).map((item) => item.dataset.nombre);

  const btn = document.getElementById('btnGuardarJornada');
  btn.disabled = true;

  try {
    await registrarJornada(copaId, jornadaActivaNum, ordenLlegada);
    mostrarToast(`Jornada ${jornadaActivaNum} guardada`);

    // Recargar copa entera (clasificación y carrusel dependen de esto)
    const res = await fetchCopa(copaId);
    copaActual = res.copa;
    pintarClasificacion();

    // Saltar automáticamente a la siguiente jornada sin completar
    const siguiente = copaActual.jornadas.find((j) => !j.completada);
    jornadaActivaNum = siguiente ? siguiente.numero : jornadaActivaNum;

    pintarJornadaActiva();
    pintarCarrusel();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo guardar la jornada', true);
  } finally {
    btn.disabled = false;
  }
}

function pintarCarrusel() {
  const cont = document.getElementById('carruselJornadas');
  cont.innerHTML = copaActual.jornadas.map((j) => `
    <button class="carrusel-pill ${j.numero === jornadaActivaNum ? 'activa' : ''} ${j.completada ? 'completa' : ''}"
            onclick="irAJornada(${j.numero})">
      ${j.numero}
    </button>
  `).join('');
}

function irAJornada(numero) {
  jornadaActivaNum = numero;
  pintarJornadaActiva();
  pintarCarrusel();
}

function actualizarBloqueGenerarBracket() {
  const todasCompletas = copaActual.jornadas.every((j) => j.completada);
  document.getElementById('bloqueGenerarBracket').style.display = todasCompletas ? 'block' : 'none';
}

async function generarBracketUI() {
  try {
    await generarBracket(copaId);
    mostrarToast('Fase eliminatoria generada');

    const res = await fetchCopa(copaId);
    copaActual = res.copa;
    pintarCabecera();
    pintarTabsDisponibles();
    pintarBracket();
    cambiarTab('bracket');
  } catch (err) {
    mostrarToast(err.message || 'No se pudo generar el bracket', true);
  }
}

// ── PANEL CLASIFICACIÓN ──────────────────────────────────────────────────────
function pintarClasificacion() {
  const tbody = document.getElementById('clasifBody');
  const clasificacion = copaActual.clasificacionGeneral || [];
  const corte = copaActual.numClasificados;

  tbody.innerHTML = clasificacion.map((c, i) => {
    let filaCorte = '';
    if (i === corte) {
      filaCorte = `<tr><td colspan="4" class="corte-marker">— línea de clasificación a octavos —</td></tr>`;
    }
    return `
      ${i === corte ? filaCorte : ''}
      <tr>
        <td class="clasif-pos">${i + 1}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${c.jornadasCorridas}</td>
        <td class="clasif-pts">${c.puntos}</td>
      </tr>
    `;
  }).join('');
}

// ── PANEL BRACKET ─────────────────────────────────────────────────────────
function pintarBracket() {
  const empty = document.getElementById('bracketEmpty');
  const wrap = document.getElementById('bracketWrap');
  const campeonBanner = document.getElementById('campeonBanner');

  if (!copaActual.bracket || !copaActual.bracket.length) {
    empty.style.display = 'block';
    wrap.style.display = 'none';
    campeonBanner.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  wrap.style.display = 'flex';

  const rondas = [...new Set(copaActual.bracket.map((p) => p.ronda))].sort((a, b) => b - a);
  const nombresRonda = { 4: 'Octavos', 3: 'Cuartos', 2: 'Semifinal', 1: 'Final' };

  wrap.innerHTML = rondas.map((ronda) => {
    const partidos = copaActual.bracket.filter((p) => p.ronda === ronda).sort((a, b) => a.orden - b.orden);
    const label = nombresRonda[ronda] || `Ronda ${ronda}`;

    return `
      <div class="bracket-round">
        <div class="bracket-round-label">${label}</div>
        ${partidos.map((p) => renderPartido(p)).join('')}
      </div>
    `;
  }).join('');

  if (copaActual.campeon) {
    campeonBanner.style.display = 'block';
    document.getElementById('campeonNombre').textContent = copaActual.campeon;
  } else {
    campeonBanner.style.display = 'none';
  }
}

function renderPartido(p) {
  const slot = (nombre, esGanador) => {
    if (!nombre) return `<div class="bracket-slot vacio">— BYE —</div>`;
    const clase = esGanador ? 'ganador' : '';
    const clickable = !p.completado && p.participante1 && p.participante2;
    const onclick = clickable ? `onclick="abrirModalGanador(${p.ronda}, ${p.orden})"` : '';
    return `
      <div class="bracket-slot ${clase} ${clickable ? '' : 'disabled'}" ${onclick}>
        <span>${escapeHtml(nombre)}</span>
        ${clickable ? '<span class="material-icons">check_circle</span>' : ''}
      </div>
    `;
  };

  return `
    <div class="bracket-match">
      ${slot(p.participante1, p.completado && p.ganador === p.participante1)}
      ${slot(p.participante2, p.completado && p.ganador === p.participante2)}
    </div>
  `;
}

function abrirModalGanador(ronda, orden) {
  const partido = copaActual.bracket.find((p) => p.ronda === ronda && p.orden === orden);
  if (!partido || partido.completado) return;

  partidoSeleccionado = { ronda, orden };

  document.getElementById('opcionesGanador').innerHTML = [partido.participante1, partido.participante2]
    .map((nombre) => `<div class="ganador-opcion" onclick="confirmarGanador('${escapeAttr(nombre)}')">${escapeHtml(nombre)}</div>`)
    .join('');

  document.getElementById('modalGanador').classList.add('open');
}

function cerrarModalGanador() {
  document.getElementById('modalGanador').classList.remove('open');
  partidoSeleccionado = null;
}

async function confirmarGanador(nombre) {
  if (!partidoSeleccionado) return;
  const { ronda, orden } = partidoSeleccionado;

  try {
    await registrarGanadorPartido(copaId, ronda, orden, nombre);
    cerrarModalGanador();
    mostrarToast(`${nombre} avanza de ronda`);

    const res = await fetchCopa(copaId);
    copaActual = res.copa;
    pintarCabecera();
    pintarBracket();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo registrar el ganador', true);
  }
}

// ── Toast ────────────────────────────────────────────────────────────────
function mostrarToast(msg, esError = false) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = esError ? 'error' : 'check_circle';
  toast.classList.toggle('error', esError);
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ── Utilidades ────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}