/**
 * backend/seed-admin.js
 *
 * Crea una cuenta de Admin directamente en MongoDB, sin pasar por ningún
 * endpoint público. Es la ÚNICA forma de crear cuentas en MS Grid — no
 * existe ninguna pantalla de registro en la web a propósito.
 *
 * Uso:
 *   node seed-admin.js --username=leo --email=leo@msgrid.com --password=algo-seguro --rol=superadmin
 *
 * Si --rol no se especifica, por defecto es "admin".
 * El script se conecta, crea el admin, y se desconecta solo.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");

// ─── Leer argumentos de la línea de comandos ───────────────────────────────
function leerArgumentos() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  });
  return args;
}

async function main() {
  const { username, email, password, rol } = leerArgumentos();

  if (!username || !email || !password) {
    console.error("❌ Faltan argumentos obligatorios.\n");
    console.log("Uso:");
    console.log(
      "  node seed-admin.js --username=leo --email=leo@msgrid.com --password=algo-seguro [--rol=superadmin]\n",
    );
    process.exit(1);
  }

  if (rol && !["admin", "superadmin"].includes(rol)) {
    console.error(
      `❌ --rol debe ser "admin" o "superadmin" (recibido: "${rol}")`,
    );
    process.exit(1);
  }

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error("❌ Falta MONGO_URI / MONGODB_URI en el .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB Atlas");

    const yaExiste = await Admin.findOne({ $or: [{ email }, { username }] });
    if (yaExiste) {
      console.error(
        `❌ Ya existe un admin con ese email o username (id: ${yaExiste._id})`,
      );
      process.exit(1);
    }

    const admin = new Admin({
      username,
      email,
      password, // se hashea solo gracias al pre('save') del modelo
      rol: rol || "admin",
    });
    await admin.save();

    console.log("\n✅ Cuenta creada correctamente:\n");
    console.log(`   ID:       ${admin._id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Rol:      ${admin.rol}\n`);
    console.log(
      "Guarda estas credenciales en un lugar seguro antes de cerrar la terminal.",
    );
  } catch (err) {
    console.error("❌ Error creando el admin:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
