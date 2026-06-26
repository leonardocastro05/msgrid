// ── Guard: redirigir si no está logueado ─────────────────────────
if (!estaLogueado()) window.location.href = 'login.html';

const admin = getAdmin();
let misLigas = [];

// Mostrar nombre del admin en navbar
document.getElementById('adminUsername').textContent = admin?.username || '';

// ── Navegación sidebar ───────────────────────────────────────────
function mostrarSeccion(id, el) {
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('visible'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`sec-${id}`).classList.add('visible');
  el.classList.add('active');
}

// ── Cargar ligas al iniciar ──────────────────────────────────────
async function cargarLigas() {
  const grid = document.getElementById('ligasGrid');
  try {
    const data = await fetchMisLigas();
    misLigas = data.ligas || [];
    renderLigas();
    poblarSelectorLigas();
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--red-light); font-size:13px">Error cargando ligas: ${err.message}</p>`;
  }
}

function renderLigas() {
  const grid = document.getElementById('ligasGrid');
  if (!misLigas.length) {
    grid.innerHTML = `
      <div class="estado-msg">
        <span class="material-icons">sports_motorsports</span>
        <p>No tienes ligas aún. ¡Añade la primera!</p>
      </div>`;
    return;
  }
  grid.innerHTML = misLigas.map(liga => {
    const sincronizado = liga.cache?.ultimaSync
      ? `<span class="sync-badge"><span class="material-icons">check_circle</span> Sync: ${new Date(liga.cache.ultimaSync).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>`
      : `<span class="sync-badge" style="color:var(--muted)">Sin sincronizar</span>`;
    const nEquipos  = liga.cache?.equipos?.length || 0;
    const nCarreras = liga.cache?.calendario?.length || 0;

    return `
      <div class="liga-card">
        <div class="liga-card-header">
          <div class="liga-card-icon"><span class="material-icons">sports_motorsports</span></div>
          <div>
            <div class="liga-card-nombre">${liga.nombre}</div>
            <div class="liga-card-id">ID: ${liga.igpLigaId} · T${liga.temporada}</div>
          </div>
        </div>
        <div style="display:flex; gap:16px; font-size:12px; color:var(--muted); margin-bottom:8px">
          <span><strong style="color:var(--white)">${nEquipos}</strong> equipos</span>
          <span><strong style="color:var(--white)">${nCarreras}</strong> carreras</span>
        </div>
        ${sincronizado}
        <div class="liga-card-actions">
          <button class="btn-sm btn-sm--red" onclick="sincronizar('${liga._id}')">
            <span class="material-icons">sync</span> Sincronizar
          </button>
          <a href="bracket.html?liga=${liga._id}" class="btn-sm">
            <span class="material-icons">emoji_events</span> Torneos
          </a>
        </div>
      </div>`;
  }).join('');
}

function poblarSelectorLigas() {
  const sel = document.getElementById('selectorLigaTorneo');
  sel.innerHTML = '<option value="">— Selecciona una liga —</option>';
  misLigas.forEach(l => {
    sel.innerHTML += `<option value="${l._id}">${l.nombre}</option>`;
  });
}

async function sincronizar(ligaId) {
  const btn = event.target.closest('button');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  try {
    const data = await sincronizarLiga(ligaId);
    await cargarLigas();
    console.log(`Sync OK: ${data.equipos} equipos, ${data.carreras} carreras`);
  } catch (err) {
    alert('Error sincronizando: ' + err.message);
    btn.innerHTML = original;
    btn.disabled = false;
  }
}

// ── Modal nueva liga ─────────────────────────────────────────────
function abrirModalLiga() { document.getElementById('modalLiga').classList.add('open'); }
function cerrarModalLiga() { document.getElementById('modalLiga').classList.remove('open'); }

