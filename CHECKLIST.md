# ✅ Checklist de Configuração Inicial

## Pré-Instalação (Antes de Começar)

- [ ] Node.js v14+ instalado (`node --version`)
- [ ] npm instalado (`npm --version`)
- [ ] MySQL Server instalado e rodando
- [ ] Git instalado (opcional)
- [ ] Editor de código (VS Code recomendado)
- [ ] Navegador moderno (Chrome, Firefox, Safari, Edge)

## Instalação do Backend

### Passo 1: Verificar Dependências
- [ ] Abra terminal/PowerShell na pasta `backend`
- [ ] Execute: `npm --version` (deve aparecer a versão)
- [ ] Execute: `node --version` (deve aparecer a versão)

### Passo 2: Instalar Pacotes
- [ ] Na pasta `backend`, execute: `npm install`
- [ ] Aguarde até terminar (pode demorar um pouco)
- [ ] Verifique se criou pasta `node_modules`
- [ ] Verifique se atualizou arquivo `package-lock.json`

### Passo 3: Configurar .env
- [ ] Abra arquivo `backend/.env`
- [ ] Verifique as configurações (padrões já estão lá):
  - [ ] `DB_HOST=localhost`
  - [ ] `DB_USER=root`
  - [ ] `DB_PASSWORD=` (deixe em branco se não houver)
  - [ ] `DB_NAME=intranet_db`
  - [ ] `DB_PORT=3306`
  - [ ] `PORT=5000`
- [ ] Mude `JWT_SECRET` se desejar (recomendado em produção)
- [ ] Salve o arquivo

### Passo 4: Criar Pastas de Upload
- [ ] Na pasta `backend`, crie pasta `uploads`
- [ ] Dentro de `uploads`, crie pasta `chamados`
- [ ] Dentro de `uploads`, crie pasta `documentos`

### Passo 5: Testar Backend
- [ ] Execute: `npm start`
- [ ] Aguarde erscheinen "Servidor rodando na porta 5000"
- [ ] Aguarde "Conectado ao banco de dados MySQL"
- [ ] Mantenha este terminal aberto!

## Banco de Dados

### Passo 1: Abrir MySQL
- [ ] Abra MySQL Workbench, ou
- [ ] Abra terminal e execute: `mysql -u root -p`
- [ ] Digite sua senha (se houver)

### Passo 2: Importar Schema
**Opção A: Usando comando**
- [ ] Na pasta do projeto, abra terminal
- [ ] Execute: `mysql -u root -p < database/schema.sql`
- [ ] Digite sua senha (se houver)

**Opção B: Usando MySQL Workbench**
- [ ] Abra MySQL Workbench
- [ ] Vá em File → Open SQL Script
- [ ] Selecione `database/schema.sql`
- [ ] Execute (Ctrl + Enter ou ⌘ + Enter)

**Opção C: Manualmente**
- [ ] Copie todo o conteúdo de `database/schema.sql`
- [ ] Cole em MySQL Workbench ou terminal
- [ ] Execute

### Passo 3: Verificar Criação
- [ ] Execute no MySQL: `SHOW DATABASES;`
- [ ] Verifique se aparece `intranet_db`
- [ ] Execute: `USE intranet_db;`
- [ ] Execute: `SHOW TABLES;`
- [ ] Verifique se aparecem 5 tabelas:
  - [ ] users
  - [ ] chamados
  - [ ] chamado_attachments
  - [ ] comunicados
  - [ ] documentos

### Passo 4: Verificar Usuário Admin
- [ ] Execute: `SELECT * FROM users;`
- [ ] Verifique se aparece usuário 'admin'

## Frontend

### Passo 1: Servir Arquivos

**Opção A: Usando Python**
- [ ] Abra terminal na pasta `frontend`
- [ ] Execute: `python -m http.server 8000`
- [ ] Aguarde mensagem de confirmação

**Opção B: Usando Node.js**
- [ ] Abra terminal na pasta `frontend`
- [ ] Execute: `npx http-server -p 8000`
- [ ] Aguarde mensagem de confirmação

**Opção C: Usando VS Code Live Server**
- [ ] Abra VS Code
- [ ] Abra pasta `frontend`
- [ ] Clique com botão direito em `index.html`
- [ ] Selecione "Open with Live Server"
- [ ] Browser abre automaticamente

### Passo 2: Verificar Acesso
- [ ] Abra navegador
- [ ] Acesse: `http://localhost:8000`
- [ ] Verifique se aparece página de login
- [ ] Verifique se carrega CSS e estilos

## Testes Funcionais

### Teste 1: Login - Admin Padrão
- [ ] Abra navegador em `http://localhost:8000`
- [ ] Veja a página de login
- [ ] Preencha:
  - Usuário: `admin`
  - Senha: `admin123`
- [ ] Clique em "Entrar"
- [ ] Verifique se redireciona para dashboard
- [ ] Verifique se aparece nome "Administrador" no canto superior

### Teste 2: Criar Conta Nova
- [ ] Na página de login, clique em "Registre-se aqui"
- [ ] Preencha o formulário:
  - [ ] Nome: Seu Nome
  - [ ] Usuário: seu_usuario
  - [ ] Email: seu_email@teste.com
  - [ ] Senha: senha123
- [ ] Clique em "Registrar"
- [ ] Verifique mensagem de sucesso
- [ ] Faça login com a conta nova

