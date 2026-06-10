const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles, normalizeRole, normalizeModules } = require('./auth');

const DEFAULT_MODULES_BY_ROLE = {
  admin: ['chamados_ti', 'infraestrutura', 'inventario', 'funcionarios', 'usuarios', 'documentos', 'comunicados', 'ideias', 'frota'],
  creator: ['chamados_ti', 'infraestrutura', 'inventario', 'funcionarios', 'documentos', 'comunicados', 'ideias', 'frota'],
  viewer: ['chamados_ti', 'infraestrutura', 'inventario', 'funcionarios', 'documentos', 'comunicados', 'ideias', 'frota']
};
const ASSIGNMENT_MODULES = ['chamados_ti', 'infraestrutura', 'frota'];

function getPayloadModules(body, role) {
  if (Array.isArray(body.modules)) return normalizeModules(body.modules);
  return DEFAULT_MODULES_BY_ROLE[normalizeRole(role)] || [];
}

function getPayloadAssignmentModules(body, role) {
  if (normalizeRole(role) !== 'admin' || !Array.isArray(body.assignment_modules)) return [];
  return normalizeModules(body.assignment_modules)
    .filter(moduleKey => ASSIGNMENT_MODULES.includes(moduleKey));
}

async function replaceUserModules(connection, userId, modules) {
  await connection.query('DELETE FROM user_module_permissions WHERE user_id = ?', [userId]);
  const normalized = normalizeModules(modules);
  for (const moduleKey of normalized) {
    await connection.query(
      'INSERT IGNORE INTO user_module_permissions (user_id, module_key) VALUES (?, ?)',
      [userId, moduleKey]
    );
  }
}

const buildGeneratedEmail = (username) => {
  const cleaned = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '.');
  return `${cleaned || 'usuario'}@local.intranet`;
};

