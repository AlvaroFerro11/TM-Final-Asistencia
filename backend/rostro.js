const express = require('express');
const db = require('./db');
const router = express.Router();
// Guardar el embedding de un estudiante
router.post('/registrar', async (req, res) => {
  try {
    const { estudianteId, embedding } = req.body;
    // Guardamos el vector como texto JSON
    await db.query(
      `INSERT INTO embeddings (estudiante_id, vector)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE vector = ?, fecha_registro = NOW()`,
      [estudianteId, JSON.stringify(embedding), JSON.stringify(embedding)]
    );
    res.json({ mensaje: 'Rostro registrado correctamente' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
module.exports = router;