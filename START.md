# Sistema de Intranet LI

### Arquivos Criados: 20+
- Backend Node.js/Express ✅
- Frontend HTML/CSS/JavaScript ✅ 
- Banco MySQL com schema ✅
- Autenticação JWT ✅
- Upload de arquivos ✅
- Documentação completa ✅

---

✅ **Login/Registro** com autenticação segura
✅ **Dashboard** com estatísticas em tempo real
✅ **Abertura de Chamados** com anexo de imagens
✅ **Comunicados** corporativos
✅ **Repositório de Documentos** com upload/download
✅ **Banco de Dados MySQL** normalizado
✅ **API REST** com 12+ endpoints
✅ **Interface Responsiva** para mobile/desktop

---

## Estrutura Criada

```
Intranet/
├── backend/                    (Servidor Node.js + Express)
│   ├── config/database.js
│   ├── routes/auth.js
│   ├── routes/chamados.js
│   ├── routes/comunicados.js
│   ├── routes/documentos.js
│   ├── server.js
│   ├── package.json
│   ├── .env
│   └── .env.example
├── frontend/                   (Interface Web)
│   ├── index.html              (Login)
│   ├── dashboard.html          (Principal)
│   ├── css/style.css
│   ├── js/auth.js
│   └── js/dashboard.js
├── database/
│   └── schema.sql              (Script MySQL)
└── Documentação/
    ├── README.md               (Documentação completa)
    ├── INSTALACAO_RAPIDA.md    (Guia 30 min)
    ├── CHECKLIST.md            (Verif. passo a passo)
    ├── ARQUITETURA.md          (Detalhes técnicos)
    ├── DIAGRAMAS.md            (Diagramas visuais)
    └── RESUMO.md               (Overview)
```

---

## Como Começar (30 minutos)

### Banco de Dados (2 min)

```bash
mysql -u root -p < database/schema.sql
```

Ou copie o conteúdo do arquivo `database/schema.sql` no MySQL Workbench e execute.

✅ Usuário padrão criado:
- **Usuário:** admin
- **Senha:** admin123

### Backend (8 min)

```bash
cd backend
npm install
npm start
```

Aguarde mensagem: "Servidor rodando na porta 5000"

**Mantenha este terminal aberto!**

### 3️Frontend (5 min)

Novo terminal na pasta `frontend`:

```bash
npm start
```

O frontend ficará disponível em `http://localhost:8000`

### Acessar (1 min)

```
http://localhost:8000
```

**Login padrão:**
- Usuário: `admin`
- Senha: `admin123`

---

## Testar Funcionalidades

### Login
1. Acesse http://localhost:8000
2. Login com `admin` / `admin123`
3. Verifique nome no canto superior direito

### Criar Chamado
1. Clique em "Chamados"
2. Clique "+ Novo Chamado"
3. Preencha formulário
4. Anexe uma imagem (opcional)
5. Clique "Enviar Chamado"

### Enviar Documento
1. Clique em "Documentos"
2. Clique "+ Enviar Documento"
3. Selecione um arquivo
4. Preencha dados
5. Teste download depois

### Registrar Nova Conta
1. Clique em "Registre-se aqui" (na página de login)
2. Preencha dados
3. Faça login com a nova conta

---

## Documentação

| Arquivo | Conteúdo |
|---------|----------|
| **README.md** | Documentação completa, endpoints API, troubleshooting |
| **INSTALACAO_RAPIDA.md** | Guia de 30 min com testes de funcionalidade |
| **CHECKLIST.md** | Verificação passo a passo de instalação |
| **ARQUITETURA.md** | Detalhes técnicos, estrutura de tabelas, segurança |
| **DIAGRAMAS.md** | Fluxos de dados, arquitetura visual, relacionamentos |
| **RESUMO.md** | Overview do projeto, estatísticas, tecnologias |

---

## Principais Arquivo do Código

### Backend
- **server.js** - Servidor principal
- **routes/auth.js** - Autenticação (login/registro)
- **routes/chamados.js** - Gerenciar chamados
- **routes/comunicados.js** - Gerenciar comunicados
- **routes/documentos.js** - Upload/download documentos
- **config/database.js** - Conexão MySQL

### Frontend
- **index.html** - Página de login
- **dashboard.html** - Dashboard principal
- **js/auth.js** - Lógica de login
- **js/dashboard.js** - Lógica do dashboard
- **css/style.css** - Estilos (800+ linhas)

### Banco de Dados
- **schema.sql** - 5 tabelas normalizadas

---

## Endpoints da API

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/verify

POST   /api/chamados/create
GET    /api/chamados/my-chamados
GET    /api/chamados/all
PUT    /api/chamados/:id/status

POST   /api/comunicados/create
GET    /api/comunicados/list
GET    /api/comunicados/:id

POST   /api/documentos/upload
GET    /api/documentos/list
GET    /api/documentos/categories
DELETE /api/documentos/:id
```

---

## Segurança Implementada

✅ Hash de senhas com bcrypt
✅ Autenticação JWT (expira em 7 dias)
✅ Validação de entrada em todos endpoints
✅ CORS configurado
✅ Limite de tamanho: 5MB por arquivo
✅ Validação de tipo de arquivo

---

### "Cannot connect to database"
```bash
# Verifique MySQL está rodando
mysql --version
# Verifique credenciais em backend/.env
```

### "CORS error"
```bash
# Verifique backend está rodando
# Terminal: curl http://localhost:5000/api/test
# Deve retornar: {"message":"API de Intranet funcionando!"}
```

### "Port 8000 already in use"
```bash
# Use outra porta
python -m http.server 9000
# Acesse http://localhost:9000
```

### "Token inválido"
```javascript
// Limpe localStorage (F12 do navegador)
localStorage.clear()
// Faça login novamente
```

---

## Estatísticas

- **Arquivos Criados**: 20+
- **Linhas de Código**: 3000+
- **Endpoints**: 12+
- **Tabelas BD**: 5
- **Funcionalidades**: 10+
- **Documentação**: 6 arquivos
- **Tempo de Setup**: 30 minutos

---

## Próximos Passos

1. Instale conforme passo a passo acima
2. Leia INSTALACAO_RAPIDA.md para mais detalhes
3. Teste todas as funcionalidades
4. Customize cores/logos conforme necessário
5. Crie mais usuários
6. Deploy em servidor real (AWS, Azure, DigitalOcean, etc)

---

## Dicas Importantes

- ✅ Mantenha backend rodando enquanto usa
- ✅ Use DevTools (F12) para debug
- ✅ Mude JWT_SECRET antes de ir pro ar
- ✅ Configure HTTPS em produção
- ✅ Faça backups do banco regularmente
- ✅ Teste login com diferentes usuários
- ✅ Anexe imagens ao criar chamado
- ✅ Organize documentos em categorias

---

## Multiplataforma

✅ Windows
✅ Mac
✅ Linux
✅ Desktop browsers
✅ Mobile browsers (responsivo)

---

**P: Posso alterar as cores?**
✅ Sim, edite `frontend/css/style.css`

**P: Como adicionar mais usuários?**
✅ Clique em "Registre-se" ou use banco de dados

**P: Como fazer upload de documento?**
✅ Va para "Documentos" → "+ Enviar Documento"

**P: Como resetar banco de dados?**
✅ Execute o schema.sql novamente

**P: Como mudar a senha do admin?**
✅ Use MySQL para atualizar (senha é hash bcrypt)

---

**Próximo passo:** Execute `npm start` no backend e `npm start` na pasta `frontend`, depois acesse `http://localhost:8000`


**Sistema Desenvolvido por Nelson Junior com IA Assistida**
