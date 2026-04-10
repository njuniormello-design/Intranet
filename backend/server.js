const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const pool = require('./config/database');

dotenv.config();

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir arquivos estáticos com headers CORS explícitos
const uploadsPath = path.join(__dirname, 'uploads');
console.log(`Servindo arquivos estáticos de: ${uploadsPath}`);
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static(uploadsPath));

// Importar rotas
const authRoutes = require('./routes/auth');
const chamadosRoutes = require('./routes/chamados');
const comunicadosRoutes = require('./routes/comunicados');
const documentosRoutes = require('./routes/documentos');
const funcionariosRoutes = require('./routes/funcionarios');
const usuariosRoutes = require('./routes/usuarios');
const ideiasRoutes = require('./routes/ideias');

// Usar rotas
app.use('/api/auth', authRoutes);
app.use('/api/chamados', chamadosRoutes);
app.use('/api/comunicados', comunicadosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/ideias', ideiasRoutes);

// Servir o frontend pelo mesmo servidor, sem impedir o uso do frontend separado
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ message: 'API de Intranet funcionando!' });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 5000;

async function ensureDatabaseUpdates() {
  const connection = await pool.getConnection();

  try {
    const ensureColumn = async (tableName, columnName, definition) => {
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [tableName, columnName]
      );

      if (!rows.length) {
        await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      }
    };

    const ensureIndex = async (tableName, indexName, definition) => {
      const [rows] = await connection.query(
        `SELECT INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND INDEX_NAME = ?`,
        [tableName, indexName]
      );

      if (!rows.length) {
        await connection.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} ${definition}`);
      }
    };

    const [birthDateColumn] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'birth_date'`
    );

    if (!birthDateColumn.length) {
      await connection.query('ALTER TABLE users ADD COLUMN birth_date DATE NULL AFTER role');
    }

    const [announcementTypeColumn] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'comunicados'
         AND COLUMN_NAME = 'announcement_type'`
    );

    if (!announcementTypeColumn.length) {
      await connection.query("ALTER TABLE comunicados ADD COLUMN announcement_type VARCHAR(50) NOT NULL DEFAULT 'manual' AFTER priority");
    }

    const [generatedKeyColumn] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'comunicados'
         AND COLUMN_NAME = 'generated_key'`
    );

    if (!generatedKeyColumn.length) {
      await connection.query('ALTER TABLE comunicados ADD COLUMN generated_key VARCHAR(100) NULL AFTER announcement_type');
      await connection.query('CREATE UNIQUE INDEX idx_comunicados_generated_key ON comunicados (generated_key)');
    }

    await ensureColumn('funcionarios', 're', 'VARCHAR(20) NULL');

    await ensureColumn('chamados', 'ticket_number', 'VARCHAR(30) NULL');
    await ensureColumn('chamados', 'requester_name', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'department', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'unit_name', "VARCHAR(100) NULL");
    await ensureColumn('chamados', 'opening_channel', "VARCHAR(30) NOT NULL DEFAULT 'sistema'");
    await ensureColumn('chamados', 'impact', "VARCHAR(50) NOT NULL DEFAULT 'individual'");
    await ensureColumn('chamados', 'support_level', "VARCHAR(10) NOT NULL DEFAULT 'N1'");
    await ensureColumn('chamados', 'subcategory', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'resolved_by', 'INT NULL');
    await ensureColumn('chamados', 'attendance_type', 'VARCHAR(30) NULL');
    await ensureColumn('chamados', 'first_response_due_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'first_response_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'resolution_due_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'opened_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'closed_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'waiting_user_seconds', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'waiting_vendor_seconds', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'paused_seconds', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'sla_first_response_met', 'TINYINT(1) NULL');
    await ensureColumn('chamados', 'sla_resolution_met', 'TINYINT(1) NULL');
    await ensureColumn('chamados', 'root_cause', 'VARCHAR(500) NULL');
    await ensureColumn('chamados', 'action_taken', 'TEXT NULL');
    await ensureColumn('chamados', 'solution_applied', 'TEXT NULL');
    await ensureColumn('chamados', 'solution_type', 'VARCHAR(30) NULL');
    await ensureColumn('chamados', 'needs_return', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'part_replaced', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'external_service', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'final_status', 'VARCHAR(50) NULL');
    await ensureColumn('chamados', 'closure_notes', 'TEXT NULL');
    await ensureColumn('chamados', 'satisfaction_level', 'VARCHAR(40) NULL');
    await ensureColumn('chamados', 'satisfaction_score', 'TINYINT NULL');
    await ensureColumn('chamados', 'satisfaction_comment', 'VARCHAR(500) NULL');
    await ensureColumn('chamados', 'recurrence_flag', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'recurrence_type', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'reopen_count', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('chamados', 'last_reopen_reason', 'VARCHAR(500) NULL');
    await ensureColumn('chamados', 'asset_tag', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'serial_number', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'hostname', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'ip_address', 'VARCHAR(45) NULL');
    await ensureColumn('chamados', 'extension_number', 'VARCHAR(30) NULL');
    await ensureColumn('chamados', 'affected_system', 'VARCHAR(100) NULL');

    await connection.query('UPDATE chamados SET opened_at = COALESCE(opened_at, created_at) WHERE opened_at IS NULL');
    await ensureIndex('chamados', 'idx_ticket_number', '(ticket_number)');
    await ensureIndex('chamados', 'idx_chamados_category', '(category)');
    await ensureIndex('chamados', 'idx_chamados_subcategory', '(subcategory)');
    await ensureIndex('chamados', 'idx_chamados_opened_at', '(opened_at)');
    await ensureIndex('chamados', 'idx_chamados_department', '(department)');
    await ensureIndex('chamados', 'idx_chamados_assigned_to', '(assigned_to)');

    const [resolvedByForeignKey] = await connection.query(
      `SELECT CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'chamados'
          AND COLUMN_NAME = 'resolved_by'
          AND REFERENCED_TABLE_NAME = 'users'`
    );

    if (!resolvedByForeignKey.length) {
      await connection.query('ALTER TABLE chamados ADD CONSTRAINT fk_chamados_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL');
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chamado_historico (
        id INT PRIMARY KEY AUTO_INCREMENT,
        chamado_id INT NOT NULL,
        changed_by INT NULL,
        action_type VARCHAR(50) NOT NULL,
        field_name VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        from_status VARCHAR(50) NULL,
        to_status VARCHAR(50) NULL,
        observation VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_chamado_historico_chamado_id (chamado_id),
        INDEX idx_chamado_historico_created_at (created_at)
      )
    `);
  } finally {
    connection.release();
  }
}

ensureDatabaseUpdates()
  .catch((error) => {
    console.error('Erro ao aplicar atualizações do banco:', error);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  });
