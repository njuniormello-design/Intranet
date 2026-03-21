const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');
const { body, validationResult } = require('express-validator');

// Criar novo comunicado (admin)
router.post(
  '/create',
  authenticateToken,
  authorizeRoles('admin', 'creator'),
  [
    body('title').trim().isLength({ min: 3, max: 80 }).withMessage('Título deve ter entre 3 e 80 caracteres'),
    body('content').trim().isLength({ min: 1, max: 500 }).withMessage('O texto deve ter no máximo 500 caracteres'),
    body('priority').optional().isIn(['normal', 'alta']).withMessage('Prioridade inválida')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

  try {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const priority = String(req.body.priority || 'normal').trim();
    const userId = req.user.id;
    const connection = await pool.getConnection();

    await connection.query(
      'INSERT INTO comunicados (user_id, title, content, priority, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, title, content, priority || 'normal']
    );

    connection.release();
    res.status(201).json({ message: 'Comunicado criado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar comunicado' });
  }
  }
);

// Atualizar comunicado
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('admin', 'creator'),
  [
    body('title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 80 }).withMessage('Título deve ter entre 3 e 80 caracteres'),
    body('content').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 500 }).withMessage('O texto deve ter no máximo 500 caracteres'),
    body('priority').optional({ checkFalsy: true }).isIn(['normal', 'alta']).withMessage('Prioridade inválida')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const comunicadoId = Number(req.params.id);
      if (!Number.isInteger(comunicadoId) || comunicadoId <= 0) {
        return res.status(400).json({ error: 'ID invalido' });
      }

      const title = req.body.title ? String(req.body.title).trim() : null;
      const content = req.body.content ? String(req.body.content).trim() : null;
      const priority = req.body.priority ? String(req.body.priority).trim() : null;

      if (!title && !content && !priority) {
        return res.status(400).json({ error: 'Informe ao menos um campo para atualizar' });
      }

      const connection = await pool.getConnection();
      const [result] = await connection.query(
        'UPDATE comunicados SET title = COALESCE(?, title), content = COALESCE(?, content), priority = COALESCE(?, priority) WHERE id = ?',
        [title, content, priority, comunicadoId]
      );

      connection.release();

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Comunicado não encontrado' });
      }

      res.json({ message: 'Comunicado atualizado com sucesso' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao atualizar comunicado' });
    }
  }
);

// Deletar comunicado
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  try {
    const comunicadoId = Number(req.params.id);
    if (!Number.isInteger(comunicadoId) || comunicadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const connection = await pool.getConnection();
    const [result] = await connection.query(
      'DELETE FROM comunicados WHERE id = ?',
      [comunicadoId]
    );

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comunicado não encontrado' });
    }

    res.json({ message: 'Comunicado deletado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar comunicado' });
  }
});

// Listar comunicados
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const connection = await pool.getConnection();

    const [[{ total }]] = await connection.query(
      'SELECT COUNT(*) AS total FROM comunicados'
    );

    const [comunicados] = await connection.query(
      'SELECT c.*, u.name as author_name FROM comunicados c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC LIMIT ?',
      [limit]
    );

    connection.release();
    res.setHeader('X-Total-Count', String(total));
    res.json(comunicados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar comunicados' });
  }
});

// Obter um comunicado específico
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const comunicadoId = Number(req.params.id);
    if (!Number.isInteger(comunicadoId) || comunicadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const connection = await pool.getConnection();

    const [comunicado] = await connection.query(
      'SELECT c.*, u.name as author_name FROM comunicados c JOIN users u ON c.user_id = u.id WHERE c.id = ?',
      [comunicadoId]
    );

    if (comunicado.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Comunicado não encontrado' });
    }

    connection.release();
    res.json(comunicado[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar comunicado' });
  }
});

module.exports = router;
