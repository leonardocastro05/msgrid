const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  // Ligas que gestiona este admin (referencia)
  ligas:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Liga' }],
  rol:      { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
  creadoEn: { type: Date, default: Date.now },
});

// Hash de contraseña antes de guardar
AdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Comparar contraseña
AdminSchema.methods.compararPassword = function (candidata) {
  return bcrypt.compare(candidata, this.password);
};

module.exports = mongoose.model('Admin', AdminSchema);