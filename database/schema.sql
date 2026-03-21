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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela de chamados
CREATE TABLE IF NOT EXISTS chamados (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(50) DEFAULT 'normal',
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'aberto',
  assigned_to INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
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

-- Tabela de comunicados
CREATE TABLE IF NOT EXISTS comunicados (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(50) DEFAULT 'normal',
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

-- Inserir usuário admin padrão (senha: admin123)
INSERT INTO users (username, email, password, name, department, role) 
VALUES ('admin', 'admin@intranet.com', '$2a$10$eImiTXuWVxfaHNYY0iDH2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUe', 'Administrador', 'TI', 'admin');
