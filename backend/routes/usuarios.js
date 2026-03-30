const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles, normalizeRole } = require('./auth');

const buildGeneratedEmail = (username) => {
  const cleaned = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '.');
  return `${cleaned || 'usuario'}@local.intranet`;
};

router.get('/list', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [users] = await connection.query(
      'SELECT id, username, email, name, role, birth_date, created_at FROM users ORDER BY created_at DESC'
    );
    connection.release();
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuarios' });
  }
});

router.post(
  '/create',
  authenticateToken,
  authorizeRoles('admin', 'creator'),
  [
    body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Login deve ter entre 3 e 30 caracteres e usar apenas letras, numeros, ponto, underline ou hifen'),
    body('password').isLength({ min: 6, max: 72 }).withMessage('Senha deve ter entre 6 e 72 caracteres'),
    body('role').trim().isIn(['admin', 'creator', 'viewer']).withMessage('Perfil invalido'),
    body('email').optional().trim().isEmail().withMessage('Email invalido'),
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Nome invalido'),
    body('birth_date').optional({ values: 'falsy' }).isISO8601().withMessage('Data de nascimento invalida')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const username = String(req.body.username || '').trim();
      const password = String(req.body.password || '');
      const requestedRole = normalizeRole(req.body.role);
      const currentRole = normalizeRole(req.user.role);

      if (currentRole === 'creator' && !['viewer', 'creator'].includes(requestedRole)) {
        return res.status(403).json({ error: 'Criadores podem criar apenas usuarios visualizador ou criador' });
      }

      if (currentRole !== 'admin' && requestedRole === 'admin') {
        return res.status(403).json({ error: 'Apenas administradores podem criar usuarios admin' });
      }

      const role = requestedRole;
      const email = req.body.email ? String(req.body.email).trim().toLowerCase() : buildGeneratedEmail(username);
      const name = req.body.name ? String(req.body.name).trim() : username;
      const birthDate = req.body.birth_date ? String(req.body.birth_date).trim() : null;

      if (birthDate) {
        const normalizedBirthDate = new Date(`${birthDate}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (Number.isNaN(normalizedBirthDate.getTime()) || normalizedBirthDate > today) {
          return res.status(400).json({ error: 'Data de nascimento invalida' });
        }
      }

      const connection = await pool.getConnection();
      const [existing] = await connection.query(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existing.length > 0) {
        connection.release();
        return res.status(400).json({ error: 'Login ou email ja existe' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await connection.query(
        'INSERT INTO users (username, email, password, name, role, birth_date, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [username, email, hashedPassword, name, role, birthDate]
      );

      connection.release();
      res.status(201).json({ message: 'Usuario cadastrado com sucesso' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao cadastrar usuario' });
    }
  }
);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Nao e permitido remover o proprio usuario' });
    }

    const connection = await pool.getConnection();
    const [existing] = await connection.query('SELECT id FROM users WHERE id = ?', [userId]);

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Usuario nao encontrado' });
    }

    await connection.query('DELETE FROM users WHERE id = ?', [userId]);
    connection.release();
    res.json({ message: 'Usuario removido com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover usuario' });
  }
});

module.exports = router;
