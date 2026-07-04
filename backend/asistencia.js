const express = require('express');
const db = require('./db');
const router = express.Router();
const PDFDocument = require('pdfkit');

// Obtener fecha y hora actual en Perú
function obtenerFechaHoraPeru() {
  const ahora = new Date();

  const fecha = ahora.toLocaleDateString('en-CA', {
    timeZone: 'America/Lima'
  }); // YYYY-MM-DD

  const hora = ahora.toLocaleTimeString('en-GB', {
    timeZone: 'America/Lima',
    hour12: false
  }); // HH:mm:ss

  return { fecha, hora };
}

// Compara dos vectores y devuelve qué tan parecidos son
function similitudCoseno(a, b) {
  let punto = 0;
  let normaA = 0;
  let normaB = 0;

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
    const UMBRAL = 0.65;

    if (!estudianteId || !curso || !embedding) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos: estudianteId, curso o embedding'
      });
    }

    const [rows] = await db.query(
      'SELECT vector FROM embeddings WHERE estudiante_id = ?',
      [estudianteId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'El estudiante no tiene rostro registrado'
      });
    }

    const raw = rows[0].vector;
    const guardado = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const similitud = similitudCoseno(embedding, guardado);

    if (similitud < UMBRAL) {
      return res.json({
        ok: false,
        similitud: similitud.toFixed(2),
        mensaje: 'Rostro no coincide'
      });
    }

    const { fecha, hora } = obtenerFechaHoraPeru();

    await db.query(
      `INSERT INTO asistencias (estudiante_id, curso, fecha, hora, similitud)
       VALUES (?, ?, ?, ?, ?)`,
      [estudianteId, curso, fecha, hora, similitud]
    );

    res.json({
      ok: true,
      similitud: similitud.toFixed(2),
      mensaje: 'Asistencia registrada',
      fecha,
      hora,
      estado: 'Registrada'
    });

  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        error: 'Ya registraste asistencia para este curso el día de hoy',
        estado: 'Registrada'
      });
    }

    res.status(400).json({
      ok: false,
      error: e.message
    });
  }
});

// Verificar asistencia de hoy
// Sirve para cambiar la tarjeta "Asistencia de hoy: Pendiente" a "Registrada"
router.get('/hoy/:estudianteId', async (req, res) => {
  try {
    const { estudianteId } = req.params;
    const { fecha } = obtenerFechaHoraPeru();

    const [rows] = await db.query(
      `SELECT
          id,
          curso,
          DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
          TIME_FORMAT(hora, '%H:%i:%s') AS hora,
          similitud
       FROM asistencias
       WHERE estudiante_id = ?
       AND fecha = ?
       ORDER BY hora DESC
       LIMIT 1`,
      [estudianteId, fecha]
    );

    if (rows.length === 0) {
      return res.json({
        registrada: false,
        estado: 'Pendiente',
        mensaje: 'Aún no registras asistencia hoy'
      });
    }

    res.json({
      registrada: true,
      estado: 'Registrada',
      mensaje: 'Asistencia registrada hoy',
      asistencia: rows[0]
    });

  } catch (e) {
    res.status(400).json({
      error: e.message
    });
  }
});

// Historial del estudiante
router.get('/mias/:estudianteId', async (req, res) => {
  try {
    const { estudianteId } = req.params;

    const [rows] = await db.query(
      `SELECT
          id,
          curso,
          DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
          TIME_FORMAT(hora, '%H:%i:%s') AS hora,
          similitud
       FROM asistencias
       WHERE estudiante_id = ?
       ORDER BY fecha DESC, hora DESC`,
      [estudianteId]
    );

    res.json(rows);

  } catch (e) {
    res.status(400).json({
      error: e.message
    });
  }
});

