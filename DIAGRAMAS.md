# 📊 Diagramas do Sistema de Intranet

## 1. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NAVEGADOR CLIENTE                          │
│                 (HTML + CSS + JavaScript Vanilla)                   │
│                     http://localhost:8000                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  index.html (Login/Registro) + dashboard.html (Principal)   │  │
│  │  CSS: style.css | JS: auth.js, dashboard.js                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │
                    ╔═════════════════════════╗
                    ║   REQUISIÇÕES HTTP/JSON ║
                    ║   (JWT Token Header)    ║
                    ╚═════════════════════════╝
                                  │
┌─────────────────────────────────┴──────────────────────────────────┐
│                      EXPRESS SERVER                                 │
│                   Node.js (localhost:5000)                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Routes & Controllers                            │  │
│  │  • POST   /api/auth/register                               │  │
│  │  • POST   /api/auth/login                                  │  │
│  │  • GET    /api/auth/verify                                 │  │
│  │  • POST   /api/chamados/create (+ anexos)                 │  │
│  │  • GET    /api/chamados/my-chamados                       │  │
│  │  • GET    /api/chamados/all                                │  │
│  │  • PUT    /api/chamados/:id/status                        │  │
│  │  • POST   /api/comunicados/create                         │  │
│  │  • GET    /api/comunicados/list                           │  │
│  │  • POST   /api/documentos/upload                          │  │
│  │  • GET    /api/documentos/list                            │  │
│  │  • DELETE /api/documentos/:id                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Middleware & Libraries                          │  │
│  │  • Express (servidor web)                                  │  │
│  │  • Multer (upload de arquivos)                             │  │
│  │  • JWT (autenticação)                                      │  │
│  │  • bcryptjs (hash de senhas)                               │  │
│  │  • express-validator (validação)                           │  │
│  │  • CORS (requisições cross-origin)                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │
                    ╔═════════════════════════╗
                    ║   SQL Queries (mysql2)  ║
                    ║   Connection Pool       ║
                    ╚═════════════════════════╝
                                  │
        ┌─────────────────────────────────────────────┐
        │         MYSQL DATABASE                      │
        │      localhost:3306/intranet_db             │
        │  ┌─────────────────────────────────────┐   │
        │  │  Tables:                            │   │
        │  │  • users                            │   │
        │  │  • chamados                         │   │
        │  │  • chamado_attachments              │   │
        │  │  • comunicados                      │   │
        │  │  • documentos                       │   │
        │  └─────────────────────────────────────┘   │
        └─────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────────────────────────┐
        │     SISTEMA DE ARQUIVO (File System)        │
        │  /uploads/                                  │
        │  ├── /chamados/   (imagens de chamados)    │
        │  └── /documentos/ (documentos enviados)    │
        └─────────────────────────────────────────────┘
```

## 2. Fluxo de Autenticação

```
┌────────────────────────────────────────┐
│  1. Usuário Digita Login/Senha         │
│     (index.html)                       │
└────────────────────────────────────────┘
                  │
                  ↓
┌────────────────────────────────────────┐
│  2. FormData envia POST /api/auth/login│
│     {username, password}               │
└────────────────────────────────────────┘
                  │
                  ↓
┌────────────────────────────────────────┐
│  3. Backend valida credenciais         │
│     • Busca user no DB                 │
│     • Compara senha com bcrypt         │
└────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ↓                   ↓
  ✓ Válido          × Inválido
        │                   │
        ↓                   ↓
┌────────────────────┐  ┌─────────────────┐
│  4. Cria JWT Token │  │ Retorna erro    │
│     (exp: 7 dias)  │  │ 401 Unauthorized│
└────────────────────┘  └─────────────────┘
        │
        ↓
┌────────────────────────────────────────┐
│  5. Retorna token ao frontend          │
│     {token, user: {id, name}}          │
└────────────────────────────────────────┘
        │
        ↓
┌────────────────────────────────────────┐
│  6. JavaScript salva no localStorage   │
│     localStorage.token = "xxx.yyy.zzz" │
└────────────────────────────────────────┘
        │
        ↓
┌────────────────────────────────────────┐
│  7. Redireciona para dashboard.html    │
└────────────────────────────────────────┘
        │
        ↓
