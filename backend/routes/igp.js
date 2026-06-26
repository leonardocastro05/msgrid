const express = require('express');
const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const authMW  = require('../middleware/auth');

const router = express.Router();
const BASE_URL = 'https://www.igpleaguemanager.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
};

// POST /api/igp/verificar — Comprobar que una liga de iGP existe antes de crearla
// body: { igpLigaId, temporada }
router.post('/verificar', authMW, async (req, res) => {
  const { igpLigaId, temporada } = req.body;
  if (!igpLigaId) {
    return res.status(400).json({ error: 'Falta igpLigaId' });
  }
  try {
    const url = `${BASE_URL}/clasificacion/?liga=${igpLigaId}&temporada=${temporada || 1}`;
    const respuesta = await fetch(url, { headers: HEADERS });
    if (!respuesta.ok) {
      return res.status(400).json({ ok: false, error: `HTTP ${respuesta.status}` });
    }
    const html = await respuesta.text();
    const $ = cheerio.load(html);

    const tieneTabla = $('table tbody tr').length > 0 || $('.standings-row').length > 0;
    if (!tieneTabla && html.includes('No se ha encontrado')) {
      return res.status(404).json({ ok: false, error: 'Liga no encontrada en iGP Manager' });
    }

    // Devolver un pequeño preview: nombre del primer equipo, total de filas, etc.
    const totalEquipos = $('table tbody tr').length;
    res.json({ ok: true, igpLigaId, temporada: temporada || 1, equiposEncontrados: totalEquipos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;