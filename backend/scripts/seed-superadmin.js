/**
 * seed-superadmin.js
 *
 * Crea (o actualiza) un usuario superadmin en la base de datos.
 * Uso:
 *   node scripts/seed-superadmin.js
 *
 * Requiere en backend/.env:
 *   MONGODB_URI=mongodb+srv://...
 *   SUPERADMIN_EMAIL=admin@tudominio.com
 *   SUPERADMIN_PASSWORD=TuContraseñaSegura123!
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // o "bcrypt" si usas la versión nativa
require("dotenv").config();

// ─────────────────────────────────────────────────────────────────
// AJUSTA estas dos líneas si tu modelo o campo de rol se llama distinto
// ─────────────────────────────────────────────────────────────────
const User = require("../models/User"); // <-- cambia la ruta si es distinta
const SUPERADMIN_ROLE = "superadmin"; // <-- cambia si tu rol se llama distinto

// ─────────────────────────────────────────────────────────────────

async function seedSuperAdmin() {
  // 1. Validar variables de entorno
  const { MONGODB_URI, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } = process.env;

  if (!MONGODB_URI || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
    console.error(
      "❌ Faltan variables de entorno:\n" +
        "   MONGODB_URI, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD",
    );
    process.exit(1);
  }

  // 2. Conectar a MongoDB
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Conectado a MongoDB");
  } catch (err) {
    console.error("❌ Error al conectar:", err.message);
    process.exit(1);
  }

  // 3. Crear o actualizar el superadmin
  try {
    const hashedPassword = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);

    const superAdmin = await User.findOneAndUpdate(
      { email: SUPERADMIN_EMAIL },
      {
        $set: {
          email: SUPERADMIN_EMAIL,
          password: hashedPassword,
          role: SUPERADMIN_ROLE,
          // Añade aquí cualquier otro campo que requiera tu modelo:
          // name: "Super Admin",
          // isActive: true,
        },
      },
      {
        upsert: true, // Si no existe, lo crea
        new: true, // Devuelve el documento actualizado
        runValidators: true,
      },
    );

    console.log(
      `✅ Superadmin ${superAdmin.email ? "creado/actualizado" : "procesado"} correctamente`,
    );
    console.log(`   Email: ${SUPERADMIN_EMAIL}`);
    console.log(`   Role:  ${SUPERADMIN_ROLE}`);
    console.log(`   ID:    ${superAdmin._id}`);
  } catch (err) {
    console.error("❌ Error al crear el superadmin:", err.message);

    // Ayuda extra si falla la validación del schema
    if (err.name === "ValidationError") {
      console.error(
        "\n💡 Pista: puede que tu modelo tenga campos obligatorios extra.\n" +
          "   Añádelos en el bloque $set de este script.",
      );
    }
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Desconectado de MongoDB");
  }
}

seedSuperAdmin();
