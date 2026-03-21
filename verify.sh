#!/bin/bash

echo "================================"
echo "Sistema Intranet - Verificação"
echo "================================"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para verificar comando
check_command() {
    if command -v $1 &> /dev/null
    then
        echo -e "${GREEN}✓${NC} $2 está instalado"
        return 0
    else
        echo -e "${RED}✗${NC} $2 NÃO está instalado"
        return 1
    fi
}

# Verificar Node.js
check_command "node" "Node.js"

# Verificar npm
check_command "npm" "npm"

# Verificar MySQL
check_command "mysql" "MySQL"

# Verificar Python
check_command "python" "Python"

echo ""
echo "Verificando estrutura de pastas..."

# Verificar pastas
if [ -d "./backend" ]; then
    echo -e "${GREEN}✓${NC} Pasta /backend existe"
else
    echo -e "${RED}✗${NC} Pasta /backend NÃO existe"
fi

if [ -d "./frontend" ]; then
    echo -e "${GREEN}✓${NC} Pasta /frontend existe"
else
    echo -e "${RED}✗${NC} Pasta /frontend NÃO existe"
fi

if [ -d "./database" ]; then
    echo -e "${GREEN}✓${NC} Pasta /database existe"
else
    echo -e "${RED}✗${NC} Pasta /database NÃO existe"
fi

echo ""
echo "Verificando arquivos importantes..."

if [ -f "./database/schema.sql" ]; then
    echo -e "${GREEN}✓${NC} database/schema.sql existe"
else
    echo -e "${RED}✗${NC} database/schema.sql NÃO existe"
fi

if [ -f "./backend/.env" ]; then
    echo -e "${GREEN}✓${NC} backend/.env existe"
else
    echo -e "${RED}✗${NC} backend/.env NÃO existe"
fi

if [ -f "./README.md" ]; then
    echo -e "${GREEN}✓${NC} README.md existe"
else
    echo -e "${RED}✗${NC} README.md NÃO existe"
fi

echo ""
echo "================================"
echo "Verificação Completa!"
echo "================================"
echo ""
echo "Próximos passos:"
echo "1. Importe database/schema.sql no MySQL"
echo "2. Execute: cd backend && npm install"
echo "3. Execute: npm start"
echo "4. Em outro terminal: cd frontend && python -m http.server 8000"
echo "5. Acesse: http://localhost:8000"
