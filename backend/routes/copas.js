const express = require("express");
const Copa = require("../models/Copa");
const authMW = require("../middleware/auth");

const router = express.Router();

function tieneAcceso(copa, adminId) {
  return copa.admins.some((a) => a.toString() === adminId.toString());
}

// ── POST / — Crear copa (privado) ─────────────────────────────────────────
router.post("/", authMW, async (req, res) => {
  const {
    nombre,
    bannerUrl,
    participantes,
    tablaPuntos,
    numJornadas,
    numClasificados,
  } = req.body;

  if (!nombre || !Array.isArray(participantes) || participantes.length < 2) {
    return res
      .status(400)
      .json({ error: "Faltan nombre o al menos 2 participantes" });
  }
  if (!numJornadas || numJornadas < 1) {
    return res.status(400).json({ error: "numJornadas debe ser al menos 1" });
  }
  if (
    !numClasificados ||
    numClasificados < 2 ||
    numClasificados > participantes.length
  ) {
    return res
      .status(400)
      .json({
        error: "numClasificados debe estar entre 2 y el total de participantes",
      });
  }

  try {
    const copa = new Copa({
      nombre,
      bannerUrl: bannerUrl || "",
      participantes: participantes.map((p) => p.trim()).filter(Boolean),
      tablaPuntos:
        Array.isArray(tablaPuntos) && tablaPuntos.length
          ? tablaPuntos
          : undefined,
      numJornadas,
      numClasificados,
      admins: [req.admin._id],
      creadoPor: req.admin._id,
    });

    copa.generarJornadasVacias();
    await copa.save();

    res.status(201).json({ ok: true, copa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — Listar copas del admin (privado) ──────────────────────────────
router.get("/", authMW, async (req, res) => {
  try {
    const copas = await Copa.find({ admins: req.admin._id }).select(
      "-jornadas -bracket",
    );
    res.json({ ok: true, copas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id — Ver copa (PÚBLICO, sin authMW) ─────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const copa = await Copa.findById(req.params.id);
    if (!copa) return res.status(404).json({ error: "Copa no encontrada" });
    res.json({ ok: true, copa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id/jornada/:numero — Registrar resultado (privado) ──────────────
router.put("/:id/jornada/:numero", authMW, async (req, res) => {
  const { ordenLlegada } = req.body;
  if (!Array.isArray(ordenLlegada) || ordenLlegada.length === 0) {
    return res
      .status(400)
      .json({ error: "Falta ordenLlegada (array de nombres)" });
  }

  try {
    const copa = await Copa.findById(req.params.id);
    if (!copa) return res.status(404).json({ error: "Copa no encontrada" });
    if (!tieneAcceso(copa, req.admin._id))
      return res.status(403).json({ error: "Sin acceso" });
    if (copa.fase !== "jornadas") {
      return res
        .status(400)
        .json({ error: "La fase de jornadas ya ha terminado para esta copa" });
    }

    const desconocidos = ordenLlegada.filter(
      (n) => !copa.participantes.includes(n),
    );
    if (desconocidos.length) {
      return res
        .status(400)
        .json({
          error: `Participantes desconocidos: ${desconocidos.join(", ")}`,
        });
    }

    const numero = parseInt(req.params.numero, 10);
    copa.registrarResultadoJornada(numero, ordenLlegada);
    await copa.save();

    res.json({
      ok: true,
      jornada: copa.jornadas.find((j) => j.numero === numero),
      clasificacionGeneral: copa.clasificacionGeneral,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /:id/generar-bracket (privado) ───────────────────────────────────
router.post("/:id/generar-bracket", authMW, async (req, res) => {
  try {
    const copa = await Copa.findById(req.params.id);
    if (!copa) return res.status(404).json({ error: "Copa no encontrada" });
    if (!tieneAcceso(copa, req.admin._id))
      return res.status(403).json({ error: "Sin acceso" });
    if (copa.fase !== "jornadas") {
      return res
        .status(400)
        .json({ error: "El bracket ya fue generado para esta copa" });
    }

    const jornadasSinCompletar = copa.jornadas.filter((j) => !j.completada);
    if (jornadasSinCompletar.length) {
      return res.status(400).json({
        error: `Quedan ${jornadasSinCompletar.length} jornada(s) sin resultado`,
        jornadasPendientes: jornadasSinCompletar.map((j) => j.numero),
      });
    }

    copa.generarBracket();
    await copa.save();

    res.json({ ok: true, bracket: copa.bracket, fase: copa.fase });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /:id/partido (privado) ────────────────────────────────────────────
router.put("/:id/partido", authMW, async (req, res) => {
  const { ronda, orden, ganador } = req.body;
  if (ronda === undefined || orden === undefined || !ganador) {
    return res.status(400).json({ error: "Faltan ronda, orden o ganador" });
  }

  try {
    const copa = await Copa.findById(req.params.id);
    if (!copa) return res.status(404).json({ error: "Copa no encontrada" });
    if (!tieneAcceso(copa, req.admin._id))
      return res.status(403).json({ error: "Sin acceso" });
    if (copa.fase === "jornadas") {
      return res
        .status(400)
        .json({ error: "Todavía no se ha generado el bracket" });
    }

    copa.registrarGanadorPartido(ronda, orden, ganador);
    await copa.save();

    res.json({
      ok: true,
      bracket: copa.bracket,
      fase: copa.fase,
      campeon: copa.campeon,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /:id (privado) ─────────────────────────────────────────────────
router.delete("/:id", authMW, async (req, res) => {
  try {
    const copa = await Copa.findById(req.params.id);
    if (!copa) return res.status(404).json({ error: "Copa no encontrada" });
    if (!tieneAcceso(copa, req.admin._id))
      return res.status(403).json({ error: "Sin acceso" });

    await copa.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
