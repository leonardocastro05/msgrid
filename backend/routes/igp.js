/**
 * backend/routes/igp.js
 *
 * Rutas para interactuar con iGPManager.
 * Usa cheerio para parsear los fragmentos HTML que devuelve la API.
 */

const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const authMW = require("../middleware/auth");
const { igpFetch, login } = require("../igp/session");

const router = express.Router();
const BASE_URL = "https://www.igpleaguemanager.com";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/igp/verificar
// Comprobar que una liga de iGP existe antes de crearla
// body: { igpLigaId, temporada }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verificar", authMW, async (req, res) => {
  const { igpLigaId, temporada } = req.body;
  if (!igpLigaId) return res.status(400).json({ error: "Falta igpLigaId" });

  try {
    const url = `${BASE_URL}/clasificacion/?liga=${igpLigaId}&temporada=${temporada || 1}`;
    const respuesta = await fetch(url, { headers: HEADERS });
    if (!respuesta.ok)
      return res
        .status(400)
        .json({ ok: false, error: `HTTP ${respuesta.status}` });

    const html = await respuesta.text();
    const $ = cheerio.load(html);
    const tieneTabla =
      $("table tbody tr").length > 0 || $(".standings-row").length > 0;
    if (!tieneTabla && html.includes("No se ha encontrado")) {
      return res
        .status(404)
        .json({ ok: false, error: "Liga no encontrada en iGP Manager" });
    }

    const totalEquipos = $("table tbody tr").length;
    res.json({
      ok: true,
      igpLigaId,
      temporada: temporada || 1,
      equiposEncontrados: totalEquipos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/igp/test-login
// Probar credenciales de iGPManager (solo superadmin)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/test-login", authMW, async (req, res) => {
  if (req.admin.rol !== "superadmin") {
    return res
      .status(403)
      .json({ error: "Solo el superadmin puede hacer esto" });
  }
  try {
    await login();
    res.json({ ok: true, mensaje: "Login en iGPManager exitoso" });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/igp/carrera/:id
// Obtener y parsear los resultados de una carrera de iGPManager
// ─────────────────────────────────────────────────────────────────────────────
router.get("/carrera/:id", authMW, async (req, res) => {
  const { id } = req.params;

  try {
    // La API devuelve JSON con vars.rResult (HTML tabla), vars.qResult, vars.raceName
    const data = await igpFetch(`action=fetch&d=result&id=${id}`);

    if (!data || !data.vars) {
      return res
        .status(404)
        .json({ error: "Carrera no encontrada o sesión iGP caducada" });
    }

    const resultados = parseResultados(data.vars.rResult);
    const qualy = parseResultados(data.vars.qResult);
    const nombreCarrera = parseNombreCarrera(data.vars.raceName);

    res.json({
      carreraId: id,
      nombre: nombreCarrera,
      resultados, // array de pilotos en orden de llegada
      qualy,
    });
  } catch (err) {
    console.error("Error /api/igp/carrera/:id", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/igp/liga/:id
// Datos generales de una liga de iGPManager
// ─────────────────────────────────────────────────────────────────────────────
router.get("/liga/:id", authMW, async (req, res) => {
  const { id } = req.params;
  try {
    const data = await igpFetch(`action=fetch&p=league&id=${id}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/igp/carrera/:carreraId/enfrentamiento
// Determina quién ganó entre dos equipos en una carrera (para torneos)
// Query: ?equipo1=NombreEquipo1&equipo2=NombreEquipo2
// ─────────────────────────────────────────────────────────────────────────────
router.get("/carrera/:carreraId/enfrentamiento", authMW, async (req, res) => {
  const { carreraId } = req.params;
  const { equipo1, equipo2 } = req.query;

  if (!equipo1 || !equipo2) {
    return res
      .status(400)
      .json({ error: "Faltan parámetros equipo1 y equipo2" });
  }

  try {
    const data = await igpFetch(`action=fetch&d=result&id=${carreraId}`);
    if (!data || !data.vars) {
      return res.status(404).json({ error: "Carrera no encontrada" });
    }

    const resultados = parseResultados(data.vars.rResult);

    // Buscar los dos equipos (búsqueda parcial, sin distinguir mayúsculas)
    const e1 = encontrarEquipo(resultados, equipo1);
    const e2 = encontrarEquipo(resultados, equipo2);

    if (!e1)
      return res
        .status(404)
        .json({ error: `Equipo "${equipo1}" no encontrado en la carrera` });
    if (!e2)
      return res
        .status(404)
        .json({ error: `Equipo "${equipo2}" no encontrado en la carrera` });

    // Menor posición = mejor resultado
    let ganador = null;
    if (e1.pos < e2.pos) ganador = equipo1;
    else if (e2.pos < e1.pos) ganador = equipo2;
    else ganador = "empate";

    res.json({
      carreraId,
      equipo1: {
        nombre: e1.equipo,
        piloto: e1.piloto,
        pos: e1.pos,
        pts: e1.pts,
      },
      equipo2: {
        nombre: e2.equipo,
        piloto: e2.piloto,
        pos: e2.pos,
        pts: e2.pts,
      },
      ganador,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de parseo de HTML de iGPManager con Cheerio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea data.vars.rResult o qResult (string HTML de tabla)
 * y devuelve un array de objetos con los datos de cada piloto.
 *
 * NOTA: los nombres de clase (.teamName, .resultRacePointsCell…) vienen del
 * HTML de iGPManager. Si algo no funciona, abre DevTools en la página de
 * resultados de iGP y revisa los selectores.
 */
function parseResultados(htmlStr) {
  if (!htmlStr) return [];
  const $ = cheerio.load(`<table>${htmlStr}</table>`);
  const resultados = [];

  $("tbody tr").each((i, row) => {
    try {
      const $row = $(row);

      // Posición: primera celda
      const pos = parseInt($row.find("td").first().text().trim(), 10) || i + 1;

      // Piloto y equipo: segunda celda con dos líneas
      const $celda2 = $row.find("td").eq(1);
      const piloto =
        $celda2.find(".driverName, .name").first().text().trim() ||
        $celda2.text().split("\n")[0].trim();
      const equipo = $row.find(".teamName").text().trim();

      // Bandera del país (clase CSS tipo "flag-es")
      const flagClass =
        $row.find('[class*="flag"]').first().attr("class") || "";
      const pais = (flagClass.match(/flag-?([a-z]{2})/i) || [])[1] || "";

      // Tiempo / gap
      const tiempo = $row.find("td").eq(2).text().trim();

      // Mejor vuelta
      const mejorVuelta = $row.find("td").eq(3).text().trim();

      // Velocidad máxima
      const velMax = $row.find("td").eq(4).text().trim();

      // Bases (bonus points)
      const bases = parseInt($row.find("td").eq(5).text().trim(), 10) || 0;

      // Puntos de campeonato
      const pts =
        parseInt(
          $row.find(".resultRacePointsCell, td").last().text().trim(),
          10,
        ) || 0;

      resultados.push({
        pos,
        piloto,
        equipo,
        pais,
        tiempo,
        mejorVuelta,
        velMax,
        bases,
        pts,
      });
    } catch {
      // fila inválida, saltar
    }
  });

  return resultados;
}

/**
 * Extrae el nombre de la carrera desde data.vars.raceName (string HTML)
 */
function parseNombreCarrera(htmlStr) {
  if (!htmlStr) return "Carrera desconocida";
  const $ = cheerio.load(htmlStr);
  return $("h1, h2, .raceName, title").first().text().trim() || "Carrera iGP";
}

/**
 * Busca un equipo en los resultados por nombre parcial (sin distinguir mayúsculas)
 */
function encontrarEquipo(resultados, nombreBuscado) {
  const lower = nombreBuscado.toLowerCase();
  return (
    resultados.find(
      (r) =>
        r.equipo.toLowerCase().includes(lower) ||
        r.piloto.toLowerCase().includes(lower),
    ) || null
  );
}

module.exports = router;
