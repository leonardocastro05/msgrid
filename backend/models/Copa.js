/**
 * backend/models/Copa.js
 *
 * Modelo de "Copa": torneo en dos fases.
 *  1. Fase de jornadas: TODOS los participantes corren en cada jornada.
 *     El admin introduce el orden de llegada y se reparten puntos según
 *     una tabla configurable (definida por el admin al crear la copa).
 *  2. Fase eliminatoria: los N primeros de la clasificación general pasan
 *     a un bracket de eliminación directa (octavos, cuartos, semis, final).
 */

const mongoose = require('mongoose');

// ─── Sub-esquemas ───────────────────────────────────────────────────────────

const ResultadoParticipanteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    posicion: { type: Number, required: true },
    puntos: { type: Number, default: 0 },
  },
  { _id: false }
);

const JornadaSchema = new mongoose.Schema(
  {
    numero: { type: Number, required: true },
    nombre: { type: String, default: '' },
    resultados: [ResultadoParticipanteSchema],
    completada: { type: Boolean, default: false },
  },
  { _id: false }
);

const PartidoSchema = new mongoose.Schema(
  {
    ronda: { type: Number, required: true },
    orden: { type: Number, required: true },
    participante1: { type: String, default: null },
    participante2: { type: String, default: null },
    ganador: { type: String, default: null },
    completado: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Esquema principal ──────────────────────────────────────────────────────

const CopaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  bannerUrl: { type: String, default: '' },

  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],

  participantes: [{ type: String, required: true }],

  tablaPuntos: { type: [Number], default: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },

  numJornadas: { type: Number, required: true },
  numClasificados: { type: Number, required: true },

  jornadas: [JornadaSchema],

  fase: {
    type: String,
    enum: ['jornadas', 'eliminatoria', 'finalizado'],
    default: 'jornadas',
  },

  bracket: [PartidoSchema],
  campeon: { type: String, default: null },

  creadoEn: { type: Date, default: Date.now },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
});

// ─── Virtual: clasificación general calculada dinámicamente ───────────────
CopaSchema.virtual('clasificacionGeneral').get(function () {
  const tabla = {};

  for (const nombre of this.participantes) {
    tabla[nombre] = { nombre, jornadasCorridas: 0, puntos: 0 };
  }

  for (const jornada of this.jornadas) {
    if (!jornada.completada) continue;
    for (const r of jornada.resultados) {
      if (!tabla[r.nombre]) continue;
      tabla[r.nombre].puntos += r.puntos;
      tabla[r.nombre].jornadasCorridas += 1;
    }
  }

  return Object.values(tabla).sort((a, b) => b.puntos - a.puntos);
});

CopaSchema.set('toJSON', { virtuals: true });
CopaSchema.set('toObject', { virtuals: true });

// ─── Métodos de instancia ───────────────────────────────────────────────────

CopaSchema.methods.generarJornadasVacias = function () {
  this.jornadas = [];
  for (let i = 1; i <= this.numJornadas; i++) {
    this.jornadas.push({ numero: i, resultados: [], completada: false });
  }
};

CopaSchema.methods.registrarResultadoJornada = function (numeroJornada, ordenLlegada) {
  const jornada = this.jornadas.find((j) => j.numero === numeroJornada);
  if (!jornada) throw new Error(`Jornada ${numeroJornada} no encontrada`);

  jornada.resultados = ordenLlegada.map((nombre, idx) => ({
    nombre,
    posicion: idx + 1,
    puntos: this.tablaPuntos[idx] || 0,
  }));
  jornada.completada = true;

  this.markModified('jornadas');
};

CopaSchema.methods.generarBracket = function () {
  const clasificados = this.clasificacionGeneral.slice(0, this.numClasificados).map((c) => c.nombre);

  let tamanoCuadro = 1;
  while (tamanoCuadro < clasificados.length) tamanoCuadro *= 2;

  const seeds = [...clasificados];
  while (seeds.length < tamanoCuadro) seeds.push(null);

  const rondaInicial = Math.log2(tamanoCuadro);

  const partidos = [];
  for (let i = 0; i < tamanoCuadro / 2; i++) {
    const p1 = seeds[i * 2];
    const p2 = seeds[i * 2 + 1];

    const ganadorAutomatico = p1 && !p2 ? p1 : !p1 && p2 ? p2 : null;

    partidos.push({
      ronda: rondaInicial,
      orden: i,
      participante1: p1,
      participante2: p2,
      ganador: ganadorAutomatico,
      completado: !!ganadorAutomatico,
    });
  }

  let rondaActual = rondaInicial - 1;
  let partidosRondaAnterior = tamanoCuadro / 2;
  while (rondaActual >= 1) {
    for (let i = 0; i < partidosRondaAnterior / 2; i++) {
      partidos.push({
        ronda: rondaActual,
        orden: i,
        participante1: null,
        participante2: null,
        ganador: null,
        completado: false,
      });
    }
    partidosRondaAnterior /= 2;
    rondaActual -= 1;
  }

  this.bracket = partidos;
  this.fase = 'eliminatoria';
  this.markModified('bracket');

  this._propagarGanadoresAutomaticos();
};

CopaSchema.methods._propagarGanadoresAutomaticos = function () {
  const completados = this.bracket.filter((p) => p.completado && p.ganador);
  for (const partido of completados) {
    this._avanzarGanador(partido.ronda, partido.orden, partido.ganador);
  }
};

CopaSchema.methods._avanzarGanador = function (ronda, orden, ganador) {
  const siguienteRonda = ronda - 1;
  if (siguienteRonda < 1) {
    this.campeon = ganador;
    this.fase = 'finalizado';
    return;
  }

  const siguienteOrden = Math.floor(orden / 2);
  const siguiente = this.bracket.find((p) => p.ronda === siguienteRonda && p.orden === siguienteOrden);
  if (!siguiente) return;

  if (orden % 2 === 0) {
    siguiente.participante1 = ganador;
  } else {
    siguiente.participante2 = ganador;
  }

  if (siguiente.participante1 && !siguiente.participante2) {
    siguiente.ganador = siguiente.participante1;
    siguiente.completado = true;
    this._avanzarGanador(siguienteRonda, siguienteOrden, siguiente.ganador);
  } else if (!siguiente.participante1 && siguiente.participante2) {
    siguiente.ganador = siguiente.participante2;
    siguiente.completado = true;
    this._avanzarGanador(siguienteRonda, siguienteOrden, siguiente.ganador);
  }
};

CopaSchema.methods.registrarGanadorPartido = function (ronda, orden, ganador) {
  const partido = this.bracket.find((p) => p.ronda === ronda && p.orden === orden);
  if (!partido) throw new Error('Partido no encontrado');
  if (partido.completado) throw new Error('Este partido ya tiene ganador');
  if (ganador !== partido.participante1 && ganador !== partido.participante2) {
    throw new Error('El ganador debe ser uno de los dos participantes del partido');
  }

  partido.ganador = ganador;
  partido.completado = true;
  this.markModified('bracket');

  this._avanzarGanador(ronda, orden, ganador);
};

module.exports = mongoose.model('Copa', CopaSchema);