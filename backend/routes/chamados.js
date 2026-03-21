const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

// Configurar multer para upload de imagens
const uploadDir = path.join(__dirname, '../uploads/chamados');
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
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// Criar novo chamado
router.post('/create', authenticateToken, upload.array('attachments', 5), [
  body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Título deve ter entre 3 e 120 caracteres'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Descrição deve ter entre 10 e 2000 caracteres'),
  body('priority').optional({ checkFalsy: true }).isIn(['baixa', 'normal', 'alta', 'urgente']).withMessage('Prioridade inválida'),
  body('category').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Categoria inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const priority = String(req.body.priority || 'normal').trim();
    const category = req.body.category ? String(req.body.category).trim() : null;
    const userId = req.user.id;
    const connection = await pool.getConnection();

    const [result] = await connection.query(
      'INSERT INTO chamados (user_id, title, description, priority, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [userId, title, description, priority || 'normal', category, 'aberto']
    );

    const chamadoId = result.insertId;

    // Salvar anexos
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await connection.query(
          'INSERT INTO chamado_attachments (chamado_id, file_name, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)',
          [chamadoId, file.originalname, file.path, file.mimetype, file.size]
        );
      }
    }

    connection.release();
    res.status(201).json({ message: 'Chamado criado com sucesso', chamadoId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar chamado' });
  }
});

// Listar chamados do usuário
router.get('/my-chamados', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const connection = await pool.getConnection();

    const [chamados] = await connection.query(
      'SELECT * FROM chamados WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Buscar anexos de cada chamado
    for (let chamado of chamados) {
      const [attachments] = await connection.query(
        'SELECT * FROM chamado_attachments WHERE chamado_id = ?',
        [chamado.id]
      );
      chamado.attachments = attachments;
    }

    connection.release();
    res.json(chamados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar chamados' });
  }
});

// Listar todos os chamados (admin)
router.get('/all', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [chamados] = await connection.query(
      'SELECT c.*, u.name as user_name FROM chamados c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC'
    );

    // Buscar anexos de cada chamado
    for (let chamado of chamados) {
      const [attachments] = await connection.query(
        'SELECT * FROM chamado_attachments WHERE chamado_id = ?',
        [chamado.id]
      );
      chamado.attachments = attachments;
    }

    connection.release();
    res.json(chamados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar chamados' });
  }
});

// Download de anexo do chamado
router.get('/download/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }
    const connection = await pool.getConnection();

    const [attachments] = await connection.query(
      'SELECT * FROM chamado_attachments WHERE id = ?',
      [attachmentId]
    );

    connection.release();

    if (!attachments || attachments.length === 0) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }

    const attachment = attachments[0];
    let filePath = attachment.file_path;
    filePath = path.normalize(filePath);

    console.log('[DOWNLOAD CHAMADO] Tentando acessar:', filePath);

    if (!fs.existsSync(filePath)) {
      console.error('[DOWNLOAD CHAMADO] Arquivo não encontrado:', filePath);
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    }

    // Download do arquivo
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
    
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (err) => {
      console.error('[DOWNLOAD CHAMADO] Erro ao ler arquivo:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao fazer download' });
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('[DOWNLOAD CHAMADO] Erro geral:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao fazer download: ' + error.message });
    }
  }
});

// Atualizar status do chamado
router.put('/:id/status', authenticateToken, authorizeRoles('admin'), [
  body('status').isIn(['aberto', 'pendente', 'fechado']).withMessage('Status inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const status = String(req.body.status || '').trim();
    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }
    const connection = await pool.getConnection();

    await connection.query(
      'UPDATE chamados SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, chamadoId]
    );

    connection.release();
    res.json({ message: 'Status atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar chamado' });
  }
});

// Atualizar chamado completo (admin)
router.put('/:id', authenticateToken, authorizeRoles('admin'), [
  body('title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 120 }).withMessage('Título deve ter entre 3 e 120 caracteres'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ min: 10, max: 2000 }).withMessage('Descrição deve ter entre 10 e 2000 caracteres'),
  body('priority').optional({ checkFalsy: true }).isIn(['baixa', 'normal', 'alta', 'urgente']).withMessage('Prioridade inválida'),
  body('category').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Categoria inválida'),
  body('status').optional({ checkFalsy: true }).isIn(['aberto', 'pendente', 'fechado']).withMessage('Status inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const title = req.body.title ? String(req.body.title).trim() : null;
    const description = req.body.description ? String(req.body.description).trim() : null;
    const priority = req.body.priority ? String(req.body.priority).trim() : null;
    const category = req.body.category ? String(req.body.category).trim() : null;
    const status = req.body.status ? String(req.body.status).trim() : null;

    if (!title && !description && !priority && !category && !status) {
      return res.status(400).json({ error: 'Informe ao menos um campo para atualizar' });
    }

    const connection = await pool.getConnection();
    const [result] = await connection.query(
      'UPDATE chamados SET title = COALESCE(?, title), description = COALESCE(?, description), priority = COALESCE(?, priority), category = COALESCE(?, category), status = COALESCE(?, status), updated_at = NOW() WHERE id = ?',
      [title, description, priority, category, status, chamadoId]
    );

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Chamado não encontrado' });
    }

    res.json({ message: 'Chamado atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar chamado' });
  }
});

module.exports = router;
