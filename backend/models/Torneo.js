/**
 * backend/models/Torneo.js
 *
 * Modelo de torneo tipo "liga de fútbol":
 * cada jornada enfrenta dos equipos; el que acaba en mejor posición
 * en la carrera de iGP gana la jornada y suma 3 puntos.
 */

const mongoose = require("mongoose");

// ─── Sub-esquemas ─────────────────────────────────────────────────────────────

const ResultadoEnfrentamientoSchema = new mongoose.Schema(
  {
    posEquipo1: Number, // posición en carrera
    posEquipo2: Number,
    ganador: {
      type: String,
      enum: ["equipo1", "equipo2", "empate", null],
      default: null,
    },
    ptsEquipo1: { type: Number, default: 0 }, // 3=victoria, 1=empate, 0=derrota
    ptsEquipo2: { type: Number, default: 0 },
  },
  { _id: false },
);

const EnfrentamientoSchema = new mongoose.Schema({
  equipo1: { type: String, required: true },
  equipo2: { type: String, required: true },
  carreraId: { type: String, default: null }, // ID de carrera en iGPManager
  resultado: { type: ResultadoEnfrentamientoSchema, default: null },
  estado: { type: String, enum: ["pendiente", "jugado"], default: "pendiente" },
});

const JornadaSchema = new mongoose.Schema({
  numero: { type: Number, required: true },
  enfrentamientos: [EnfrentamientoSchema],
});

// ─── Esquema principal ────────────────────────────────────────────────────────

const TorneoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  ligaId: { type: mongoose.Schema.Types.ObjectId, ref: "Liga", required: true },
  temporada: { type: Number, default: 1 },
  // Equipos que participan (nombre tal como aparece en iGPManager)
  equipos: [{ nombre: { type: String, required: true }, igpNombre: String }],
  jornadas: [JornadaSchema],
  estado: { type: String, enum: ["activo", "finalizado"], default: "activo" },
  creadoEn: { type: Date, default: Date.now },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
});

// ─── Virtual: clasificación calculada dinámicamente ──────────────────────────
TorneoSchema.virtual("clasificacion").get(function () {
  const tabla = {};

  for (const equipo of this.equipos) {
    tabla[equipo.nombre] = {
      equipo: equipo.nombre,
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      pts: 0,
    };
  }

  for (const jornada of this.jornadas) {
    for (const enf of jornada.enfrentamientos) {
      if (enf.estado !== "jugado" || !enf.resultado) continue;

      const e1 = tabla[enf.equipo1];
      const e2 = tabla[enf.equipo2];
      if (!e1 || !e2) continue;

      e1.pj++;
      e2.pj++;

      const g = enf.resultado.ganador;
      if (g === "equipo1") {
        e1.pg++;
        e1.pts += 3;
        e2.pp++;
      } else if (g === "equipo2") {
        e2.pg++;
        e2.pts += 3;
        e1.pp++;
      } else {
        e1.pe++;
        e1.pts++;
        e2.pe++;
        e2.pts++;
      }
    }
  }

  return Object.values(tabla).sort((a, b) => b.pts - a.pts || b.pg - a.pg);
});

TorneoSchema.set("toJSON", { virtuals: true });
TorneoSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Torneo", TorneoSchema);
