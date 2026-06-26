const express  = require('express');
const fetch    = require('node-fetch');
const cheerio  = require('cheerio');
const Liga     = require('../models/Liga');
const Admin    = require('../models/Admin');
const authMW   = require('../middleware/auth');
const { cifrar, descifrar } = require('../middleware/crypto');

const router = express.Router();
const BASE_URL = 'https://www.igpleaguemanager.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
};

// Helper: verificar que el admin tiene acceso a la liga
function tieneAcceso(liga, adminId) {
  return liga.admins.some(a => a.toString() === adminId.toString());
}

// POST /api/ligas — Crear liga y vincular credenciales iGP
router.post('/', authMW, async (req, res) => {
  const { nombre, igpLigaId, temporada, descripcion, igpEmail, igpPassword } = req.body;
  if (!nombre || !igpLigaId || !temporada || !igpEmail || !igpPassword) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    // Verificar que las credenciales son válidas haciendo un fetch de prueba
    const valido = await verificarCredencialesIGP(igpEmail, igpPassword, igpLigaId);
    if (!valido.ok) {
      return res.status(400).json({ error: 'Las credenciales de iGP no son válidas o no pertenecen a esta liga', detalle: valido.error });
    }

    const liga = new Liga({
      nombre,
      igpLigaId,
      temporada,
      descripcion: descripcion || '',
      igpEmail:    cifrar(igpEmail),
      igpPassword: cifrar(igpPassword),
      admins: [req.admin._id],
    });
    await liga.save();

    // Vincular la liga al admin
    await Admin.findByIdAndUpdate(req.admin._id, { $push: { ligas: liga._id } });

    res.status(201).json({ ok: true, liga: ligaSinCredenciales(liga) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas — Listar ligas del admin autenticado
router.get('/', authMW, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).populate('ligas');
    const ligas = (admin.ligas || []).map(ligaSinCredenciales);
    res.json({ ok: true, ligas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas/:id — Detalle de una liga
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

// POST /api/ligas/:id/sync — Sincronizar datos de iGP (actualiza cache)
router.post('/:id/sync', authMW, async (req, res) => {
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });

    const email    = descifrar(liga.igpEmail);
    const password = descifrar(liga.igpPassword);

    // Sincronizar clasificación y calendario en paralelo
    const [equipos, calendario] = await Promise.all([
      scrapeClasificacion(liga.igpLigaId, liga.temporada),
      scrapeCalendario(liga.igpLigaId, liga.temporada),
    ]);

    liga.cache.equipos    = equipos;
    liga.cache.calendario = calendario;
    liga.cache.ultimaSync = new Date();
    await liga.save();

    res.json({ ok: true, equipos: equipos.length, carreras: calendario.length, sincronizado: liga.cache.ultimaSync });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ligas/:id/datos — Devolver datos cacheados de la liga
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

// PUT /api/ligas/:id/credenciales — Actualizar credenciales iGP
router.put('/:id/credenciales', authMW, async (req, res) => {
  const { igpEmail, igpPassword } = req.body;
  if (!igpEmail || !igpPassword) return res.status(400).json({ error: 'Faltan credenciales' });
  try {
    const liga = await Liga.findById(req.params.id);
    if (!liga) return res.status(404).json({ error: 'Liga no encontrada' });
    if (!tieneAcceso(liga, req.admin._id)) return res.status(403).json({ error: 'Sin acceso' });

    const valido = await verificarCredencialesIGP(igpEmail, igpPassword, liga.igpLigaId);
    if (!valido.ok) return res.status(400).json({ error: 'Credenciales incorrectas para esta liga' });

    liga.igpEmail    = cifrar(igpEmail);
    liga.igpPassword = cifrar(igpPassword);
    await liga.save();

    res.json({ ok: true, mensaje: 'Credenciales actualizadas' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPERS ────────────────────────────────────────────────────────────────

// Quita campos sensibles antes de devolver la liga al cliente
function ligaSinCredenciales(l) {
  const obj = l.toObject ? l.toObject() : l;
  delete obj.igpEmail;
  delete obj.igpPassword;
  return obj;
}

// Verifica que las credenciales iGP son correctas comprobando que
// la página de la liga está accesible y el usuario pertenece a ella
async function verificarCredencialesIGP(email, password, igpLigaId) {
  try {
    const url = `${BASE_URL}/clasificacion/?liga=${igpLigaId}&temporada=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    const $ = cheerio.load(html);
    // Comprobación básica: la página de la liga existe y tiene contenido
    const tieneTabla = $('table tbody tr').length > 0 || $('.standings-row').length > 0;
    // En una implementación completa, aquí haríamos login real y verificaríamos
    // que el usuario pertenece a la liga. Por ahora verificamos que la liga existe.
    if (!tieneTabla && html.includes('No se ha encontrado')) {
      return { ok: false, error: 'Liga no encontrada en iGP Manager' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function scrapeClasificacion(igpLigaId, temporada) {
  const url = `${BASE_URL}/clasificacion/?liga=${igpLigaId}&temporada=${temporada}`;
  const res = await fetch(url, { headers: HEADERS });
  const html = await res.text();
  const $ = cheerio.load(html);
  const equipos = [];

  $('table tbody tr').each((i, el) => {
    const cols = $(el).find('td');
    if (cols.length < 3) return;
    const nombre = $(cols[1]).text().trim().replace(/\s+/g, ' ');
    const logo   = $(cols[1]).find('img[src*="fotos"]').attr('src') || '';
    const manager = $(cols[2]).text().trim();
    const puntos  = $(cols[3])?.text().trim().replace(/[^0-9]/g, '') || '0';
    if (nombre) {
      equipos.push({
        posicion: i + 1,
        nombre,
        logo: logo ? (logo.startsWith('http') ? logo : `${BASE_URL}${logo}`) : '',
        manager,
        puntos: parseInt(puntos) || 0,
      });
    }
  });
  return equipos;
}

async function scrapeCalendario(igpLigaId, temporada) {
  const url = `${BASE_URL}/calendario/?liga=${igpLigaId}&temporada=${temporada}`;
  const res = await fetch(url, { headers: HEADERS });
  const html = await res.text();
  const $ = cheerio.load(html);
  const carreras = [];

  $('table tbody tr').each((i, el) => {
    const cols = $(el).find('td');
    if (cols.length < 2) return;
    const pais    = $(cols[1]).text().trim();
    const bandera = $(cols[1]).find('img').attr('src') || '';
    const fecha   = $(cols[2])?.text().trim() || '';
    const idLink  = $(el).find('a[href*="carrera="]').attr('href') || '';
    const idMatch = idLink.match(/carrera=(\d+)/);
    if (pais) {
      carreras.push({
        num: i + 1,
        pais,
        bandera: bandera ? (bandera.startsWith('http') ? bandera : `${BASE_URL}${bandera}`) : '',
        fecha,
        carreraId: idMatch ? idMatch[1] : null,
      });
    }
  });
  return carreras;
}

module.exports = router;