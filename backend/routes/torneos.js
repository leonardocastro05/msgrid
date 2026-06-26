const express = require('express');
const Torneo  = require('../models/Torneo');
const Liga    = require('../models/Liga');
const authMW  = require('../middleware/auth');

const router = express.Router();

// POST /api/torneos — Crear torneo
router.post('/', authMW, async (req, res) => {
  const { nombre, ligaId, participantes } = req.body;
  if (!nombre || !ligaId || !participantes?.length) {
    return res.status(400).json({ error: 'Faltan campos: nombre, ligaId, participantes' });
  }
  if (participantes.length < 2) {
    return res.status(400).json({ error: 'Se necesitan al menos 2 participantes' });
  }
  try {
    const liga = await Liga.findById(ligaId);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!liga.admins.some(a => a.toString() === req.admin._id.toString())) {
      return res.status(403).json({ error: 'Sin acceso a esta liga' });
    }

    const torneo = new Torneo({ nombre, liga: ligaId, participantes, tipo: 'eliminatorio' });
    await torneo.save();

    res.status(201).json({ ok: true, torneo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/torneos?liga=ID — Listar torneos de una liga
router.get('/', authMW, async (req, res) => {
  const { liga } = req.query;
  try {
    const filtro = liga ? { liga } : {};
    const torneos = await Torneo.find(filtro).sort({ creadoEn: -1 }).select('-partidos');
    res.json({ ok: true, torneos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/torneos/:id — Detalle de un torneo con bracket completo
router.get('/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id).populate('liga', 'nombre');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json({ ok: true, torneo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/torneos/:id/iniciar — Genera el bracket y activa el torneo
router.post('/:id/iniciar', authMW, async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id).populate('liga');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneo.estado !== 'borrador') {
      return res.status(400).json({ error: 'El torneo ya fue iniciado' });
    }
    if (!torneo.liga.admins.some(a => a.toString() === req.admin._id.toString())) {
      return res.status(403).json({ error: 'Sin acceso' });
    }

    torneo.generarBracket();
    await torneo.save();

    res.json({ ok: true, torneo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/torneos/:id/partido — Actualizar resultado de un partido
router.put('/:id/partido', authMW, async (req, res) => {
  const { ronda, orden, ganador, puntos1, puntos2, carreraId } = req.body;
  if (!ganador || ronda === undefined || orden === undefined) {
    return res.status(400).json({ error: 'Faltan ronda, orden o ganador' });
  }
  try {
    const torneo = await Torneo.findById(req.params.id).populate('liga');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (!torneo.liga.admins.some(a => a.toString() === req.admin._id.toString())) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    if (torneo.estado !== 'activo') {
      return res.status(400).json({ error: 'El torneo no está activo' });
    }

    // Encontrar el partido
    const partido = torneo.partidos.find(p => p.ronda === ronda && p.orden === orden);
    if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });

    partido.ganador    = ganador;
    partido.completado = true;
    if (puntos1 !== undefined) partido.equipo1.puntos = puntos1;
    if (puntos2 !== undefined) partido.equipo2.puntos = puntos2;
    if (carreraId) partido.carreraId = carreraId;

    // Propagar el ganador a la siguiente ronda
    const siguienteRonda = ronda - 1;
    if (siguienteRonda >= 1) {
      const siguienteOrden = Math.floor(orden / 2);
      const siguientePartido = torneo.partidos.find(
        p => p.ronda === siguienteRonda && p.orden === siguienteOrden
      );
      if (siguientePartido) {
        if (orden % 2 === 0) {
          siguientePartido.equipo1.nombre = ganador;
          siguientePartido.equipo1.logo   = partido.ganador === partido.equipo1.nombre
            ? partido.equipo1.logo : partido.equipo2.logo;
        } else {
          siguientePartido.equipo2.nombre = ganador;
          siguientePartido.equipo2.logo   = partido.ganador === partido.equipo1.nombre
            ? partido.equipo1.logo : partido.equipo2.logo;
        }
      }
    }

    // Comprobar si el torneo ha terminado (ronda 1 = final)
    if (ronda === 1) {
      torneo.ganador = ganador;
      torneo.estado  = 'finalizado';
    }

    torneo.markModified('partidos');
    await torneo.save();

    res.json({ ok: true, torneo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/torneos/:id — Borrar torneo (solo borrador)
router.delete('/:id', authMW, async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id).populate('liga');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (!torneo.liga.admins.some(a => a.toString() === req.admin._id.toString())) {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    if (torneo.estado === 'activo') {
      return res.status(400).json({ error: 'No se puede borrar un torneo activo' });
    }
    await torneo.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;