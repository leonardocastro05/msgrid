require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");

const app = express();

// ── Middlewares globales ───────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Servir frontend y uploads como estáticos ──────────────────
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Multer: subida de imágenes ────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, "uploads"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Rutas de la API ───────────────────────────────────────────
const authMW = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const copasRoutes = require("./routes/copas");

app.use("/api/auth", authRoutes);
app.use("/api/copas", copasRoutes);

app.post("/api/upload", authMW, upload.single("banner"), (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "No se subió ningún archivo" });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

// ── Fallback: rutas no-API devuelven index.html ───────────────
app.get("*splat", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ── Conexión a MongoDB y arranque ─────────────────────────────
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
