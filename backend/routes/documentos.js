const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

// Configurar multer para upload de documentos
const uploadDir = path.join(__dirname, '../uploads/documentos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) }
});

// Upload de documento
router.post('/upload', authenticateToken, authorizeRoles('admin', 'creator'), upload.single('document'), [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Nome deve ter entre 2 e 120 caracteres'),
  body('category').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Categoria invalida'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Descricao deve ter no maximo 500 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo do documento e obrigatorio' });
    }

    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim();
    const description = String(req.body.description || '').trim();
    const userId = req.user.id;
    const connection = await pool.getConnection();

    await connection.query(
      'INSERT INTO documentos (user_id, name, category, description, file_path, file_name, file_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [userId, name, category || null, description || null, req.file.path, req.file.originalname, req.file.mimetype, req.file.size]
    );

    connection.release();
    res.status(201).json({ message: 'Documento enviado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao enviar documento' });
  }
});

// Listar documentos
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    const connection = await pool.getConnection();

    let query = 'SELECT d.*, u.name as uploader_name FROM documentos d JOIN users u ON d.user_id = u.id';
    let params = [];

    if (category) {
      query += ' WHERE d.category = ?';
      params.push(category);
    }

    query += ' ORDER BY d.created_at DESC';

    const [documentos] = await connection.query(query, params);

    connection.release();
    
    // Formatar caminhos para download
    const docs = documentos.map(d => ({
      ...d,
      download_url: `/uploads/documentos/${path.basename(d.file_path)}`
    }));
    
    res.json(docs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
});

// Listar categorias
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [categories] = await connection.query(
      'SELECT DISTINCT category FROM documentos WHERE category IS NOT NULL ORDER BY category'
    );

    connection.release();
    res.json(categories.map(c => c.category));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

// Download de documento
router.get('/download/:id', authenticateToken, async (req, res) => {
  try {
    const documentoId = Number(req.params.id);
    if (!Number.isInteger(documentoId) || documentoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }
    const connection = await pool.getConnection();

    const [documentos] = await connection.query('SELECT file_path, file_name FROM documentos WHERE id = ?', [documentoId]);

    connection.release();

    if (!documentos || documentos.length === 0) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    let filePath = documentos[0].file_path;
    const fileName = documentos[0].file_name;

    // Normalizar caminho
    filePath = path.normalize(filePath);
    
    console.log('[DOWNLOAD] ID:', documentoId);
    console.log('[DOWNLOAD] Caminho completo:', filePath);
    console.log('[DOWNLOAD] Arquivo existe?', fs.existsSync(filePath));

    // Verificar se arquivo existe
    if (!fs.existsSync(filePath)) {
      console.error('[DOWNLOAD] Arquivo não encontrado:', filePath);
      
      // Tentar encontrar alternativas
      const uploadDir = path.join(__dirname, '../uploads/documentos');
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        console.log('[DOWNLOAD] Arquivos disponíveis:', files.slice(0, 5));
      }
      
      return res.status(404).json({ error: 'Arquivo não encontrado: ' + filePath });
    }

    // Download do arquivo com headers apropriados
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (err) => {
      console.error('[DOWNLOAD] Erro ao ler arquivo:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao fazer download' });
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('[DOWNLOAD] Erro geral:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao fazer download: ' + error.message });
    }
  }
});

// Deletar documento
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  try {
    const documentoId = Number(req.params.id);
    if (!Number.isInteger(documentoId) || documentoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }
    const connection = await pool.getConnection();

    const [documento] = await connection.query('SELECT file_path FROM documentos WHERE id = ?', [documentoId]);

    if (documento.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    // Deletar arquivo
    if (fs.existsSync(documento[0].file_path)) {
      fs.unlinkSync(documento[0].file_path);
    }

    await connection.query('DELETE FROM documentos WHERE id = ?', [documentoId]);

    connection.release();
    res.json({ message: 'Documento deletado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar documento' });
  }
});

module.exports = router;
