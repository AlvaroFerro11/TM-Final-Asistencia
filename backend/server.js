require('dotenv').config();
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
const authRoutes = require('./auth');
app.use('/auth', authRoutes);
const rostroRoutes = require('./rostro');
app.use('/rostro', rostroRoutes);

const asistenciaRoutes = require('./asistencia');
app.use('/asistencia', asistenciaRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'API de FCC funcionando' });
});

app.listen(3000, async () => {
  console.log('Servidor corriendo en http://localhost:3000');
  try {

    await db.query('SELECT 1');
    console.log('Conectado a MySQL correctamente');
  } catch (e) {
    console.error('Error conectando a MySQL:', e.message);
  }
});