### Teste 3: Dashboard
- [ ] Após login, verifique dashboard com:
  - [ ] 4 cards de estatísticas (números podem ser 0)
  - [ ] Seção de comunicados abaixo
- [ ] Clique em "Dashboard" na sidebar
- [ ] Verifique carregamento de dados

### Teste 4: Criar Chamado
- [ ] Clique em "Chamados" no menu
- [ ] Clique em "+ Novo Chamado"
- [ ] Preencha o formulário:
  - [ ] Título: "Teste de Chamado"
  - [ ] Descrição: "Este é um teste"
  - [ ] Categoria: "TI"
  - [ ] Prioridade: "Normal"
  - [ ] Anexo: Selecione uma imagem (opcional)
- [ ] Clique em "Enviar Chamado"
- [ ] Verifique mensagem de sucesso
- [ ] Verifique se chamado aparece na lista abaixo
- [ ] Clique em "Ver" para visualizar detalhes

### Teste 5: Comunicados
- [ ] Clique em "Comunicados" no menu
- [ ] Verifique se liscem comunicados (pode estar vazio)
- [ ] Verifique layout e design

### Teste 6: Documentos
- [ ] Clique em "Documentos" no menu
- [ ] Clique em "+ Enviar Documento"
- [ ] Preencha:
  - [ ] Nome: "Documento Teste"
  - [ ] Categoria: "Manuais"
  - [ ] Descrição: "Documento de teste"
  - [ ] Arquivo: Selecione um PDF ou imagem
- [ ] Clique em "Enviar"
- [ ] Verifique mensagem de sucesso
- [ ] Verifique se documento aparece na tabela
- [ ] Clique em "Download" para testar download

### Teste 7: Logout
- [ ] Clique em "Sair" no menu lateral
- [ ] Verifique se redireciona para login
- [ ] Verifique se localStorage foi limpo (F12 → Application)

## Debug e Verificação

### Verificar Backend Rodando
- [ ] Abra terminal/PowerShell
- [ ] Execute: `curl http://localhost:5000/api/test`
- [ ] Deve aparecer: `{"message":"API de Intranet funcionando!"}`

### Verificar Conexão com Banco
- [ ] Verifique terminal onde rodou `npm start`
- [ ] Após iniciar, deve aparecer: "Conectado ao banco de dados MySQL"
- [ ] Se não aparecer, verifique credenciais em `.env`

### Verificar Token (F12 do Navegador)
- [ ] Abra DevTools (F12)
- [ ] Vá em "Application" ou "Local Storage"
- [ ] Procure por `http://localhost:8000`
- [ ] Verifique se existe chave `token` com um valor longo
- [ ] Verifique se existe chave `user` com JSON do usuário

### Ver Erros de Rede (F12)
- [ ] Abra DevTools (F12)
- [ ] Vá em aba "Network"
- [ ] Execute uma ação (criar chamado, etc)
- [ ] Verifique requisições HTTP
- [ ] Procure por status verde (200, 201, 204)
- [ ] Se ver vermelho (400, 401, 500), clique na requisição para ver erro

## Configurações Avançadas (Opcional)

### Mudar Porta do Backend
- [ ] Edite `backend/.env`
- [ ] Mude `PORT=5000` para outra porta (ex: 3000)
- [ ] Pare o servidor (Ctrl+C)
- [ ] Execute `npm start` novamente
- [ ] Atualize URLs em `frontend/js/*.js` se necessário

### Mudar Porta do Frontend
- [ ] Ao servir com Python: `python -m http.server 9000`
- [ ] Então acesse: `http://localhost:9000`

### Usar HTTPS (Produção)
- [ ] Gere certificados SSL
- [ ] Configure em servidor Node.js
- [ ] Atualize CORS_ORIGIN nas variáveis

## Checklist Final

- [ ] Node.js e npm instalados
- [ ] MySQL rodando
- [ ] Banco de dados criado
- [ ] Backend npm install concluído
- [ ] Backend rodando na porta 5000
- [ ] Frontend sendo servido na porta 8000
- [ ] Consegue acessar http://localhost:8000
- [ ] Consegue fazer login com admin/admin123
- [ ] Dashboard carrega com dados
- [ ] Consegue criar chamado
- [ ] Consegue listar comunichados
- [ ] Consegue enviar documento
- [ ] Consegue fazer logout
- [ ] LocalStorage tem token após login
- [ ] Não há erros vermelhos no console (F12)
- [ ] Não há erros no terminal do backend

### Próximos passos:
1. Explore todas as funcionalidades
2. Customize cores e cores conforme necessário
3. Adicione mais usuários
4. Configure email (opcional)
5. Faça backup do banco de dados
6. Configure em um servidor real para produção

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| "Cannot connect to database" | Verifique MySQL rodando, credenciais em .env |
| "CORS error" | Backend não está rodando em port 5000 |
| "npm: command not found" | Instale Node.js de https://nodejs.org |
| "Port 8000 already in use" | Use outra porta: `python -m http.server 9000` |
| "Token inválido" | Limpe localStorage (F12 → Application) e faça login novamente |
| Arquivo não faz upload | Crie pastas uploads/chamados e uploads/documentos |

---

**Sistema Desenvolvido por Nelson Junior com IA Assistida**