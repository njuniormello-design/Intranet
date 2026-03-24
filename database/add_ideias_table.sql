USE intranet_db;

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
