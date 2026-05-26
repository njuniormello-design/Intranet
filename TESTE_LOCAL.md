# Teste local antes de produção

## 1. Subir ambiente local

Na raiz do projeto:

```powershell
npm start
```

Abra:

```text
http://127.0.0.1:8000/index.html
```

Se aparecer `EADDRINUSE`, ja existe servidor rodando. Para reiniciar:

```powershell
Get-Process node | Stop-Process
npm start
```

## 2. Checagem automática

Com backend e frontend rodando, execute em outro terminal:

```powershell
npm run check
```

Esse comando valida:

- sintaxe dos arquivos principais;
- conexão com o banco local;
- existência das colunas de validação do chamado;
- backend respondendo na porta 5000;
- frontend respondendo na porta 8000.

## 3. Fluxo funcional obrigatório

1. Login como admin/técnico.
2. Criar ou abrir um chamado do usuário de teste.
3. Preencher `Causa`, `Ação executada`, `Solução aplicada` e `Tipo de atendimento`.
4. Alterar status para `Resolvido`.
5. Login como o usuário solicitante.
6. Abrir `Chamados de TI`.
7. Confirmar que o chamado resolvido aparece para validação.
8. Clicar em `Validar e fechar` e conferir status `Fechado`.
9. Repetir com outro chamado e clicar em `Não validar e reabrir`, descrevendo a situação.
10. Confirmar status `Reaberto` e registro no histórico.
11. Para regra automática: chamado `Resolvido` com validação `Pendente` por 5 dias corridos deve ser fechado automaticamente pelo backend, com histórico `Fechamento automático`.

## 4. Critério para produção

Só enviar para produção quando:

- `npm run check` passar sem erros;
- os dois fluxos do passo 3 funcionarem;
- houver backup recente do banco de produção.