async function guardarLiga() {
  const nombre    = document.getElementById('mNombre').value.trim();
  const igpLigaId = document.getElementById('mIgpId').value.trim();
  const temporada = document.getElementById('mTemporada').value.trim();
  const igpEmail  = document.getElementById('mIgpEmail').value.trim();
  const igpPassword = document.getElementById('mIgpPass').value;
  const errEl     = document.getElementById('mError');
  const okEl      = document.getElementById('mOk');
  const btn       = document.getElementById('btnGuardarLiga');

  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  if (!nombre || !igpLigaId || !temporada || !igpEmail || !igpPassword) {
    errEl.textContent = 'Rellena todos los campos.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando…';

  try {
    await crearLiga({ nombre, igpLigaId, temporada, igpEmail, igpPassword });
    okEl.textContent = '¡Liga añadida! Puedes cerrar este panel.';
    okEl.style.display = 'block';
    await cargarLigas();
    setTimeout(cerrarModalLiga, 1500);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">check</span> Guardar y verificar';
  }
}

// ── Torneos ──────────────────────────────────────────────────────
async function cargarTorneos() {
  const ligaId = document.getElementById('selectorLigaTorneo').value;
  const btnNew = document.getElementById('btnNuevoTorneo');
  const lista  = document.getElementById('torneoLista');

  btnNew.disabled = !ligaId;
  if (!ligaId) {
    lista.innerHTML = '<p style="color:var(--muted); font-size:13px">Selecciona una liga para ver sus torneos.</p>';
    return;
  }

  lista.innerHTML = '<div class="skeleton-row"></div>';
  try {
    const data = await fetchTorneos(ligaId);
    const torneos = data.torneos || [];
    if (!torneos.length) {
      lista.innerHTML = '<div class="estado-msg"><span class="material-icons">emoji_events</span><p>No hay torneos aún. Crea el primero.</p></div>';
      return;
    }
    lista.innerHTML = torneos.map(t => `
      <div class="torneo-row">
        <span class="torneo-estado ${t.estado}">${t.estado}</span>
        <div style="flex:1">
          <div style="font-weight:600">${t.nombre}</div>
          <div style="font-size:12px; color:var(--muted)">${t.participantes?.length || 0} participantes</div>
        </div>
        ${t.estado === 'borrador' ? `<button class="btn-sm btn-sm--red" onclick="iniciarTorneoUI('${t._id}')"><span class="material-icons">play_arrow</span> Iniciar</button>` : ''}
        <a href="bracket.html?torneo=${t._id}" class="btn-sm"><span class="material-icons">account_tree</span> Ver bracket</a>
      </div>`).join('');
  } catch (err) {
    lista.innerHTML = `<p style="color:var(--red-light)">Error: ${err.message}</p>`;
  }
}

async function iniciarTorneoUI(torneoId) {
  if (!confirm('¿Iniciar el torneo? Esto generará el bracket y no se puede deshacer.')) return;
  try {
    await iniciarTorneo(torneoId);
    await cargarTorneos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function abrirModalTorneo() { document.getElementById('modalTorneo').classList.add('open'); }
function cerrarModalTorneo() { document.getElementById('modalTorneo').classList.remove('open'); }

async function guardarTorneo() {
  const nombre   = document.getElementById('tNombre').value.trim();
  const rawParti = document.getElementById('tParticipantes').value.trim();
  const ligaId   = document.getElementById('selectorLigaTorneo').value;
  const errEl    = document.getElementById('tError');
  const btn      = document.getElementById('btnGuardarTorneo');

  errEl.style.display = 'none';

  const participantes = rawParti.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map((nombre, i) => ({ nombre, logo: '', seed: i + 1 }));

  if (!nombre || participantes.length < 2) {
    errEl.textContent = 'Pon un nombre y al menos 2 participantes.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    await crearTorneo({ nombre, ligaId, participantes });
    cerrarModalTorneo();
    await cargarTorneos();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">check</span> Crear torneo';
  }
}

// ── Resultado rápido en dashboard ────────────────────────────────
async function cargarResultadoDash() {
  const liga      = document.getElementById('rLiga').value.trim();
  const temporada = document.getElementById('rTemporada').value.trim();
  const carrera   = document.getElementById('rCarrera').value.trim();
  const output    = document.getElementById('dashResultado');

  if (!carrera) { alert('Pon el ID de la carrera'); return; }

  output.classList.remove('hidden');
  output.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';

  try {
    const data = await fetchResultado(liga, temporada, carrera);
    output.innerHTML = renderResultados(data);
  } catch (err) {
    output.innerHTML = `<div class="estado-msg"><span class="material-icons">error_outline</span><p>${err.message}</p></div>`;
  }
}

function renderResultados(data) {
  if (!data.resultados?.length) return '<p style="color:var(--muted)">No se encontraron resultados.</p>';
  return `
    <div class="resultado-header">
      ${data.bandera ? `<img class="resultado-bandera" src="${data.bandera}" />` : ''}
      <div>
        <div class="resultado-titulo">${data.carrera?.titulo || 'Resultado'}</div>
        <div class="resultado-meta">Carrera ${data.carrera?.id} · Temporada ${data.carrera?.temporada}</div>
      </div>
    </div>
    <table class="resultado-table">
      <thead>
        <tr><th>Pos</th><th>Equipo</th><th>Manager</th><th style="text-align:right">Puntos</th></tr>
      </thead>
      <tbody>
        ${data.resultados.map(r => `
          <tr>
            <td class="td-pos ${r.podiumClass}">${r.posicion}</td>
            <td>
              <div class="td-equipo">
                ${r.logo ? `<img class="equipo-logo" src="${r.logo}" onerror="this.style.display='none'" />` : ''}
                <div><div class="equipo-nombre">${r.equipo}</div></div>
              </div>
            </td>
            <td style="color:var(--muted-light); font-size:13px">${r.manager || '—'}</td>
            <td class="td-puntos">${r.puntos || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Init ─────────────────────────────────────────────────────────
cargarLigas();