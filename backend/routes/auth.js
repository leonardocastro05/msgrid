const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const authMW = require('../middleware/auth');

const router = express.Router();

function generarToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register
// Solo puede registrar un superadmin existente (o si no hay ninguno aún)
router.post('/register', async (req, res) => {
  const { username, email, password, rol } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const totalAdmins = await Admin.countDocuments();
    // Si ya hay admins, solo un superadmin puede crear más
    if (totalAdmins > 0) {
      // Verificar token del que crea
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Solo un superadmin puede crear admins' });
      }
      const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      const creador = await Admin.findById(payload.id);
      if (!creador || creador.rol !== 'superadmin') {
        return res.status(403).json({ error: 'Solo un superadmin puede crear admins' });
      }
    }

    const admin = new Admin({
      username,
      email,
      password,
      rol: totalAdmins === 0 ? 'superadmin' : (rol || 'admin'),
    });
    await admin.save();

    const token = generarToken(admin._id);
    res.status(201).json({
      token,
      admin: { id: admin._id, username: admin.username, email: admin.email, rol: admin.rol },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email o username ya en uso' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos' });

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const ok = await admin.compararPassword(password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = generarToken(admin._id);
    res.json({
      token,
      admin: { id: admin._id, username: admin.username, email: admin.email, rol: admin.rol, ligas: admin.ligas },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — Comprobar token y devolver datos del admin
router.get('/me', authMW, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = router;