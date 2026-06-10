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
const infraestruturaRoutes = require('./routes/infraestrutura');
const inventarioRoutes = require('./routes/inventario');
const frotaRoutes = require('./routes/frota');

// Usar rotas
app.use('/api/auth', authRoutes);
app.use('/api/chamados', chamadosRoutes);
app.use('/api/comunicados', comunicadosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/ideias', ideiasRoutes);
app.use('/api/infraestrutura', infraestruturaRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/frota', frotaRoutes);

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
const USER_VALIDATION_AUTO_CLOSE_DAYS = 5;
const AUTO_CLOSE_INTERVAL_MS = 60 * 60 * 1000;

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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_module_permissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        module_key VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_user_module_permission (user_id, module_key),
        INDEX idx_user_module_permissions_user (user_id),
        INDEX idx_user_module_permissions_module (module_key)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS system_migrations (
        migration_key VARCHAR(100) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [[modulePermissionCount]] = await connection.query(
      'SELECT COUNT(*) AS total FROM user_module_permissions'
    );

    if (Number(modulePermissionCount.total) === 0) {
      await connection.query(`
        INSERT IGNORE INTO user_module_permissions (user_id, module_key)
        SELECT u.id, modules.module_key
          FROM users u
          JOIN (
            SELECT 'chamados_ti' AS module_key
            UNION SELECT 'infraestrutura'
            UNION SELECT 'inventario'
            UNION SELECT 'funcionarios'
            UNION SELECT 'usuarios'
            UNION SELECT 'documentos'
            UNION SELECT 'comunicados'
            UNION SELECT 'ideias'
            UNION SELECT 'frota'
          ) modules
         WHERE u.role = 'admin'
      `);

      await connection.query(`
        INSERT IGNORE INTO user_module_permissions (user_id, module_key)
        SELECT id, 'chamados_ti'
          FROM users
         WHERE role = 'creator'
      `);
    }

    const [moduleDefaultsMigration] = await connection.query(
      "SELECT migration_key FROM system_migrations WHERE migration_key = 'backfill_viewer_creator_module_permissions_20260601'"
    );

    if (!moduleDefaultsMigration.length) {
      await connection.query(`
        INSERT IGNORE INTO user_module_permissions (user_id, module_key)
        SELECT u.id, modules.module_key
          FROM users u
          JOIN (
            SELECT 'chamados_ti' AS module_key
            UNION SELECT 'infraestrutura'
            UNION SELECT 'inventario'
            UNION SELECT 'funcionarios'
            UNION SELECT 'documentos'
            UNION SELECT 'comunicados'
            UNION SELECT 'ideias'
            UNION SELECT 'frota'
          ) modules
         WHERE u.role IN ('viewer', 'creator')
      `);

      await connection.query(
        "INSERT INTO system_migrations (migration_key) VALUES ('backfill_viewer_creator_module_permissions_20260601')"
      );
    }

    const [frotaPermissionMigration] = await connection.query(
      "SELECT migration_key FROM system_migrations WHERE migration_key = 'backfill_frota_module_permissions_20260610'"
    );

    if (!frotaPermissionMigration.length) {
      await connection.query(`
        INSERT IGNORE INTO user_module_permissions (user_id, module_key)
        SELECT id, 'frota'
          FROM users
         WHERE role IN ('admin', 'viewer', 'creator')
      `);
      await connection.query(
        "INSERT INTO system_migrations (migration_key) VALUES ('backfill_frota_module_permissions_20260610')"
      );
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
    await ensureColumn('chamados', 'urgency', "VARCHAR(50) NOT NULL DEFAULT 'media'");
    await ensureColumn('chamados', 'support_level', "VARCHAR(10) NOT NULL DEFAULT 'N1'");
    await ensureColumn('chamados', 'subcategory', 'VARCHAR(100) NULL');
    await ensureColumn('chamados', 'resolved_by', 'INT NULL');
    await ensureColumn('chamados', 'attendance_type', 'VARCHAR(30) NULL');
    await ensureColumn('chamados', 'first_response_due_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'first_response_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'service_started_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'resolution_due_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'resolved_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'opened_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'closed_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'sla_paused_at', 'DATETIME NULL');
    await ensureColumn('chamados', 'sla_pause_reason', 'VARCHAR(500) NULL');
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
    await ensureColumn('chamados', 'user_validation_status', "VARCHAR(30) NOT NULL DEFAULT 'nao_enviado'");
    await ensureColumn('chamados', 'user_validation_comment', 'VARCHAR(500) NULL');
    await ensureColumn('chamados', 'user_validated_at', 'DATETIME NULL');
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
    await connection.query("UPDATE chamados SET status = 'validado_usuario' WHERE status = 'resolvido' AND user_validation_status = 'aprovado'");
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS infra_chamados (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        ticket_number VARCHAR(30) UNIQUE NULL,
        requester_name VARCHAR(100),
        department VARCHAR(100),
        unit_name VARCHAR(100),
        opening_channel VARCHAR(30) DEFAULT 'sistema',
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(50) DEFAULT 'media',
        impact VARCHAR(50) DEFAULT 'individual',
        urgency VARCHAR(50) DEFAULT 'media',
        support_level VARCHAR(10) DEFAULT 'N1',
        category VARCHAR(100),
        subcategory VARCHAR(100),
        status VARCHAR(50) DEFAULT 'aberto',
        assigned_to INT NULL,
        resolved_by INT NULL,
        attendance_type VARCHAR(30) NULL,
        first_response_due_at DATETIME NULL,
        first_response_at DATETIME NULL,
        service_started_at DATETIME NULL,
        resolution_due_at DATETIME NULL,
        resolved_at DATETIME NULL,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME NULL,
        sla_paused_at DATETIME NULL,
        sla_pause_reason VARCHAR(500) NULL,
        environment VARCHAR(120) NULL,
        asset_identifier VARCHAR(120) NULL,
        safety_risk TINYINT(1) NOT NULL DEFAULT 0,
        activity_interrupted TINYINT(1) NOT NULL DEFAULT 0,
        needs_approval TINYINT(1) NOT NULL DEFAULT 0,
        approval_granted TINYINT(1) NULL,
        requires_vendor TINYINT(1) NOT NULL DEFAULT 0,
        material_needed TINYINT(1) NOT NULL DEFAULT 0,
        material_description VARCHAR(500) NULL,
        desired_date DATE NULL,
        estimated_cost DECIMAL(12,2) NULL,
        actual_cost DECIMAL(12,2) NULL,
        supplier_name VARCHAR(120) NULL,
        waiting_user_seconds INT NOT NULL DEFAULT 0,
        waiting_vendor_seconds INT NOT NULL DEFAULT 0,
        paused_seconds INT NOT NULL DEFAULT 0,
        sla_first_response_met TINYINT(1) NULL,
        sla_resolution_met TINYINT(1) NULL,
        root_cause VARCHAR(500) NULL,
        action_taken TEXT NULL,
        solution_applied TEXT NULL,
        final_status VARCHAR(50) NULL,
        closure_notes TEXT NULL,
        user_validation_status VARCHAR(30) NOT NULL DEFAULT 'nao_enviado',
        user_validation_comment VARCHAR(500) NULL,
        user_validated_at DATETIME NULL,
        recurrence_flag TINYINT(1) NOT NULL DEFAULT 0,
        recurrence_type VARCHAR(100) NULL,
        reopen_count INT NOT NULL DEFAULT 0,
        last_reopen_reason VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_infra_user_id (user_id),
        INDEX idx_infra_status (status),
        INDEX idx_infra_ticket_number (ticket_number),
        INDEX idx_infra_category (category),
        INDEX idx_infra_subcategory (subcategory),
        INDEX idx_infra_opened_at (opened_at),
        INDEX idx_infra_department (department),
        INDEX idx_infra_assigned_to (assigned_to)
      )
    `);

    await ensureColumn('infra_chamados', 'support_level', "VARCHAR(10) NOT NULL DEFAULT 'N1'");
    await ensureColumn('infra_chamados', 'sla_paused_at', 'DATETIME NULL');
    await ensureColumn('infra_chamados', 'sla_pause_reason', 'VARCHAR(500) NULL');
    await ensureColumn('infra_chamados', 'waiting_user_seconds', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('infra_chamados', 'waiting_vendor_seconds', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('infra_chamados', 'paused_seconds', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('infra_chamados', 'user_validation_status', "VARCHAR(30) NOT NULL DEFAULT 'nao_enviado'");
    await ensureColumn('infra_chamados', 'user_validation_comment', 'VARCHAR(500) NULL');
    await ensureColumn('infra_chamados', 'user_validated_at', 'DATETIME NULL');
    await ensureColumn('infra_chamados', 'recurrence_flag', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('infra_chamados', 'recurrence_type', 'VARCHAR(100) NULL');
    await connection.query(`
      UPDATE infra_chamados
         SET sla_paused_at = updated_at
       WHERE sla_paused_at IS NULL
         AND status IN (
           'triagem',
           'aguardando_informacoes',
           'aguardando_aprovacao',
           'aguardando_orcamento',
           'aguardando_fornecedor',
           'pendente_material',
           'pendente_agendamento'
         )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS infra_attachments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        chamado_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(100),
        file_size INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chamado_id) REFERENCES infra_chamados(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS infra_historico (
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
        FOREIGN KEY (chamado_id) REFERENCES infra_chamados(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_infra_historico_chamado_id (chamado_id),
        INDEX idx_infra_historico_created_at (created_at)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS frota_veiculos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        placa VARCHAR(10) NOT NULL UNIQUE,
        prefixo VARCHAR(50) NULL,
        marca VARCHAR(100) NOT NULL,
        modelo VARCHAR(100) NOT NULL,
        ano_fabricacao INT NULL,
        ano_modelo INT NULL,
        tipo_veiculo VARCHAR(100) NOT NULL,
        categoria VARCHAR(100) NULL,
        renavam VARCHAR(50) NULL,
        chassi VARCHAR(100) NULL,
        cor VARCHAR(50) NULL,
        combustivel VARCHAR(50) NULL,
        setor_responsavel VARCHAR(100) NULL,
        motorista_responsavel VARCHAR(120) NULL,
        unidade VARCHAR(100) NULL,
        status_operacional VARCHAR(50) NOT NULL DEFAULT 'disponivel',
        quilometragem_atual INT NOT NULL DEFAULT 0,
        data_ultima_revisao DATE NULL,
        km_ultima_revisao INT NULL,
        data_proxima_revisao DATE NULL,
        km_proxima_revisao INT NULL,
        vencimento_licenciamento DATE NULL,
        vencimento_seguro DATE NULL,
        vencimento_extintor DATE NULL,
        observacoes TEXT NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_frota_veiculos_status (status_operacional),
        INDEX idx_frota_veiculos_ativo (ativo)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS frota_chamados (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        ticket_number VARCHAR(30) UNIQUE NULL,
        requester_name VARCHAR(100) NULL,
        department VARCHAR(100) NOT NULL,
        unit_name VARCHAR(100) NOT NULL,
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        vehicle_id INT NOT NULL,
        request_type VARCHAR(100) NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'media',
        status VARCHAR(50) NOT NULL DEFAULT 'aberto',
        assigned_to INT NULL,
        resolved_by INT NULL,
        current_mileage INT NOT NULL DEFAULT 0,
        driver_name VARCHAR(120) NULL,
        vehicle_location VARCHAR(255) NULL,
        vehicle_in_operation TINYINT(1) NOT NULL DEFAULT 1,
        safety_risk TINYINT(1) NOT NULL DEFAULT 0,
        needs_tow TINYINT(1) NOT NULL DEFAULT 0,
        activity_interrupted TINYINT(1) NOT NULL DEFAULT 0,
        vehicle_unavailable TINYINT(1) NOT NULL DEFAULT 0,
        supplier_name VARCHAR(120) NULL,
        supplier_contacted_at DATETIME NULL,
        expected_return_at DATETIME NULL,
        estimated_cost DECIMAL(12,2) NULL,
        approved_cost DECIMAL(12,2) NULL,
        actual_cost DECIMAL(12,2) NULL,
        quote_number VARCHAR(80) NULL,
        invoice_number VARCHAR(80) NULL,
        diagnosis TEXT NULL,
        action_taken TEXT NULL,
        parts_used TEXT NULL,
        service_performed TEXT NULL,
        solution TEXT NULL,
        internal_notes TEXT NULL,
        return_date DATETIME NULL,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        first_response_due_at DATETIME NULL,
        first_response_at DATETIME NULL,
        service_started_at DATETIME NULL,
        resolution_due_at DATETIME NULL,
        resolved_at DATETIME NULL,
        closed_at DATETIME NULL,
        sla_paused_at DATETIME NULL,
        sla_pause_reason VARCHAR(500) NULL,
        paused_seconds INT NOT NULL DEFAULT 0,
        sla_first_response_met TINYINT(1) NULL,
        sla_resolution_met TINYINT(1) NULL,
        final_status VARCHAR(50) NULL,
        user_validation_status VARCHAR(30) NOT NULL DEFAULT 'nao_enviado',
        user_validation_comment VARCHAR(500) NULL,
        user_validated_at DATETIME NULL,
        reopen_count INT NOT NULL DEFAULT 0,
        last_reopen_reason VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (vehicle_id) REFERENCES frota_veiculos(id),
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_frota_chamados_user (user_id),
        INDEX idx_frota_chamados_status (status),
        INDEX idx_frota_chamados_vehicle (vehicle_id),
        INDEX idx_frota_chamados_opened (opened_at),
        INDEX idx_frota_chamados_assigned (assigned_to)
      )
    `);

    await ensureColumn('frota_chamados', 'user_validation_status', "VARCHAR(30) NOT NULL DEFAULT 'nao_enviado'");
    await ensureColumn('frota_chamados', 'user_validation_comment', 'VARCHAR(500) NULL');
    await ensureColumn('frota_chamados', 'user_validated_at', 'DATETIME NULL');
    await ensureColumn('frota_chamados', 'reopen_count', 'INT NOT NULL DEFAULT 0');
    await ensureColumn('frota_chamados', 'last_reopen_reason', 'VARCHAR(500) NULL');
    await ensureIndex('frota_chamados', 'idx_frota_chamados_user', '(user_id)');
    await connection.query(`
      UPDATE frota_chamados
         SET user_validation_status = 'pendente'
       WHERE status = 'resolvido'
         AND user_validation_status = 'nao_enviado'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS frota_attachments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        chamado_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(100) NULL,
        file_size INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chamado_id) REFERENCES frota_chamados(id) ON DELETE CASCADE,
        INDEX idx_frota_attachments_chamado (chamado_id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS frota_historico (
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
        FOREIGN KEY (chamado_id) REFERENCES frota_chamados(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_frota_historico_chamado (chamado_id),
        INDEX idx_frota_historico_created (created_at)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS frota_indisponibilidades (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vehicle_id INT NOT NULL,
        chamado_id INT NULL,
        data_inicio DATETIME NOT NULL,
        data_fim DATETIME NULL,
        motivo TEXT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'aberta',
        responsavel INT NULL,
        observacao TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicle_id) REFERENCES frota_veiculos(id),
        FOREIGN KEY (chamado_id) REFERENCES frota_chamados(id) ON DELETE SET NULL,
        FOREIGN KEY (responsavel) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_frota_indisponibilidade_vehicle (vehicle_id),
        INDEX idx_frota_indisponibilidade_open (data_fim)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventario_itens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tipo VARCHAR(100) NOT NULL,
        marca VARCHAR(100) NULL,
        modelo VARCHAR(150) NULL,
        numero_serie VARCHAR(150) NULL,
        patrimonio VARCHAR(100) NULL,
        imobilizado VARCHAR(100) NULL,
        hostname VARCHAR(150) NULL,
        ip VARCHAR(45) NULL,
        mac_address VARCHAR(50) NULL,
        setor VARCHAR(150) NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'estoque',
        observacoes TEXT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_inventario_tipo (tipo),
        INDEX idx_inventario_status (status),
        INDEX idx_inventario_patrimonio (patrimonio),
        INDEX idx_inventario_imobilizado (imobilizado),
        INDEX idx_inventario_hostname (hostname),
        INDEX idx_inventario_setor (setor)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventario_vinculos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        item_id INT NOT NULL,
        usuario_id INT NULL,
        colaborador_nome VARCHAR(150) NOT NULL,
        setor VARCHAR(150) NULL,
        data_entrega DATE NOT NULL,
        data_devolucao DATE NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'ativo',
        termo_responsabilidade VARCHAR(255) NULL,
        observacoes TEXT NULL,
        criado_por INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES inventario_itens(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_inventario_vinculos_item_status (item_id, status),
        INDEX idx_inventario_vinculos_usuario (usuario_id),
        INDEX idx_inventario_vinculos_colaborador (colaborador_nome),
        INDEX idx_inventario_vinculos_setor (setor)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventario_movimentacoes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        item_id INT NOT NULL,
        usuario_origem VARCHAR(150) NULL,
        usuario_destino VARCHAR(150) NULL,
        setor_origem VARCHAR(150) NULL,
        setor_destino VARCHAR(150) NULL,
        tipo_movimentacao VARCHAR(30) NOT NULL,
        descricao TEXT NULL,
        realizado_por INT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES inventario_itens(id) ON DELETE CASCADE,
        FOREIGN KEY (realizado_por) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_inventario_mov_item (item_id),
        INDEX idx_inventario_mov_tipo (tipo_movimentacao),
        INDEX idx_inventario_mov_criado (criado_em)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventario_termos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vinculo_id INT NOT NULL,
        item_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(120) NULL,
        file_size INT NULL,
        uploaded_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vinculo_id) REFERENCES inventario_vinculos(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES inventario_itens(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_inventario_termos_vinculo (vinculo_id),
        INDEX idx_inventario_termos_item (item_id),
        INDEX idx_inventario_termos_created (created_at)
      )
    `);
  } finally {
    connection.release();
  }
}

async function closeExpiredUserValidationChamados() {
  const connection = await pool.getConnection();
  const targets = [
    {
      tableName: 'chamados',
      historyTableName: 'chamado_historico',
      logName: 'chamado(s) de TI',
      closedStatus: 'fechado'
    },
    {
      tableName: 'infra_chamados',
      historyTableName: 'infra_historico',
      logName: 'chamado(s) de infraestrutura',
      closedStatus: 'fechado'
    },
    {
      tableName: 'frota_chamados',
      historyTableName: 'frota_historico',
      logName: 'chamado(s) de frota',
      closedStatus: 'finalizado'
    }
  ];

  try {
    await connection.beginTransaction();

    for (const target of targets) {
      const [expiredChamados] = await connection.query(
        `SELECT id, status
           FROM ${target.tableName}
          WHERE status = 'resolvido'
            AND user_validation_status = 'pendente'
            AND resolved_at IS NOT NULL
            AND resolved_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
          FOR UPDATE`,
        [USER_VALIDATION_AUTO_CLOSE_DAYS]
      );

      for (const chamado of expiredChamados) {
        await connection.query(
          `UPDATE ${target.tableName}
              SET status = '${target.closedStatus}',
                  final_status = '${target.closedStatus}',
                  closed_at = NOW(),
                  user_validation_status = 'expirado',
                  user_validation_comment = ?,
                  updated_at = NOW()
            WHERE id = ?
              AND status = 'resolvido'
              AND user_validation_status = 'pendente'`,
          [`Fechado automaticamente após ${USER_VALIDATION_AUTO_CLOSE_DAYS} dias sem validação do usuário`, chamado.id]
        );

        await connection.query(
          `INSERT INTO ${target.historyTableName}
           (chamado_id, changed_by, action_type, from_status, to_status, observation, created_at)
           VALUES (?, NULL, 'fechamento_automatico', ?, '${target.closedStatus}', ?, NOW())`,
          [
            chamado.id,
            chamado.status,
            `Chamado fechado automaticamente após ${USER_VALIDATION_AUTO_CLOSE_DAYS} dias corridos sem validação do usuário`
          ]
        );
      }

      if (expiredChamados.length) {
        console.log(`${expiredChamados.length} ${target.logName} fechado(s) automaticamente por falta de validação do usuário.`);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao fechar chamados expirados:', error);
  } finally {
    connection.release();
  }
}

function scheduleExpiredUserValidationAutoClose() {
  closeExpiredUserValidationChamados();
  const interval = setInterval(closeExpiredUserValidationChamados, AUTO_CLOSE_INTERVAL_MS);
  interval.unref?.();
}

ensureDatabaseUpdates()
  .then(() => {
    scheduleExpiredUserValidationAutoClose();
  })
  .catch((error) => {
    console.error('Erro ao aplicar atualizações do banco:', error);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  });