// Resumen del historial del estudiante
// Sirve para actualizar el número total de asistencias
router.get('/resumen/:estudianteId', async (req, res) => {
  try {
    const { estudianteId } = req.params;

    const [rows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM asistencias
       WHERE estudiante_id = ?`,
      [estudianteId]
    );

    res.json({
      total: rows[0].total
    });

  } catch (e) {
    res.status(400).json({
      error: e.message
    });
  }
});

// Historial de un curso para el docente
router.get('/curso/:curso', async (req, res) => {
  try {
    const { curso } = req.params;

    const [rows] = await db.query(
      `SELECT
          u.codigo,
          u.nombre,
          a.curso,
          DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
          TIME_FORMAT(a.hora, '%H:%i:%s') AS hora,
          a.similitud
       FROM asistencias a
       JOIN usuarios u ON u.id = a.estudiante_id
       WHERE a.curso = ?
       ORDER BY a.fecha DESC, a.hora DESC`,
      [curso]
    );

    res.json(rows);

  } catch (e) {
    res.status(400).json({
      error: e.message
    });
  }
});

// Generar PDF del registro de asistencia
router.get('/reporte/pdf', async (req, res) => {
  try {
    const curso = req.query.curso || 'Moviles';

    const [rows] = await db.query(
      `SELECT
          u.codigo,
          u.nombre,
          a.curso,
          DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
          TIME_FORMAT(a.hora, '%H:%i:%s') AS hora,
          a.similitud
       FROM asistencias a
       JOIN usuarios u ON u.id = a.estudiante_id
       WHERE a.curso = ?
       ORDER BY a.fecha DESC, a.hora DESC`,
      [curso]
    );

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="registro_asistencia_${curso}.pdf"`
    );

    doc.pipe(res);

    const verde = '#00A650';
    const { fecha, hora } = obtenerFechaHoraPeru();

    // Encabezado
    doc.fillColor(verde).fontSize(20).text('UCSM SmartAttend', {
      align: 'center'
    });

    doc.fillColor('black').fontSize(14).text('Registro de Asistencia', {
      align: 'center'
    });

    doc.moveDown(1);

    // Datos generales
    doc.fontSize(10).fillColor('black');
    doc.text(`Curso: ${curso}`);
    doc.text(`Fecha de emisión: ${fecha}`);
    doc.text(`Hora de emisión: ${hora}`);
    doc.text(`Total de registros: ${rows.length}`);
    doc.moveDown(1);

    // Tabla
    const startX = 40;
    let y = doc.y;

    const cols = [
      { t: 'N°', w: 30 },
      { t: 'Código', w: 80 },
      { t: 'Nombre', w: 160 },
      { t: 'Fecha', w: 80 },
      { t: 'Hora', w: 60 },
      { t: 'Estado', w: 90 }
    ];

    function fila(datos, negrita, colorFondo) {
      let x = startX;
      const altura = 22;

      if (y > 720) {
        doc.addPage();
        y = 40;
      }

      if (colorFondo) {
        doc.rect(startX, y, 500, altura).fill(colorFondo);
      }

      doc.fillColor('black').fontSize(9);
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica');

      cols.forEach((c, i) => {
        doc.text(String(datos[i]), x + 3, y + 6, {
          width: c.w - 6
        });
        x += c.w;
      });

      doc.rect(startX, y, 500, altura).stroke();
      y += altura;
    }

    fila(cols.map(c => c.t), true, '#E8FFF3');

    if (rows.length === 0) {
      doc.font('Helvetica')
        .fontSize(11)
        .text('No hay asistencias registradas para este curso.', startX, y + 10);
    } else {
      rows.forEach((r, idx) => {
        fila([
          idx + 1,
          r.codigo,
          r.nombre,
          r.fecha,
          r.hora,
          'Presente'
        ], false, null);
      });
    }

    // Observaciones y firmas
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(10).fillColor('black');
    doc.text('Observaciones:', startX, doc.y);
    doc.moveDown(0.5);
    doc.text('_______________________________________________________________');
    doc.moveDown(3);
    doc.text('______________________                 ______________________');
    doc.text('   Firma del docente                        Coordinación académica');

    doc.end();

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

module.exports = router;