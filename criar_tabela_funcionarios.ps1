
# Script para criar tabela de funcionários no MySQL
# Executar como: .\criar_tabela_funcionarios.ps1

$mysqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$password = "Sistema@#"

# SQL para criar a tabela funcionários
$sql = @"
USE intranet_db;

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
"@

Write-Host "[*] Criando tabela de funcionarios..." -ForegroundColor Yellow

try {
    # Executar SQL
    $sql | & $mysqlPath -u root -p"$password" 2>&1
    Write-Host "[OK] Tabela funcionarios criada com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "[X] Erro ao criar tabela: $_" -ForegroundColor Red
    exit 1
}

# Verificar se a tabela foi criada
Write-Host "[*] Verificando tabela..." -ForegroundColor Yellow
$check = & $mysqlPath -u root -p"$password" -e "USE intranet_db; DESCRIBE funcionarios;" 2>&1

if ($check -like "*nome*") {
    Write-Host "[OK] Tabela verificada com sucesso!" -ForegroundColor Green
} else {
    Write-Host "[X] Erro ao verificar tabela" -ForegroundColor Red
    exit 1
}

Write-Host "`n[SUCESSO] Tabela de funcionarios criada e pronta para uso!" -ForegroundColor Green
