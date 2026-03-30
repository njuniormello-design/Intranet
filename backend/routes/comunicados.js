const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');
const { body, validationResult } = require('express-validator');

function formatBirthdayNames(users) {
  const names = users
    .map((user) => String(user.name || user.username || '').trim())
    .filter(Boolean);

  if (names.length <= 1) {
    return names[0] || 'nos aniversariantes';
  }

  if (names.length === 2) {
    return `${names[0]} e ${names[1]}`;
  }

  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

async function ensureBirthdayAnnouncement(connection) {
  const [[dateRow]] = await connection.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today"
  );

  const [birthdayUsers] = await connection.query(
    `SELECT id, username, name
     FROM users
     WHERE birth_date IS NOT NULL
       AND MONTH(birth_date) = MONTH(CURDATE())
       AND DAY(birth_date) = DAY(CURDATE())
     ORDER BY name ASC, username ASC`
  );

  if (!birthdayUsers.length) {
    return;
  }

  const generatedKey = `birthday-${dateRow.today}`;
  const namesText = formatBirthdayNames(birthdayUsers);
  const title = birthdayUsers.length === 1
    ? 'Aniversariante do dia'
    : 'Aniversariantes do dia';
  const content = birthdayUsers.length === 1
    ? `Hoje celebramos o aniversario de ${namesText}. Desejamos um dia especial, com muita saude e sucesso!`
    : `Hoje celebramos o aniversario de ${namesText}. Desejamos um dia especial, com muita saude e sucesso a todos!`;

  const [existing] = await connection.query(
    'SELECT id FROM comunicados WHERE generated_key = ? LIMIT 1',
    [generatedKey]
  );

  if (existing.length) {
    await connection.query(
      `UPDATE comunicados
       SET title = ?, content = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, content, existing[0].id]
    );
    return;
  }

  const [authors] = await connection.query(
    `SELECT id
     FROM users
     ORDER BY CASE role
       WHEN 'admin' THEN 1
       WHEN 'creator' THEN 2
       ELSE 3
     END, id ASC
     LIMIT 1`
  );

  if (!authors.length) {
    return;
  }

  await connection.query(
    `INSERT INTO comunicados (user_id, title, content, priority, announcement_type, generated_key, created_at)
     VALUES (?, ?, ?, 'normal', 'birthday', ?, NOW())`,
    [authors[0].id, title, content, generatedKey]
  );
}

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
      `INSERT INTO comunicados (user_id, title, content, priority, announcement_type, created_at)
       VALUES (?, ?, ?, ?, 'manual', NOW())`,
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
      const [existing] = await connection.query(
        'SELECT announcement_type FROM comunicados WHERE id = ? LIMIT 1',
        [comunicadoId]
      );

      if (!existing.length) {
        connection.release();
        return res.status(404).json({ error: 'Comunicado não encontrado' });
      }

      if (existing[0].announcement_type === 'birthday') {
        connection.release();
        return res.status(403).json({ error: 'Comunicados automáticos de aniversário não podem ser editados' });
      }

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
    const [existing] = await connection.query(
      'SELECT announcement_type FROM comunicados WHERE id = ? LIMIT 1',
      [comunicadoId]
    );

    if (!existing.length) {
      connection.release();
      return res.status(404).json({ error: 'Comunicado não encontrado' });
    }

    if (existing[0].announcement_type === 'birthday') {
      connection.release();
      return res.status(403).json({ error: 'Comunicados automáticos de aniversário não podem ser deletados' });
    }

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
    await ensureBirthdayAnnouncement(connection);

    const [[{ total }]] = await connection.query(
      'SELECT COUNT(*) AS total FROM comunicados'
    );

    const [comunicados] = await connection.query(
      `SELECT c.*, u.name as author_name
       FROM comunicados c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ?`,
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
