const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('./auth');

// Configurar multer para upload de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/funcionarios');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'funcionario-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens JPEG, PNG ou WebP são permitidas'));
    }
  }
});

// Criar funcionário
router.post('/criar', authenticateToken, authorizeRoles('admin', 'creator'), upload.single('foto'), [
  body('nome').trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
  body('re').optional({ checkFalsy: true }).matches(/^[0-9]+$/).withMessage('RE deve conter apenas números'),
  body('cargo').trim().isLength({ min: 2, max: 100 }).withMessage('Cargo deve ter entre 2 e 100 caracteres'),
  body('email').trim().isEmail().withMessage('Email inválido'),
  body('ramal').optional({ checkFalsy: true }).matches(/^[0-9()+\-\s]{3,20}$/).withMessage('Ramal inválido'),
  body('departamento').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Departamento deve ter no máximo 100 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const nome = String(req.body.nome || '').trim();
    const re = String(req.body.re || '').trim();
    const cargo = String(req.body.cargo || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const ramal = String(req.body.ramal || '').trim();
    const departamento = String(req.body.departamento || '').trim();
    const connection = await pool.getConnection();

    // Inserir funcionário
    const result = await connection.query(
      'INSERT INTO funcionarios (nome, re, cargo, email, ramal, departamento, foto_name, foto_path, foto_size, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        nome,
        re || null,
        cargo,
        email,
        ramal || null,
        departamento || null,
        req.file ? req.file.filename : null,
        req.file ? `/uploads/funcionarios/${req.file.filename}` : null,
        req.file ? req.file.size : null,
        req.user.id
      ]
    );

    connection.release();
    res.status(201).json({
      message: 'Funcionário cadastrado com sucesso',
      id: result.insertId,
      foto_path: req.file ? `/uploads/funcionarios/${req.file.filename}` : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao cadastrar funcionário' });
  }
});

// Listar funcionários com paginação
router.get('/listar', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12; // 12 por página (3x4)
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();

    // Contar total de funcionários
    const [[{ total }]] = await connection.query(
      'SELECT COUNT(*) as total FROM funcionarios WHERE status = "ativo"'
    );

    // Buscar funcionários com paginação
    const [funcionarios] = await connection.query(
      'SELECT id, nome, re, cargo, ramal, email, foto_path, departamento, created_at FROM funcionarios WHERE status = "ativo" ORDER BY nome ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    connection.release();

    const totalPages = Math.ceil(total / limit);

    res.json({
      funcionarios: funcionarios,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: totalPages
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar funcionários' });
  }
});

// Obter funcionário por ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const funcionarioId = Number(req.params.id);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const connection = await pool.getConnection();
    const [funcionarios] = await connection.query(
      'SELECT * FROM funcionarios WHERE id = ?',
      [funcionarioId]
    );

    connection.release();

    if (funcionarios.length === 0) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    res.json(funcionarios[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar funcionário' });
  }
});

// Atualizar funcionário
router.put('/:id', authenticateToken, authorizeRoles('admin', 'creator'), upload.single('foto'), [
  body('nome').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
  body('re').optional({ checkFalsy: true }).matches(/^[0-9]+$/).withMessage('RE deve conter apenas números'),
  body('cargo').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Cargo deve ter entre 2 e 100 caracteres'),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Email inválido'),
  body('ramal').optional({ checkFalsy: true }).matches(/^[0-9()+\-\s]{3,20}$/).withMessage('Ramal inválido'),
  body('departamento').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Departamento deve ter no máximo 100 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const funcionarioId = Number(req.params.id);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const nome = req.body.nome ? String(req.body.nome).trim() : null;
    const re = req.body.re ? String(req.body.re).trim() : null;
    const cargo = req.body.cargo ? String(req.body.cargo).trim() : null;
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    const ramal = req.body.ramal ? String(req.body.ramal).trim() : null;
    const departamento = req.body.departamento ? String(req.body.departamento).trim() : null;
    const connection = await pool.getConnection();

    // Buscar funcionário atual
    const [existing] = await connection.query(
      'SELECT foto_path FROM funcionarios WHERE id = ?',
      [funcionarioId]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Se houver nova foto, deletar a anterior
    if (req.file && existing[0].foto_path) {
      const oldPath = path.join(__dirname, '..', existing[0].foto_path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Atualizar funcionário
    await connection.query(
      'UPDATE funcionarios SET nome = COALESCE(?, nome), re = COALESCE(?, re), cargo = COALESCE(?, cargo), email = COALESCE(?, email), ramal = COALESCE(?, ramal), departamento = COALESCE(?, departamento), foto_name = COALESCE(?, foto_name), foto_path = COALESCE(?, foto_path), foto_size = COALESCE(?, foto_size) WHERE id = ?',
      [
        nome || null,
        re || null,
        cargo || null,
        email || null,
        ramal || null,
        departamento || null,
        req.file ? req.file.filename : null,
        req.file ? `/uploads/funcionarios/${req.file.filename}` : null,
        req.file ? req.file.size : null,
        funcionarioId
      ]
    );

    connection.release();
    res.json({ message: 'Funcionário atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar funcionário' });
  }
});

// Deletar funcionário (soft delete - mudar status para inativo)
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  try {
    const funcionarioId = Number(req.params.id);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const connection = await pool.getConnection();

    const [existing] = await connection.query(
      'SELECT * FROM funcionarios WHERE id = ?',
      [funcionarioId]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Soft delete - marcar como inativo
    await connection.query(
      'UPDATE funcionarios SET status = "inativo" WHERE id = ?',
      [funcionarioId]
    );

    connection.release();
    res.json({ message: 'Funcionário removido com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar funcionário' });
  }
});

// Buscar funcionário por nome ou email
router.get('/buscar/:termo', authenticateToken, async (req, res) => {
  try {
    const termo = `%${req.params.termo}%`;
    const connection = await pool.getConnection();

    const [funcionarios] = await connection.query(
      'SELECT id, nome, re, cargo, ramal, email, foto_path, departamento FROM funcionarios WHERE (nome LIKE ? OR email LIKE ? OR cargo LIKE ? OR re LIKE ?) AND status = "ativo" ORDER BY nome ASC LIMIT 20',
      [termo, termo, termo, termo]
    );

    connection.release();
    res.json(funcionarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar funcionário' });
  }
});

module.exports = router;
