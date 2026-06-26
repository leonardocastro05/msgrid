const mongoose = require('mongoose');

const LigaSchema = new mongoose.Schema({
  nombre:      { type: String, required: true },
  igpLigaId:   { type: String, required: true },   // ID de la liga en igpleaguemanager
  temporada:   { type: String, required: true },   // Temporada activa
  descripcion: { type: String, default: '' },
  logo:        { type: String, default: '' },

  // Credenciales iGP cifradas (AES-256)
  igpEmail:    { type: String, required: true },   // cifrado
  igpPassword: { type: String, required: true },   // cifrado

  // Admins con acceso a esta liga
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],

  // Cache básica de datos para no pedir siempre a iGP
  cache: {
    equipos:      { type: Array,  default: [] },
    calendario:   { type: Array,  default: [] },
    ultimaSync:   { type: Date,   default: null },
  },

  activa:    { type: Boolean, default: true },
  creadaEn:  { type: Date, default: Date.now },
});

module.exports = mongoose.model('Liga', LigaSchema);