require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const app = express();

// ── Cloudinary ────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Middlewares globales ───────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Servir frontend estático ───────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ── Rutas de la API ───────────────────────────────────────────
const authMW = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const copasRoutes = require("./routes/copas");

app.use("/api/auth", authRoutes);
app.use("/api/copas", copasRoutes);

// ── Upload de imágenes a Cloudinary ───────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.post("/api/upload", authMW, upload.single("banner"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "No se subió ningún archivo" });
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "msgrid-banners" }, (error, result) =>
          error ? reject(error) : resolve(result),
        )
        .end(req.file.buffer);
    });
    res.json({ ok: true, url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
