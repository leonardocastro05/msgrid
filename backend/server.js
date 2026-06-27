require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

// ── Middlewares globales ───────────────────────────────
app.use(cors());
app.use(express.json());

// ── Servir el frontend como estático ───────────────────
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ── Rutas de la API ─────────────────────────────────────
const authRoutes = require("./routes/auth");
const copasRoutes = require("./routes/copas");

app.use("/api/copas", copasRoutes);
app.use("/api/auth", authRoutes);

// ── Fallback: cualquier ruta no-API devuelve el index.html ──
app.get("*splat", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ── Conexión a MongoDB Atlas y arranque del servidor ───
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("❌ Falta MONGO_URI / MONGODB_URI en el .env");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Conectado a MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Error conectando a MongoDB:", err.message);
    process.exit(1);
  });
