const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');
const { body, validationResult } = require('express-validator');

async function ensureIdeiasTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ideias (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      titulo VARCHAR(150) NOT NULL,
      descricao TEXT NOT NULL,
      categoria VARCHAR(100),
      status VARCHAR(50) DEFAULT 'nova',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_ideias_user_id (user_id),
      INDEX idx_ideias_status (status),
      INDEX idx_ideias_created_at (created_at)
    )
  `);
}

router.post(
  '/create',
  authenticateToken,
  [
    body('titulo').trim().isLength({ min: 3, max: 150 }).withMessage('Titulo deve ter entre 3 e 150 caracteres'),
    body('descricao').trim().isLength({ min: 10, max: 2000 }).withMessage('Descricao deve ter entre 10 e 2000 caracteres'),
    body('categoria').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Categoria deve ter no maximo 100 caracteres')
  ],
  async (req, res) => {
    let connection;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const titulo = String(req.body.titulo || '').trim();
      const descricao = String(req.body.descricao || '').trim();
      const categoria = String(req.body.categoria || '').trim() || null;
      connection = await pool.getConnection();
      await ensureIdeiasTable(connection);

      const [result] = await connection.query(
        'INSERT INTO ideias (user_id, titulo, descricao, categoria, status, created_at) VALUES (?, ?, ?, ?, "nova", NOW())',
        [req.user.id, titulo, descricao, categoria]
      );

      connection.release();
      connection = null;
      res.status(201).json({
        message: 'Ideia enviada com sucesso',
        ideiaId: result.insertId
      });
    } catch (error) {
      console.error(error);
      if (connection) connection.release();
      res.status(500).json({ error: 'Erro ao salvar ideia' });
    }
  }
);

router.get('/list', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureIdeiasTable(connection);
    const [ideias] = await connection.query(`
      SELECT
        i.id,
        i.titulo,
        i.descricao,
        i.categoria,
        i.status,
        i.created_at,
        i.updated_at,
        i.user_id,
        u.name AS autor_nome,
        u.username AS autor_usuario,
        u.email AS autor_email,
        u.department AS autor_departamento
      FROM ideias i
      JOIN users u ON u.id = i.user_id
      ORDER BY i.created_at DESC
    `);

    connection.release();
    connection = null;
    res.json(ideias);
  } catch (error) {
    console.error(error);
    if (connection) connection.release();
    res.status(500).json({ error: 'Erro ao buscar ideias' });
  }
});

module.exports = router;
