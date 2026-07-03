const express = require('express');
const db = require('./db');
const router = express.Router();

// Compara dos vectores y devuelve qué tan parecidos son (0 a 1)
function similitudCoseno(a, b) {
  let punto = 0, normaA = 0, normaB = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i];
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }
  return punto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}
// Verificar rostro y registrar asistencia
router.post('/verificar', async (req, res) => {
  try {
    console.log('LLEGÓ AL SERVIDOR:', req.body);
    const { estudianteId, curso, embedding } = req.body;
    const UMBRAL = 0.65; // se calibra después con pruebas reales

    // 1. Traer el embedding guardado del estudiante
    const [rows] = await db.query(
      'SELECT vector FROM embeddings WHERE estudiante_id = ?',
      [estudianteId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'El estudiante no tiene rostro registrado' });
    }

    // 2. Comparar el rostro guardado con el actual
    const raw = rows[0].vector;
    const guardado = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const similitud = similitudCoseno(embedding, guardado);

    // 3. Si no supera el umbral, no registra
    if (similitud < UMBRAL) {
      return res.json({ ok: false, similitud: similitud.toFixed(2) });
    }

    // 4. Si supera el umbral, registrar la asistencia
    await db.query(
      `INSERT INTO asistencias (estudiante_id, curso, fecha, hora, similitud)
       VALUES (?, ?, CURDATE(), CURTIME(), ?)`,
      [estudianteId, curso, similitud]
    );

    res.json({ ok: true, similitud: similitud.toFixed(2), mensaje: 'Asistencia registrada' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Historial del estudiante (sus propias asistencias)
router.get('/mias/:estudianteId', async (req, res) => {
  try {
    const { estudianteId } = req.params;
    const [rows] = await db.query(
      `SELECT curso, fecha, hora, similitud
       FROM asistencias
       WHERE estudiante_id = ?
       ORDER BY fecha DESC, hora DESC`,
      [estudianteId]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Historial de un curso (para el docente)
router.get('/curso/:curso', async (req, res) => {
  try {
    const { curso } = req.params;
    const [rows] = await db.query(
      `SELECT u.codigo, u.nombre, a.fecha, a.hora, a.similitud
       FROM asistencias a
       JOIN usuarios u ON u.id = a.estudiante_id
       WHERE a.curso = ?
       ORDER BY a.fecha DESC, a.hora DESC`,
      [curso]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
module.exports = router;