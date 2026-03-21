# Script para importar schema MySQL automaticamente

# Procurar caminho do MySQL
$mysqlPaths = @(
    "C:\Program Files (x86)\MySQL\bin\mysql.exe",
    "C:\Program Files (x86)\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files (x86)\MySQL\MySQL Server 5.7\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe"
)

$mysqlExe = $null
foreach ($path in $mysqlPaths) {
    if (Test-Path $path) {
        $mysqlExe = $path
        break
    }
}

if ($null -eq $mysqlExe) {
    Write-Host "[X] MySQL nao encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Opcoes:"
    Write-Host "1. Instale MySQL Community Server de: https://dev.mysql.com/downloads/mysql/"
    Write-Host "2. Ou use MySQL Workbench para importar o schema manualmente"
    exit 1
}

Write-Host "[OK] MySQL encontrado em: $mysqlExe" -ForegroundColor Green
Write-Host ""

# Pedir credenciais
$user = Read-Host "Usuario MySQL (padrao: root)"
if ([string]::IsNullOrEmpty($user)) { $user = "root" }

$password = Read-Host "Senha MySQL (deixe em branco se nao houver)" -AsSecureString
$pass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

# Montar comando
$schemaFile = Join-Path (Get-Location) "database\schema.sql"

if (-not (Test-Path $schemaFile)) {
    Write-Host "[X] Arquivo schema.sql nao encontrado em: $schemaFile" -ForegroundColor Red
    exit 1
}

Write-Host ">>> Importando schema de: $schemaFile" -ForegroundColor Cyan
Write-Host ""

# Executar mysql
$schemaContent = Get-Content $schemaFile -Raw

if ([string]::IsNullOrEmpty($pass)) {
    $schemaContent | & $mysqlExe -u $user
} else {
    $schemaContent | & $mysqlExe -u $user "-p$pass"
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] Banco de dados criado com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:"
    Write-Host "1. cd backend"
    Write-Host "2. npm install"
    Write-Host "3. npm start"
    Write-Host ""
    Write-Host "Em outro terminal:"
    Write-Host "1. cd frontend"
    Write-Host "2. python -m http.server 8000"
    Write-Host ""
    Write-Host "Acesse: http://localhost:8000"
} else {
    Write-Host ""
    Write-Host "[X] Erro ao importar schema!" -ForegroundColor Red
    Write-Host "Verifique suas credenciais MySQL"
}
