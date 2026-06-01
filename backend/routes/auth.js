const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

const normalizeRole = (role) => {
  if (!role) return 'viewer';

  const normalized = String(role).toLowerCase();
  if (normalized === 'user') return 'viewer';
  if (normalized === 'moderator') return 'creator';
  if (['admin', 'creator', 'viewer'].includes(normalized)) return normalized;

  return 'viewer';
};

const normalizeModules = (modules) => {
  const allowed = new Set([
    'chamados_ti',
    'infraestrutura',
    'inventario',
    'funcionarios',
    'usuarios',
    'documentos',
    'comunicados',
    'ideias',
    'frota'
  ]);

  return [...new Set((Array.isArray(modules) ? modules : [])
    .map(module => String(module || '').trim().toLowerCase())
    .filter(module => allowed.has(module)))];
};

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 'TOKEN_MISSING', error: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        error: isExpired ? 'Sessão expirada. Faça login novamente.' : 'Token inválido'
      });
    }

    (async () => {
      const connection = await pool.getConnection();
      const [users] = await connection.query(
        'SELECT id, username, name, email, role FROM users WHERE id = ?',
        [user.id]
      );
      if (users.length === 0) {
        connection.release();
        return res.status(401).json({ code: 'TOKEN_INVALID', error: 'Token inválido' });
      }

      const [permissions] = await connection.query(
        'SELECT module_key FROM user_module_permissions WHERE user_id = ? ORDER BY module_key',
        [users[0].id]
      );

      req.user = {
        ...user,
        ...users[0],
        role: normalizeRole(users[0].role),
        modules: normalizeModules(permissions.map(permission => permission.module_key))
      };
      connection.release();
      return next();
    })().catch((lookupError) => {
      console.error(lookupError);
      return res.status(500).json({ error: 'Erro ao validar token' });
    });
  });
};

const authorizeRoles = (...roles) => {
  const allowedRoles = roles.map(normalizeRole);

  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Voce nao tem permissao para executar esta acao' });
    }

    next();
  };
};

// Registrar novo usuario
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Usuario deve ter entre 3 e 30 caracteres'),
  body('email').trim().isEmail().withMessage('Email invalido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter no minimo 6 caracteres'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const role = normalizeRole(req.body.role);
    const connection = await pool.getConnection();

    // Verificar se usuario ja existe
    const [existing] = await connection.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Usuario ou email ja existe' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar usuario
    await connection.query(
      'INSERT INTO users (username, email, password, name, role, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [username, email, hashedPassword, name, role]
    );

    connection.release();
    res.status(201).json({ message: 'Usuario registrado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar usuario' });
  }
});

// Login
router.post('/login', [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Usuario deve ter entre 3 e 30 caracteres'),
  body('password').notEmpty().withMessage('Senha e obrigatoria')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const connection = await pool.getConnection();

    let [users] = await connection.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username.toLowerCase()]
    );

    if (users.length === 0 && username.includes('.')) {
      const usernameAlias = username.split('.')[0];
      [users] = await connection.query(
        'SELECT * FROM users WHERE username = ?',
        [usernameAlias]
      );
    }

    if (users.length === 0) {
      connection.release();
      return res.status(401).json({ error: 'Usuario ou senha invalidos' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      connection.release();
      return res.status(401).json({ error: 'Usuario ou senha invalidos' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, email: user.email, role: normalizeRole(user.role) },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    const [permissions] = await connection.query(
      'SELECT module_key FROM user_module_permissions WHERE user_id = ? ORDER BY module_key',
      [user.id]
    );
    connection.release();
    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: normalizeRole(user.role),
        modules: normalizeModules(permissions.map(permission => permission.module_key))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Verificar token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Alterar a propria senha
router.post('/change-password', authenticateToken, async (req, res) => {
  let connection;

  try {
    const password = String(req.body.password || '');

    if (!/^[A-Za-z0-9]{6}$/.test(password)) {
      return res.status(400).json({ error: 'Senha deve ter exatamente 6 numeros ou letras' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    connection = await pool.getConnection();

    await connection.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.authorizeRoles = authorizeRoles;
module.exports.normalizeRole = normalizeRole;
module.exports.normalizeModules = normalizeModules;
