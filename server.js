/**
 * NOVIX Backend - Fase 2
 * Servidor Node.js que convierte archivos .docx a HTML y los almacena.
 * Ejecutar con: node server.js
 */

const express    = require('express');
const multer     = require('multer');
const mammoth    = require('mammoth');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Carpeta donde se guardan los artículos como JSON ──────────────────────────
const DATA_FILE = path.join(__dirname, 'data', 'articles.json');
const DATA_DIR  = path.join(__dirname, 'data');

// Crear carpeta /data si no existe al arrancar
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Si el archivo de artículos no existe, crearlo vacío
if (!fs.existsSync(DATA_FILE)) {
  const initial = {
    ASTRONOMÍA: [], BIOGRAFÍAS: [], FILOSOFÍA: [], FÍSICA: [],
    GEOLOGÍA: [], HISTORIA: [], LITERATURA: [], MATEMÁTICAS: [],
    MÚSICA: [], POESÍA: [], TECNOLOGÍA: [], INVENCIÓN: [], EXTRAS: []
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
}

// ── Helpers para leer y escribir datos ────────────────────────────────────────
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Middleware ─────────────────────────────────────────────────────────────────
// Permite peticiones desde Vercel y desde local
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://novix-isabel.vercel.app',
    /\.vercel\.app$/,
    /\.up\.railway\.app$/,
  ],
  methods: ['GET', 'POST', 'DELETE'],
}));
app.use(express.json());                 // Parsea JSON en el body
// Sirve los archivos estáticos del frontend (novix.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Multer guarda el archivo subido en memoria (no en disco)
const upload = multer({ storage: multer.memoryStorage() });

// ── RUTAS ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/articles
 * Devuelve todos los artículos agrupados por categoría.
 */
app.get('/api/articles', (req, res) => {
  try {
    const data = readData();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/articles
 * Recibe un archivo .docx (o .txt), lo convierte a HTML y lo guarda.
 *
 * Body (multipart/form-data):
 *   title    : string  → Título del artículo
 *   category : string  → Categoría (ASTRONOMÍA, FÍSICA, etc.)
 *   file     : File    → Archivo .docx o .txt
 */
app.post('/api/articles', upload.single('file'), async (req, res) => {
  try {
    const { title, category } = req.body;

    // Validación básica
    if (!title || !category) {
      return res.status(400).json({ ok: false, error: 'Título y categoría son requeridos.' });
    }

    let htmlContent = '';

    if (req.file) {
      const filename = req.file.originalname.toLowerCase();

      if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
        // Usar mammoth para convertir el Word a HTML limpio.
        // mammoth preserva párrafos, negritas, cursivas, listas y encabezados.
        const result = await mammoth.convertToHtml(
          { buffer: req.file.buffer },
          {
            // Mapeamos los estilos de Word a etiquetas HTML sencillas
            styleMap: [
              "p[style-name='Heading 1'] => h2:fresh",
              "p[style-name='Heading 2'] => h3:fresh",
              "p[style-name='Heading 3'] => h4:fresh",
            ]
          }
        );
        htmlContent = result.value; // El HTML limpio del documento

        // mammoth puede avisar de cosas que no pudo convertir.
        // Las ignoramos silenciosamente para no interrumpir al usuario.

      } else if (filename.endsWith('.txt')) {
        // Para .txt: convertimos saltos de línea en párrafos HTML
        const text = req.file.buffer.toString('utf8');
        htmlContent = text
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => `<p>${line}</p>`)
          .join('');
      }
    }

    // Si no subió archivo, guardamos el artículo con contenido vacío
    if (!htmlContent) {
      htmlContent = `<p>Artículo: <strong>${title}</strong></p><p>No se adjuntó contenido.</p>`;
    }

    // Leer datos actuales, agregar el nuevo artículo y guardar
    const data = readData();

    if (!data[category]) data[category] = [];

    const newArticle = {
      id: Date.now(),          // ID único basado en timestamp
      title,
      category,
      content: htmlContent,    // HTML listo para renderizar en el navegador
      createdAt: new Date().toISOString()
    };

    data[category].push(newArticle);
    writeData(data);

    res.json({ ok: true, article: newArticle });

  } catch (err) {
    console.error('Error al publicar artículo:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/articles/:category/:id
 * Borra un artículo por su categoría e ID.
 */
app.delete('/api/articles/:category/:id', (req, res) => {
  try {
    const { category, id } = req.params;
    const data = readData();

    if (!data[category]) {
      return res.status(404).json({ ok: false, error: 'Categoría no encontrada.' });
    }

    const before = data[category].length;
    // Filtramos fuera el artículo con ese ID
    data[category] = data[category].filter(a => String(a.id) !== String(id));

    if (data[category].length === before) {
      return res.status(404).json({ ok: false, error: 'Artículo no encontrado.' });
    }

    writeData(data);
    res.json({ ok: true });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Arrancar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Servidor NOVIX corriendo en http://localhost:${PORT}`);
  console.log(`   Abre novix.html en tu navegador para usar la aplicación.\n`);
});
