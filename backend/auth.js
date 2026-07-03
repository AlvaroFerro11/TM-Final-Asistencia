const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();
router.post('/register', async (req, res) => {
  try {
    const { codigo, nombre, password, rol } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO usuarios (codigo, nombre, password_hash, rol) VALUES (?, ?, ?, ?)',
      [codigo, nombre, hash, rol]
    );
    res.json({ mensaje: 'Usuario registrado correctamente' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { codigo, password } = req.body;
    const [rows] = await db.query('SELECT * FROM usuarios WHERE codigo = ?', [codigo]);
    if (rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
    const usuario = rows[0];
    const valido = await bcrypt.compare(password, usuario.password_hash);
    if (!valido) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, rol: usuario.rol, nombre: usuario.nombre });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
module.exports = router;