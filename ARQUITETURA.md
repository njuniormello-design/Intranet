## Arquitetura da Aplicação

```
┌─────────────────────────────────────────────────────────────┐
│                       NAVEGADOR DO USUÁRIO                  │
│                   (HTML + CSS + JavaScript)                 │
│              (Frontend - http://localhost:8000)              │
└───────────────────────────────┬─────────────────────────────┘
                                │
                 ┌──────────────────────────┐
                 │   HTTP/CORS/JSON API     │
                 │  (Backend Port 5000)     │
                 └──────────┬───────────────┘
                            │
         ┌──────────────────────────────────────────┐
         │          EXPRESS SERVER (Node.js)        │
         │  • Autenticação (JWT)                    │
         │  • Validação de dados                    │
         │  • Upload de arquivos (Multer)           │
         │  • Controle de acesso                    │
         └──────────────────────────────────────────┘
                            │
         ┌──────────────────────────────────────────┐
         │    MYSQL DATABASE (localhost:3306)       │
         │  • Users (usuários)                      │
         │  • Chamados (tickets)                    │
         │  • Chamado Attachments (anexos)          │
         │  • Comunicados (announcements)           │
         │  • Documentos (documents)                │
         └──────────────────────────────────────────┘
                            │
         ┌──────────────────────────────────────────┐
         │        SISTEMA DE ARQUIVOS                │
         │  • uploads/chamados/ (imagens dos chamados)
         │  • uploads/documentos/ (arquivos)        │
         └──────────────────────────────────────────┘
```

## Fluxo de Dados - Login

```
1. Usuário digita login/senha na página index.html
   │
   ├─> JavaScript (auth.js) faz POST /api/auth/login
   │
   ├─> Express valida credenciais com bcrypt
   │
   ├─> Se válido, gera JWT token com dados do usuário
   │
   ├─> Retorna token ao frontend
   │
   ├─> JavaScript armazena token no localStorage
   │
   └─> Redireciona para dashboard.html
```

## Fluxo de Dados - Criar Chamado

```
1. Usuário preenche formulário de novo chamado
   │
   ├─> FormData cria multipart para envio de arquivos
   │
   ├─> POST /api/chamados/create com token JWT no header
   │
   ├─> Multer salva arquivos em /uploads/chamados/
   │
   ├─> Express insere registros:
   │   - 1 registro em `chamados` (título, descrição, etc)
   │   - N registros em `chamado_attachments` (um por arquivo)
   │
   ├─> Retorna sucesso ao frontend
   │
   └─> JavaScript recarrega a lista de chamados
```

## Fluxo de Dados - Upload de Documento

```
1. Usuário seleciona arquivo e preenche dados
   │
   ├─> FormData com arquivo
   │
   ├─> POST /api/documentos/upload com token JWT
   │
   ├─> Multer valida tipo e tamanho do arquivo
   │
   ├─> Arquivo salvo em /uploads/documentos/
   │
   ├─> Registro inserido em `documentos` (metadados)
   │
   ├─> Retorna sucesso
   │
   └─> JavaScript recarrega lista de documentos
```

## Estrutura das Tabelas

### users
```
id (PK) | username | email | password | name | department | role | created_at | updated_at
```

### chamados
```
id (PK) | user_id (FK) | title | description | priority | category | status | assigned_to (FK) | created_at | updated_at
```

### chamado_attachments
```
id (PK) | chamado_id (FK) | file_name | file_path | file_type | file_size | created_at
```

### comunicados
```
id (PK) | user_id (FK) | title | content | priority | created_at | updated_at
```

### documentos
```
id (PK) | user_id (FK) | name | category | description | file_path | file_name | file_type | file_size | downloads | created_at | updated_at
```

## Segurança Implementada

✅ **Autenticação JWT:** Todos os endpoints (exceto login/register) requerem token válido
✅ **Validação de entrada:** express-validator em todos os formulários
✅ **Hash de senhas:** bcrypt com salt rounds
✅ **CORS:** Apenas requisições permitidas
✅ **Limite de arquivo:** Máximo 5MB por arquivo
✅ **Tipos permitidos:** Apenas imagens e PDF

## Melhorias Propostas

1. **Rate Limiting:** Implementar limites de requisições por IP
2. **Refresh Tokens:** tokens que expiram e precisam ser renovados
3. **Roles e Permissões:** admin, user, moderator
4. **Auditoria:** Log de todas as ações importantes
5. **Notificações:** Email/SMS de novos chamados e comunicados
6. **Busca avançada:** Search full-text em chamados e documentos
7. **Painel administrativo:** Interface para gerenciar tudo
8. **Cloud storage:** Integração com AWS S3 ou similar
9. **Testes automatizados:** Jest, Mocha, etc.
10. **WebSocket:** Comunicação em tempo real

## Requisitos Mínimos

- Node.js v14+
- MySQL 5.7+
- 100MB de espaço em disco
- Navegador moderno (Chrome, Firefox, Safari, Edge)

## Escalabilidade

Para crescer para produção:

1. **Database:** Implementar replicação MySQL, backups automáticos
2. **Backend:** Usar PM2 para gerenciar múltiplos processos Node.js
3. **Frontend:** Implementar build process com Webpack/Vite
4. **Cloud:** Considerar AWS, Google Cloud, Azure
5. **Cache:** Redis ou Memcached para sessões e dados frequentes
6. **CDN:** Distribuição de arquivos estáticos
7. **Logging:** ELK Stack ou similar para logs centralizados
8. **Monitoring:** New Relic, DataDog ou similar para monitoramento
