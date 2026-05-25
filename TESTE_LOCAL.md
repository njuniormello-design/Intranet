# Teste local antes de producao

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

## 2. Checagem automatica

Com backend e frontend rodando, execute em outro terminal:

```powershell
npm run check
```

Esse comando valida:

- sintaxe dos arquivos principais;
- conexao com o banco local;
- existencia das colunas de validacao do chamado;
- backend respondendo na porta 5000;
- frontend respondendo na porta 8000.

## 3. Fluxo funcional obrigatorio

1. Login como admin/tecnico.
2. Criar ou abrir um chamado do usuario de teste.
3. Preencher `Causa`, `Acao executada`, `Solucao aplicada` e `Tipo de atendimento`.
4. Alterar status para `Resolvido`.
5. Login como o usuario solicitante.
6. Abrir `Chamados de TI`.
7. Confirmar que o chamado resolvido aparece para validacao.
8. Clicar em `Validar e fechar` e conferir status `Fechado`.
9. Repetir com outro chamado e clicar em `Nao validar e reabrir`, descrevendo a situacao.
10. Confirmar status `Reaberto` e registro no historico.
11. Para regra automatica: chamado `Resolvido` com validacao `Pendente` por 5 dias corridos deve ser fechado automaticamente pelo backend, com historico `Fechamento automatico`.

## 4. Criterio para producao

So enviar para producao quando:

- `npm run check` passar sem erros;
- os dois fluxos do passo 3 funcionarem;
- houver backup recente do banco de producao.
