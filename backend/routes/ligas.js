const express  = require('express');
const Liga     = require('../models/Liga');
const Admin    = require('../models/Admin');
const authMW   = require('../middleware/auth');
const { cifrar, descifrar }          = require('../middleware/crypto');
const { createSession, verificarCredenciales } = require('../igp/igpClient');

const router = express.Router();

function ligaSinCredenciales(l) {
  const obj = l.toObject ? l.toObject() : { ...l };
  delete obj.igpEmail;
  delete obj.igpPassword;
  return obj;
}

function tieneAcceso(liga, adminId) {
  return liga.admins.some(a => a.toString() === adminId.toString());
}

// POST /api/ligas
router.post('/', authMW, async (req, res) => {
  const { nombre, igpLigaId, temporada, descripcion, igpEmail, igpPassword } = req.body;
  if (!nombre || !igpLigaId || !temporada || !igpEmail || !igpPassword)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const verificacion = await verificarCredenciales(igpEmail, igpPassword, igpLigaId);
    if (!verificacion.ok)
      return res.status(400).json({ error: 'Credenciales iGP no válidas', detalle: verificacion.error });

    const liga = new Liga({
      nombre, igpLigaId, temporada,
      descripcion: descripcion || '',
      igpEmail   : cifrar(igpEmail),
      igpPassword: cifrar(igpPassword),
      admins     : [req.admin._id],
    });
    await liga.save();
    await Admin.findByIdAndUpdate(req.admin._id, { $push: { ligas: liga._id } });
    res.status(201).json({ ok: true, liga: ligaSinCredenciales(liga) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas
router.get('/', authMW, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).populate('ligas');
    res.json({ ok: true, ligas: (admin.ligas || []).map(ligaSinCredenciales) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas/:id
router.get('/:id', authMW, async (req, res) => {
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });
    res.json({ ok: true, liga: ligaSinCredenciales(liga) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ligas/:id/sync
router.post('/:id/sync', authMW, async (req, res) => {
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });

    const email    = descifrar(liga.igpEmail);
    const password = descifrar(liga.igpPassword);
    const session  = await createSession(email, password);

    const [leagueData, scheduleData] = await Promise.allSettled([
      session.getLeague(liga.igpLigaId),
      session.getSchedule(liga.igpLigaId),
    ]);

    const equipos    = leagueData.status   === 'fulfilled' ? extraerEquipos(leagueData.value)     : [];
    const calendario = scheduleData.status === 'fulfilled' ? extraerCalendario(scheduleData.value) : [];

    liga.cache.equipos    = equipos;
    liga.cache.calendario = calendario;
    liga.cache.ultimaSync = new Date();
    liga.markModified('cache');
    await liga.save();

    res.json({ ok: true, equipos: equipos.length, carreras: calendario.length, sincronizado: liga.cache.ultimaSync });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas/:id/datos
router.get('/:id/datos', authMW, async (req, res) => {
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });
    res.json({ ok: true, cache: liga.cache, nombre: liga.nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas/:id/carrera/:raceId
router.get('/:id/carrera/:raceId', authMW, async (req, res) => {
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });

    const email    = descifrar(liga.igpEmail);
    const password = descifrar(liga.igpPassword);
    const session  = await createSession(email, password);
    const data     = await session.getRaceResult(req.params.raceId, req.query.tier || 1, req.query.tab || 'race');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ligas/:id/credenciales
router.put('/:id/credenciales', authMW, async (req, res) => {
  const { igpEmail, igpPassword } = req.body;
  if (!igpEmail || !igpPassword) return res.status(400).json({ error: 'Faltan credenciales' });
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });

    const verificacion = await verificarCredenciales(igpEmail, igpPassword, liga.igpLigaId);
    if (!verificacion.ok) return res.status(400).json({ error: verificacion.error });

    liga.igpEmail    = cifrar(igpEmail);
    liga.igpPassword = cifrar(igpPassword);
    await liga.save();
    res.json({ ok: true, mensaje: 'Credenciales actualizadas' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers de extracción ────────────────────────────────────────────────────
// NOTA: los keys exactos se ajustan cuando veamos la respuesta real de la API

function extraerEquipos(data) {
  try {
    const standings = data.standings || data.teams || data.leagueStandings || [];
    if (!Array.isArray(standings)) return [];
    return standings.map((e, i) => ({
      posicion: e.position || e.pos || (i + 1),
      nombre  : e.name     || e.teamName || e._name || '—',
      logo    : e.logo     || e.logoUrl  || '',
      manager : e.manager  || e.managerName || '—',
      puntos  : Number(e.points || e.pts || 0),
    }));
  } catch { return []; }
}

function extraerCalendario(data) {
  try {
    const races = data.races || data.schedule || data.calendar || [];
    if (!Array.isArray(races)) return [];
    return races.map((r, i) => ({
      num      : r.round    || (i + 1),
      pais     : r.country  || r.circuit || r.name || '—',
      bandera  : r.flag     || r.flagUrl || '',
      fecha    : r.date     || r.raceDate || '',
      carreraId: r.id       || r.raceId  || null,
      completada: r.completed || r.done   || false,
    }));
  } catch { return []; }
}

module.exports = router;