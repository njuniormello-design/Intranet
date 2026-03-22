# Intranet System - Guia Rápido de Instalação

## Instalação Rápida (30 minutos)

### Passo 1: Preparar o MySQL (2 min)

1. **Abra o MySQL:**
   - Windows: Procure por "MySQL Command Line Client" ou use MySQL Workbench
   - Mac/Linux: `mysql -u root -p`

2. **Execute o script SQL:**
   ```sql
   -- Copie e execute todo o conteúdo do arquivo: database/schema.sql
   -- Ou use via terminal:
   ```
   ```bash
   mysql -u root -p < database/schema.sql
   ```

3. **Verifique:**
   ```sql
   USE intranet_db;
   SHOW TABLES;
   -- Deve mostrar: users, chamados, chamado_attachments, comunicados, documentos
   ```

### Passo 2: Configurar Backend (8 min)

```bash
# 1. Entre na pasta backend
cd backend

# 2. Instale as dependências
npm install

# 3. Verifique o arquivo .env (não é necessário mudar se usar as configurações padrão)
# 4. Crie a pasta de uploads se não existir
mkdir uploads
mkdir uploads/chamados
mkdir uploads/documentos

# 5. Inicie o servidor
npm start
# Deve aparecer: "Servidor rodando na porta 5000" e "Conectado ao banco de dados MySQL"
```

**Mantenha este terminal aberto!**

### Passo 3: Servir Frontend (5 min)

Em um **novo terminal**:

```bash
cd frontend
npm start
```

O frontend ficará disponível em `http://localhost:8000`

### Passo 4: Acessar a Aplicação (1 min)

Abra seu navegador e acesse:

```
http://localhost:8000
```

### Passo 5: Fazer Login (1 min)

Use as credenciais padrão:

```
Usuário: admin
Senha: admin123
```

Ou registre uma nova conta via "Registre-se aqui"

---

## Testando Funcionalidades

### Login ✅
- [ ] Faça login com admin/admin123
- [ ] Registre uma nova conta
- [ ] Verifique se aparece o nome na página

### Dashboard ✅
- [ ] Visualize as estatísticas (deve aparecer 0 ou mais itens)
- [ ] Veja os últimos comunicados

### Criar Chamado ✅
1. Clique em "Chamados"
2. Clique em "+ Novo Chamado"
3. Preencha:
   - Título: "Teste de Chamado"
   - Categoria: "TI"
   - Descrição: "Este é um teste"
   - Prioridade: "Normal"
   - Anexo: Selecione uma imagem (opcional)
4. Clique em "Enviar Chamado"
5. Verifique que o chamado aparece na lista

### Comunicados ✅
1. Clique em "Comunicados"
2. Deve aparecer o comunicado criado pelo admin

### Documentos ✅
1. Clique em "Documentos"
2. Clique em "+ Enviar Documento"
3. Preencha os dados
4. Selecione um arquivo PDF ou imagem
5. Clique em "Enviar"
6. Verifique que o documento aparece na lista
7. Clique em "Download" para testar

---

## Problemas Comuns

### "Cannot connect to database"

**Solução:**
1. Verifique se MySQL está rodando
   - Windows: Procure por "Services" e verifique "MySQL"
   - Mac: `brew services list`
   - Linux: `sudo service mysql status`
2. Confirme as credenciais em `backend/.env`
3. Verifique se criou o banco com: `mysql -u root -p < database/schema.sql`

### "Port 8000 already in use"

**Solução:**
```bash
# Use uma porta diferente
$env:PORT=9000; npm start  # ou qualquer porta disponível
# Acesse: http://localhost:9000
```

### "CORS error" ao tentar enviar dados

**Solução:**
- Verifique se o backend está rodando (`npm start` na pasta backend)
- Verifique se está rodando na porta 5000
- Abra em terminal novo e tente novamente

### "npm: command not found"

**Solução:**
- Instale Node.js em https://nodejs.org/

### Não consigo fazer upload de arquivo

**Solução:**
1. Crie as pastas manualmente:
```bash
cd backend
mkdir uploads
mkdir uploads/chamados
mkdir uploads/documentos
```
2. Verifique permissões de escrita na pasta
3. Máximo 5MB por arquivo

---

## Estrutura de Pastas Esperada

```
Intranet/
├── backend/
│   ├── config/database.js
│   ├── routes/auth.js
│   ├── routes/chamados.js
│   ├── routes/comunicados.js
│   ├── routes/documentos.js
│   ├── uploads/
│   │   ├── chamados/
│   │   └── documentos/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   └── node_modules/ (criado após npm install)
├── frontend/
│   ├── css/style.css
│   ├── js/auth.js
│   ├── js/dashboard.js
│   ├── index.html
│   └── dashboard.html
├── database/
│   └── schema.sql
└── README.md
```

---

## Segurança

**IMPORTANTE PARA PRODUÇÃO:**

1. Mude o `JWT_SECRET` em `backend/.env`
2. Crie senhas fortes para os usuários
3. Configure HTTPS
4. Use variáveis de ambiente reais
5. Nunca faça commit de `.env`

---

## Próximas Etapas

Depois de instalar com sucesso:

1. **Criar mais usuários** via área de registro
2. **Explorar funcionalidades** criando chamados e documentos
3. **Customizar** cores, logos, texto conforme necessário
4. **Adicionar regras de negócio** específicas da sua empresa
5. **Fazer backup** do banco de dados regularmente

---

## Documentação Completa

Veja [README.md](README.md) para informações sobre:
- Endpoints da API
- Estrutura completa do projeto
- Melhorias futuras
- Troubleshooting avançado

---

Se tiver dúvidas, consulte a documentação ou entre em contato com o desenvolvedor.

**Sistema Desenvolvido por Nelson Junior com IA Assistida**