router.get('/list', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [users] = await connection.query(
      `SELECT u.id, u.username, u.email, u.name, u.role, u.birth_date, u.created_at,
              (SELECT GROUP_CONCAT(p.module_key ORDER BY p.module_key)
                 FROM user_module_permissions p
                WHERE p.user_id = u.id) AS modules_csv,
              (SELECT GROUP_CONCAT(a.module_key ORDER BY a.module_key)
                 FROM user_assignment_permissions a
                WHERE a.user_id = u.id) AS assignment_modules_csv
         FROM users u
        ORDER BY u.created_at DESC`
    );
    connection.release();
    res.json(users.map(user => ({
      ...user,
      modules: normalizeModules(user.modules_csv ? user.modules_csv.split(',') : []),
      assignment_modules: normalizeModules(user.assignment_modules_csv ? user.assignment_modules_csv.split(',') : [])
        .filter(moduleKey => ASSIGNMENT_MODULES.includes(moduleKey))
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuarios' });
  }
});

router.get('/search', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  let connection;
  try {
    const term = String(req.query.term || '').trim();
    const moduleKey = normalizeModules([req.query.module])[0] || null;
    if (term.length < 2) {
      return res.status(400).json({ error: 'Digite pelo menos 2 caracteres para buscar usuario' });
    }

    const like = `%${term}%`;
    const moduleJoin = moduleKey ? 'JOIN user_module_permissions p ON p.user_id = u.id AND p.module_key = ?' : '';
    const params = moduleKey ? [moduleKey, like, like, like] : [like, like, like];
    connection = await pool.getConnection();
    const [users] = await connection.query(
      `SELECT u.id, u.username, u.name, u.email, u.role
         FROM users u
         ${moduleJoin}
        WHERE u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ?
        ORDER BY u.name ASC, u.username ASC
        LIMIT 10`,
      params
    );

    res.json(users.map(user => ({
      ...user,
      role: normalizeRole(user.role)
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuarios' });
  } finally {
    if (connection) connection.release();
  }
});

router.post(
  '/create',
  authenticateToken,
  authorizeRoles('admin'),
  [
    body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Login deve ter entre 3 e 30 caracteres e usar apenas letras, numeros, ponto, underline ou hifen'),
    body('password').matches(/^[A-Za-z0-9]{6}$/).withMessage('Senha deve ter exatamente 6 numeros ou letras'),
    body('role').trim().isIn(['admin', 'creator', 'viewer']).withMessage('Perfil invalido'),
    body('email').optional().trim().isEmail().withMessage('Email invalido'),
    body('name').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }).withMessage('Nome invalido'),
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
      const role = requestedRole;
      const modules = getPayloadModules(req.body, role);
      const assignmentModules = getPayloadAssignmentModules(req.body, role);
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

      const [created] = await connection.query(
        'INSERT INTO users (username, email, password, name, role, birth_date, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [username, email, hashedPassword, name, role, birthDate]
      );
      await replaceUserModules(connection, created.insertId, modules);
      await replaceUserAssignmentModules(connection, created.insertId, assignmentModules);

      connection.release();
      res.status(201).json({ message: 'Usuario cadastrado com sucesso' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao cadastrar usuario' });
    }
  }
);

const updateUserValidators = [
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Login deve ter entre 3 e 30 caracteres e usar apenas letras, numeros, ponto, underline ou hifen'),
  body('password').optional({ values: 'falsy' }).matches(/^[A-Za-z0-9]{6}$/).withMessage('Nova senha deve ter exatamente 6 numeros ou letras'),
  body('role').trim().isIn(['admin', 'creator', 'viewer']).withMessage('Perfil invalido'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Email invalido'),
  body('name').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }).withMessage('Nome invalido'),
  body('birth_date').optional({ values: 'falsy' }).isISO8601().withMessage('Data de nascimento invalida')
];

async function updateUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Usuario invalido' });
    }

    if (Number(req.user.id) === userId) {
      return res.status(400).json({ error: 'Nao e permitido editar o proprio usuario por esta tela' });
    }

    const username = String(req.body.username || '').trim();
    const requestedRole = normalizeRole(req.body.role);
    const modules = getPayloadModules(req.body, requestedRole);
    const assignmentModules = getPayloadAssignmentModules(req.body, requestedRole);
    const name = req.body.name ? String(req.body.name).trim() : username;
    const birthDate = req.body.birth_date ? String(req.body.birth_date).trim() : null;
    const password = req.body.password ? String(req.body.password) : '';

    if (birthDate) {
      const normalizedBirthDate = new Date(`${birthDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (Number.isNaN(normalizedBirthDate.getTime()) || normalizedBirthDate > today) {
        return res.status(400).json({ error: 'Data de nascimento invalida' });
      }
    }

    const connection = await pool.getConnection();
    const [existingUser] = await connection.query(
      'SELECT id, email FROM users WHERE id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Usuario nao encontrado' });
    }

    const hasEmailPayload = Object.prototype.hasOwnProperty.call(req.body, 'email');
    const email = hasEmailPayload
      ? (req.body.email ? String(req.body.email).trim().toLowerCase() : buildGeneratedEmail(username))
      : existingUser[0].email;

    const [duplicates] = await connection.query(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?',
      [username, email, userId]
    );

    if (duplicates.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Login ou email ja existe' });
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.query(
        'UPDATE users SET username = ?, email = ?, password = ?, name = ?, role = ?, birth_date = ? WHERE id = ?',
        [username, email, hashedPassword, name, requestedRole, birthDate, userId]
      );
    } else {
      await connection.query(
        'UPDATE users SET username = ?, email = ?, name = ?, role = ?, birth_date = ? WHERE id = ?',
        [username, email, name, requestedRole, birthDate, userId]
      );
    }
    await replaceUserModules(connection, userId, modules);
    await replaceUserAssignmentModules(connection, userId, assignmentModules);

    connection.release();
    res.json({ message: 'Usuario atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar usuario' });
  }
}

async function replaceUserAssignmentModules(connection, userId, modules) {
  await connection.query('DELETE FROM user_assignment_permissions WHERE user_id = ?', [userId]);
  for (const moduleKey of modules) {
    await connection.query(
      'INSERT IGNORE INTO user_assignment_permissions (user_id, module_key) VALUES (?, ?)',
      [userId, moduleKey]
    );
  }
}

router.put('/:id', authenticateToken, authorizeRoles('admin'), updateUserValidators, updateUser);
router.post('/:id/update', authenticateToken, authorizeRoles('admin'), updateUserValidators, updateUser);

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
