# Sistema de Intranet Londrina Iluminação

Um sistema web corporativo completo com funcionalidades de login, gestão de chamados, comunicados e repositório de documentos.

## Tecnologias Utilizadas

- **Backend**: Node.js + Express
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla
- **Banco de Dados**: MySQL
- **Autenticação**: JWT (JSON Web Tokens)

## Funcionalidades

✅ **Login e Registro** - Sistema de autenticação seguro com JWT
✅ **Dashboard** - Visão geral de chamados, comunicados e documentos
✅ **Abertura de Chamados** - Criar, visualizar e gerenciar chamados com anexo de imagens
✅ **Comunicados** - Visualizar comunicados corporativos
✅ **Repositório de Documentos** - Upload, download e organização de documentos

## Estrutura do Projeto

```
Intranet/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── chamados.js
│   │   ├── comunicados.js
│   │   └── documentos.js
│   ├── package.json
│   ├── server.js
│   └── .env
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── auth.js
│   │   └── dashboard.js
│   ├── index.html
│   └── dashboard.html
├── database/
│   └── schema.sql
└── README.md
```

## Pré-requisitos

- Node.js (v14+)
- npm ou yarn
- MySQL Server
- Git (opcional)

## Instalação

### 1. Clonar o repositório

```bash
cd Intranet
```

### 2. Configurar o Banco de Dados

#### Opção A: Usando MySQL Workbench ou Cliente de Linha de Comando

```bash
mysql -u root -p < database/schema.sql
```

#### Opção B: Manualmente

1. Abra o MySQL Workbench ou seu cliente MySQL favorito
2. Copie e execute o conteúdo do arquivo `database/schema.sql`
3. O banco de dados `intranet_db` será criado com todas as tabelas

**Usuário padrão (admin):**
- Usuário: `admin`
- Senha: `admin123`
- Email: `admin@intranet.com`

### 3. Configurar o Backend

```bash
cd backend

# Instalar dependências
npm install

# Copiar arquivo .env (já existe)
# Editar .env com suas configurações de banco de dados
# Por padrão:
# DB_HOST=localhost
# DB_USER=root
# DB_PASSWORD= (deixe em branco se não houver senha)
# DB_NAME=intranet_db
# DB_PORT=3306

# Iniciar o servidor
npm start
# ou para desenvolvimento com auto-reload:
npm run dev
```

O servidor rodará em `http://localhost:5000`

### 4. Configurar o Frontend

```bash
# Na pasta frontend, servir os arquivos HTML
# Opção 1: Usar Python
python -m http.server 8000

# Opção 2: Usar Node.js com http-server
npx http-server -p 8000

# Opção 3: Usar VS Code Live Server Extension
# Basta clicar em "Go Live" no canto inferior direito
```

Acesse `http://localhost:8000` (ou a porta que configurou)

## Configuração do .env Backend

Edite o arquivo `backend/.env`:

```env
# Banco de Dados
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_NAME=intranet_db
DB_PORT=3306

# JWT
JWT_SECRET=seu_secreto_jwt_aqui_mude_em_producao
JWT_EXPIRE=7d

# Servidor
PORT=5000
NODE_ENV=development

# Upload
UPLOAD_DIR=uploads/
MAX_FILE_SIZE=5242880
```

## Endpoints da API

### Autenticação
- `POST /api/auth/register` - Registrar novo usuário
- `POST /api/auth/login` - Fazer login
- `GET /api/auth/verify` - Verificar token

### Chamados
- `POST /api/chamados/create` - Criar novo chamado
- `GET /api/chamados/my-chamados` - Listar meus chamados
- `GET /api/chamados/all` - Listar todos os chamados (admin)
- `PUT /api/chamados/:id/status` - Atualizar status do chamado

### Comunicados
- `POST /api/comunicados/create` - Criar comunicado
- `GET /api/comunicados/list` - Listar comunicados
- `GET /api/comunicados/:id` - Obter um comunicado

### Documentos
- `POST /api/documentos/upload` - Enviar documento
- `GET /api/documentos/list` - Listar documentos
- `GET /api/documentos/categories` - Listar categorias
- `DELETE /api/documentos/:id` - Deletar documento

## Fluxo de Uso

### 1. Primeira Vez
1. Acesse a página de login
2. Use o usuário `admin` com senha `admin123`
3. Ou registre um novo usuário

### 2. Dashboard
- Visualize estatísticas gerais
- Veja os últimos comunicados

### 3. Criar Chamado
1. Vá para "Chamados"
2. Clique em "+ Novo Chamado"
3. Preencha o formulário
4. Anexe imagens (opcional)
5. Clique em "Enviar Chamado"

### 4. Gerenciar Documentos
1. Vá para "Documentos"
2. Clique em "+ Enviar Documento"
3. Preencha os dados
4. Selecione o arquivo
5. Clique em "Enviar"

## Segurança

- Senhas são hashadas com bcrypt
- Autenticação por JWT
- CORS configurado
- Validação de entrada em todos os endpoints
- Limite de tamanho de arquivo (5MB por padrão)

## Melhorias Futuras

- [ ] Sistema de notificações em tempo real
- [ ] Painel administrativo completo
- [ ] Histórico de alterações de chamados
- [ ] Relatórios avançados
- [ ] Interface de comentários em chamados
- [ ] Sistema de avaliação de resolução
- [ ] Integração com email
- [ ] Suporte multi-idioma
- [ ] Testes automatizados
- [ ] CI/CD

## Troubleshooting

### Erro: "Cannot connect to database"
- Verifique se MySQL está rodando
- Confirme as credenciais em `.env`
- Verifique se o banco `intranet_db` foi criado

### Erro: "Token inválido"
- Limpe o localStorage do navegador
- Faça login novamente

### Erro: "CORS error"
- Verifique se o backend está rodando na porta 5000
- Confirme a URL da API em `frontend/js/*.js`

### Arquivo não faz upload
- Verifique o tipo de arquivo permitido
- Confirme o tamanho (máx. 5MB)
- Verifique permissões da pasta `/backend/uploads`

## Suporte

Para dúvidas ou problemas, consulte a documentação dos projetos utilizados:
- [Express.js Documentation](https://expressjs.com/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [JWT Documentation](https://jwt.io/)

## Licença

MIT License - Sinta-se livre para usar este projeto como base para seus sistemas.

**Sistema Desenvolvido por Nelson Junior com IA Assistida**