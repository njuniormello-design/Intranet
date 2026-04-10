-- Crear banco de dados
CREATE DATABASE IF NOT EXISTS intranet_db;
USE intranet_db;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  department VARCHAR(100),
  role VARCHAR(50) DEFAULT 'viewer',
  birth_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela de chamados
CREATE TABLE IF NOT EXISTS chamados (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  ticket_number VARCHAR(30) UNIQUE NULL,
  requester_name VARCHAR(100),
  department VARCHAR(100),
  unit_name VARCHAR(100),
  opening_channel VARCHAR(30) DEFAULT 'sistema',
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(50) DEFAULT 'normal',
  impact VARCHAR(50) DEFAULT 'individual',
  support_level VARCHAR(10) DEFAULT 'N1',
  category VARCHAR(100),
  subcategory VARCHAR(100),
  status VARCHAR(50) DEFAULT 'aberto',
  assigned_to INT,
  resolved_by INT,
  attendance_type VARCHAR(30),
  first_response_due_at DATETIME NULL,
  first_response_at DATETIME NULL,
  resolution_due_at DATETIME NULL,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  waiting_user_seconds INT DEFAULT 0,
  waiting_vendor_seconds INT DEFAULT 0,
  paused_seconds INT DEFAULT 0,
  sla_first_response_met TINYINT(1) NULL,
  sla_resolution_met TINYINT(1) NULL,
  root_cause VARCHAR(500),
  action_taken TEXT,
  solution_applied TEXT,
  solution_type VARCHAR(30),
  needs_return TINYINT(1) DEFAULT 0,
  part_replaced TINYINT(1) DEFAULT 0,
  external_service TINYINT(1) DEFAULT 0,
  final_status VARCHAR(50),
  closure_notes TEXT,
  satisfaction_level VARCHAR(40),
  satisfaction_score TINYINT NULL,
  satisfaction_comment VARCHAR(500),
  recurrence_flag TINYINT(1) DEFAULT 0,
  recurrence_type VARCHAR(100),
  reopen_count INT DEFAULT 0,
  last_reopen_reason VARCHAR(500),
  asset_tag VARCHAR(100),
  serial_number VARCHAR(100),
  hostname VARCHAR(100),
  ip_address VARCHAR(45),
  extension_number VARCHAR(30),
  affected_system VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_ticket_number (ticket_number),
  INDEX idx_chamados_category (category),
  INDEX idx_chamados_subcategory (subcategory),
  INDEX idx_chamados_opened_at (opened_at),
  INDEX idx_chamados_department (department),
  INDEX idx_chamados_assigned_to (assigned_to)
);

-- Tabela de anexos de chamados
CREATE TABLE IF NOT EXISTS chamado_attachments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  chamado_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(100),
  file_size INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE
);

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
);

-- Tabela de comunicados
CREATE TABLE IF NOT EXISTS comunicados (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(50) DEFAULT 'normal',
  announcement_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  generated_key VARCHAR(100) UNIQUE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_created_at (created_at)
);

-- Tabela de documentos
CREATE TABLE IF NOT EXISTS documentos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INT,
  downloads INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_category (category),
  INDEX idx_created_at (created_at)
);

-- Tabela de funcionários
CREATE TABLE IF NOT EXISTS funcionarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(200) NOT NULL,
  re VARCHAR(20),
  cargo VARCHAR(100) NOT NULL,
  ramal VARCHAR(20),
  email VARCHAR(100) NOT NULL,
  foto_path VARCHAR(500),
  foto_name VARCHAR(255),
  foto_size INT,
  departamento VARCHAR(100),
  status VARCHAR(50) DEFAULT 'ativo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_cargo (cargo),
  INDEX idx_created_at (created_at)
);

-- Tabela de banco de ideias
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
);

-- Inserir usuário admin padrão (senha: admin123)
INSERT INTO users (username, email, password, name, department, role) 
VALUES ('admin', 'admin@intranet.com', '$2a$10$eImiTXuWVxfaHNYY0iDH2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUe', 'Administrador', 'TI', 'admin');
