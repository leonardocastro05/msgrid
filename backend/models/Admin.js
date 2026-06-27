const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  // Copas que gestiona este admin (referencia)
  copas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Copa" }],
  rol: { type: String, enum: ["superadmin", "admin"], default: "admin" },
  creadoEn: { type: Date, default: Date.now },
});

// Hash de contraseña antes de guardar
AdminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Comparar contraseña
AdminSchema.methods.compararPassword = function (candidata) {
  return bcrypt.compare(candidata, this.password);
};

module.exports = mongoose.model("Admin", AdminSchema);