┌────────────────────────────────────────┐
│  8. Todas requisições da API agora     │
│     incluem o token no header          │
│     Authorization: Bearer {token}      │
└────────────────────────────────────────┘
```

## 3. Fluxo de Criar Chamado

```
┌──────────────────────────────────────┐
│  1. Usuário preenche formulário      │
│     • Título                         │
│     • Descrição                      │
│     • Categoria                      │
│     • Prioridade                     │
│     • Imagens (até 5)                │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  2. FormData cria multipart request  │
│     com los arquivos                 │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  3. POST /api/chamados/create        │
│     Header: Authorization: Bearer    │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  4. Backend valida dados             │
│     • Verifica token                 │
│     • Valida entrada                 │
│     • Verifica tamanho arquivo       │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  5. Multer salva arquivos            │
│     /uploads/chamados/xxxx-xxxx.jpg │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  6. Insere dados no MySQL            │
│     • 1 registro em chamados         │
│     • N registros em attachments     │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  7. Retorna sucesso + ID do chamado  │
│     {message, chamadoId}             │
└──────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  8. Frontend mostra mensagem sucesso │
│  9. Recarrega lista de chamados      │
│  10. Formulário volta ao vazio       │
└──────────────────────────────────────┘
```

## 4. Estrutura de Pastas

```
Intranet/
│
├── backend/
│   │
│   ├── config/
│   │   └── database.js          (Conexão MySQL)
│   │
│   ├── routes/
│   │   ├── auth.js              (Login/Registro)
│   │   ├── chamados.js          (Chamados)
│   │   ├── comunicados.js       (Comunicados)
│   │   └── documentos.js        (Documentos)
│   │
│   ├── uploads/
│   │   ├── chamados/            (Imagens de chamados)
│   │   └── documentos/          (Documentos enviados)
│   │
│   ├── node_modules/            (Dependências npm)
│   │
│   ├── server.js                (Servidor principal)
│   ├── package.json             (Dependências)
│   ├── package-lock.json        (Versions locked)
│   ├── .env                     (Configurações)
│   └── .env.example             (Template .env)
│
├── frontend/
│   │
│   ├── css/
│   │   └── style.css            (Estilos CSS)
│   │
│   ├── js/
│   │   ├── auth.js              (Lógica de login)
│   │   └── dashboard.js         (Lógica do dashboard)
│   │
│   ├── index.html               (Login/Registro)
│   └── dashboard.html           (Dashboard principal)
│
├── database/
│   └── schema.sql               (Script MySQL)
│
├── .git/                        (Git repository)
├── .gitignore                   (Git ignore rules)
├── README.md                    (Documentação principal)
├── INSTALACAO_RAPIDA.md         (Guia rápido)
├── ARQUITETURA.md               (Arquitetura técnica)
├── RESUMO.md                    (Resumo do projeto)
└── verify.sh                    (Script de verificação)
```

## 5. Ciclo de Vida da Aplicação

```
┌─────────────────────────────────────────┐
│  START: npm start (backend)            │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Carregar .env                         │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Conectar MySQL Pool                   │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Registrar rotas /api/*                │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Iniciar servidor na porta 5000        │
│  "Servidor rodando na porta 5000"      │
└─────────────────────────────────────────┘
           │
           ↓ (Usuário acessa localhost:8000)
┌─────────────────────────────────────────┐
│  Frontend carrega index.html           │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Usuário faz login                    │
│  → Requisição ao backend               │
│  → JWT token gerado                   │
│  → Redireciona para dashboard.html    │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Dashboard carregado                   │
│  → Busca dados da API                 │
│  → Mostra estatísticas                │
│  → Carrega comunicados                │
└─────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────┐
│  Usuário interage com sistema          │
│  → Criar chamado                      │
│  → Enviar documento                   │
│  → Visualizar comunicado              │
└─────────────────────────────────────────┘
```

## 6. Modelo de Dados (Relacionamentos)

```
┌──────────────┐
│    users     │
├──────────────┤
│ id (PK)      │
│ username ⟵──┐
│ email       │
│ password    │
│ name        │
│ department  │
│ role        │
│ created_at  │
└──────────────┘
        ↑
        │ (1:N)
        ├─────────────────────┬─────────────────────┐
        │                     │                     │
        │                     │                     │
        │                     │                     │
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  chamados    │    │comunicados    │    │  documentos  │
├──────────────┤    ├──────────────┤    ├──────────────┤
│ id (PK)      │    │ id (PK)      │    │ id (PK)      │
│ user_id (FK) │    │ user_id (FK) │    │ user_id (FK) │
│ title        │    │ title        │    │ name         │
│ description  │    │ content      │    │ category     │
│ priority     │    │ priority     │    │ description  │
│ category     │    │ created_at   │    │ file_path    │
│ status       │    │ updated_at   │    │ file_size    │
│ created_at   │    │              │    │ downloads    │
│ updated_at   │    │              │    │ created_at   │
└──────────────┘    └──────────────┘    └──────────────┘
        ↑
        │ (1:N)
        │
┌──────────────────────────────┐
│ chamado_attachments          │
├──────────────────────────────┤
│ id (PK)                      │
│ chamado_id (FK) ─────────────→
│ file_name                    │
│ file_path                    │
│ file_type                    │
│ file_size                    │
│ created_at                   │
└──────────────────────────────┘
```

## 7. Endpoints por Recurso

```
┌─────────────────────────────────────────────┐
│          AUTENTICAÇÃO (/api/auth)           │
├─────────────────────────────────────────────┤
│ POST   /register    → Criar novo usuário    │
│ POST   /login       → Login (retorna token) │
│ GET    /verify      → Verificar token       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│          CHAMADOS (/api/chamados)           │
├─────────────────────────────────────────────┤
│ POST   /create      → Criar chamado         │
│ GET    /my-chamados → Listar meus           │
│ GET    /all         → Listar todos (admin)  │
│ PUT    /:id/status  → Atualizar status      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│       COMUNICADOS (/api/comunicados)        │
├─────────────────────────────────────────────┤
│ POST   /create      → Criar comunicado      │
│ GET    /list        → Listar comunicados    │
│ GET    /:id         → Obter um              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│       DOCUMENTOS (/api/documentos)          │
├─────────────────────────────────────────────┤
│ POST   /upload      → Enviar documento      │
│ GET    /list        → Listar documentos     │
│ GET    /categories  → Listar categorias     │
│ DELETE /:id         → Deletar documento     │
└─────────────────────────────────────────────┘
```

---

**Sistema Desenvolvido por Nelson Junior com IA Assistida**
