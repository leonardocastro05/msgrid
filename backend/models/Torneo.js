const mongoose = require('mongoose');

// Un enfrentamiento individual del bracket
const PartidoSchema = new mongoose.Schema({
  ronda:     Number,          // 1 = final, 2 = semis, 4 = cuartos, etc.
  orden:     Number,          // posición dentro de la ronda
  equipo1:   { nombre: String, logo: String, puntos: Number },
  equipo2:   { nombre: String, logo: String, puntos: Number },
  ganador:   { type: String, default: null }, // nombre del ganador
  carreraId: { type: String, default: null }, // ID de carrera iGP asociada
  completado: { type: Boolean, default: false },
});

const TorneoSchema = new mongoose.Schema({
  nombre:    { type: String, required: true },
  liga:      { type: mongoose.Schema.Types.ObjectId, ref: 'Liga', required: true },
  tipo:      { type: String, enum: ['eliminatorio'], default: 'eliminatorio' },

  // Equipos participantes (mínimo 2, potencia de 2 para bracket limpio)
  participantes: [{
    nombre: String,
    logo:   String,
    seed:   Number,   // cabeza de serie
  }],

  partidos:  [PartidoSchema],
  estado:    { type: String, enum: ['borrador', 'activo', 'finalizado'], default: 'borrador' },
  ganador:   { type: String, default: null },
  creadoEn:  { type: Date, default: Date.now },
});

// Genera el bracket al iniciar el torneo
TorneoSchema.methods.generarBracket = function () {
  const n = this.participantes.length;
  if (n < 2) throw new Error('Mínimo 2 participantes');

  // Rellenar hasta potencia de 2 más cercana con "BYE"
  const potencia = Math.pow(2, Math.ceil(Math.log2(n)));
  const equipos = [...this.participantes];
  while (equipos.length < potencia) {
    equipos.push({ nombre: 'BYE', logo: '', seed: null });
  }

  this.partidos = [];
  let rondaActual = potencia / 2;  // número de partidos en la primera ronda
  let rondaNum = Math.log2(potencia);

  // Primera ronda: emparejamiento 1 vs N, 2 vs N-1, etc. (estilo torneo)
  for (let i = 0; i < rondaActual; i++) {
    const e1 = equipos[i];
    const e2 = equipos[potencia - 1 - i];
    const partido = {
      ronda:  rondaNum,
      orden:  i,
      equipo1: { nombre: e1.nombre, logo: e1.logo || '', puntos: null },
      equipo2: { nombre: e2.nombre, logo: e2.logo || '', puntos: null },
      ganador: e2.nombre === 'BYE' ? e1.nombre : null,
      completado: e2.nombre === 'BYE',
    };
    this.partidos.push(partido);
  }

  // Rondas vacías para las siguientes fases
  let partidosPorRonda = rondaActual / 2;
  rondaNum--;
  while (partidosPorRonda >= 1) {
    for (let i = 0; i < partidosPorRonda; i++) {
      this.partidos.push({
        ronda: rondaNum,
        orden: i,
        equipo1: { nombre: null, logo: '', puntos: null },
        equipo2: { nombre: null, logo: '', puntos: null },
        ganador: null,
        completado: false,
      });
    }
    rondaNum--;
    partidosPorRonda = Math.floor(partidosPorRonda / 2);
  }

  this.estado = 'activo';
};

module.exports = mongoose.model('Torneo', TorneoSchema);