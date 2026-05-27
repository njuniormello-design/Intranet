# Inventário de TI

Este documento descreve o módulo de Inventário de TI da intranet, criado para controlar dispositivos, patrimônio/imobilizado, vínculo com colaboradores e histórico de movimentações.

## Objetivo

Organizar os ativos de TI de forma auditável, mantendo:

- cadastro dos dispositivos;
- vínculo atual com colaborador ou usuário;
- patrimônio e imobilizado;
- status operacional;
- histórico de entregas, devoluções e transferências.

## Regra principal

Um item pode ter apenas um vínculo ativo por vez.

Quando um equipamento é vinculado a outro colaborador:

1. o vínculo ativo anterior é encerrado como `transferido`;
2. um novo vínculo ativo é criado;
3. o item muda para `em_uso`;
4. uma movimentação é registrada no histórico.

Na devolução:

1. o vínculo ativo é encerrado como `devolvido`;
2. o item muda para `estoque`, `manutencao` ou `baixado`;
3. uma movimentação de devolução é registrada.

## Tabelas

### `inventario_itens`

Cadastro principal do dispositivo.

Campos principais:

- `tipo`
- `marca`
- `modelo`
- `numero_serie`
- `patrimonio`
- `imobilizado`
- `hostname`
- `ip`
- `mac_address`
- `setor`
- `status`
- `observacoes`
- `criado_em`
- `atualizado_em`

Status possíveis:

- `em_uso`
- `estoque`
- `manutencao`
- `baixado`
- `emprestado`
- `reservado`
- `extraviado`

### `inventario_vinculos`

Guarda o vínculo entre item e colaborador.

Campos principais:

- `item_id`
- `usuario_id`
- `colaborador_nome`
- `setor`
- `data_entrega`
- `data_devolucao`
- `status`
- `termo_responsabilidade`
- `observacoes`
- `criado_por`
- `criado_em`

Status possíveis:

- `ativo`
- `devolvido`
- `transferido`

### `inventario_movimentacoes`

Histórico auditável do item.

Campos principais:

- `item_id`
- `usuario_origem`
- `usuario_destino`
- `setor_origem`
- `setor_destino`
- `tipo_movimentacao`
- `descricao`
- `realizado_por`
- `criado_em`

Tipos de movimentação:

- `entrada`
- `entrega`
- `devolucao`
- `transferencia`
- `manutencao`
- `baixa`
- `termo`

### `inventario_termos`

Guarda os arquivos dos termos assinados anexados ao inventário.

Campos principais:

- `vinculo_id`
- `item_id`
- `file_name`
- `file_path`
- `file_type`
- `file_size`
- `uploaded_by`
- `created_at`

O termo assinado é anexado ao vínculo ativo do item. Assim, se o equipamento for transferido depois, o arquivo continua preservado no histórico daquele vínculo.

## Rotas da API

Base: `/api/inventario`

| Método | Rota | Função |
|---|---|---|
| `GET` | `/summary` | Resumo do inventário |
| `GET` | `/` | Listar itens com filtros |
| `GET` | `/termo/responsavel` | Gerar base do termo consolidado por colaborador |
| `POST` | `/importar-csv` | Importar planilha CSV da TI |
| `GET` | `/termos/:termoId/download` | Baixar termo assinado |
| `GET` | `/:id` | Detalhar item, vínculos e histórico |
| `POST` | `/` | Criar item |
| `PUT` | `/:id` | Atualizar item |
| `DELETE` | `/:id` | Excluir item sem vínculo ativo |
| `GET` | `/:id/termos` | Listar termos assinados do item |
| `POST` | `/:id/termo-assinado` | Anexar termo assinado ao vínculo ativo |
| `POST` | `/:id/vincular` | Vincular ou transferir item |
| `POST` | `/:id/devolver` | Registrar devolução |
| `GET` | `/:id/historico` | Listar histórico do item |

## Permissões

- Todos os usuários autenticados podem acessar o módulo de Inventário TI.
- Usuários sem perfil `admin` ou `creator` visualizam somente os itens com vínculo ativo para o próprio `usuario_id` ou para o mesmo nome cadastrado no usuário.
- Apenas `admin` e `creator` podem cadastrar, editar, vincular, devolver, excluir itens, anexar termos assinados e importar planilhas.
- Item com vínculo ativo não pode ser excluído. Primeiro deve ser registrada a devolução.

## Tela no dashboard

A aba `Inventário TI` possui:

- cards de resumo;
- cadastro de item;
- filtros por texto, status e setor;
- tabela de dispositivos;
- ações de ver detalhes, editar, vincular, devolver e excluir.
- geração de termo de responsabilidade para impressão/assinatura.
- anexo de termo assinado em PDF ou imagem.
- importação da planilha atual da TI em CSV.

Cards atuais:

- Total;
- Em uso;
- Estoque;
- Pendências.

Pendências considera itens sem vínculo ativo ou sem patrimônio/imobilizado.

## Fluxo recomendado

1. Cadastrar o item com patrimônio, imobilizado e dados técnicos.
2. Manter status inicial como `estoque`.
3. Vincular ao colaborador responsável.
4. Conferir se o item mudou para `em_uso`.
5. Clicar em `Termo` para gerar o termo de responsabilidade.
6. Usar `Imprimir / Salvar PDF` no navegador.
7. Imprimir para assinatura do colaborador e responsável de TI.
8. Depois de assinado, abrir `Ver` e anexar o PDF ou imagem do termo assinado.
9. Usar `Ver` para consultar histórico e termos assinados.
10. Em troca de responsável, usar `Vincular` novamente.
11. Em retorno do equipamento, usar `Devolver`.
12. Em descarte definitivo, alterar status para `baixado`.

## Termo de responsabilidade

O termo é gerado pela própria tela do inventário, sem depender de biblioteca externa de PDF.

O termo é consolidado por colaborador. Ou seja: se o mesmo colaborador tiver notebook, monitor, headset e celular vinculados, todos aparecem no mesmo documento.

Como gerar:

1. Abra `Inventário TI`.
2. Localize um item que tenha vínculo ativo.
3. Clique em `Termo consolidado` em qualquer item vinculado ao colaborador.
4. Uma nova janela será aberta com o documento formatado.
5. Clique em `Imprimir / Salvar PDF`.
6. No navegador, escolha impressora física ou `Salvar como PDF`.

O termo contém:

- nome do colaborador;
- setor;
- data de entrega;
- equipamento;
- patrimônio;
- imobilizado;
- número de série;
- hostname/IP;
- total de itens vinculados;
- declaração de responsabilidade;
- campo de assinatura do colaborador;
- campo de assinatura do responsável de TI.

Importante: quando o vínculo for feito digitando o nome manualmente, o agrupamento usa o mesmo nome do colaborador. Para acumular corretamente no mesmo termo, mantenha o nome sempre padronizado.

## Termo assinado

Depois que o documento for impresso, assinado e digitalizado:

1. Abra `Inventário TI`.
2. Clique em `Ver` no item vinculado.
3. Na seção `Termo assinado`, selecione o arquivo PDF ou imagem.
4. Clique em `Anexar termo assinado`.

O sistema registra o vínculo ativo, item, nome original do arquivo, tipo, tamanho, usuário que anexou, data do anexo e uma movimentação do tipo `termo`.

Os termos anexados aparecem na tela de detalhes do item com botão para baixar.

## Importação da planilha da TI

A importação aceita arquivo CSV. Antes de importar, abra a planilha atual no Excel ou LibreOffice e exporte como CSV.

Colunas reconhecidas automaticamente:

- `PC`, `Computador`, `Hostname`;
- `IP`;
- `Colaborador`, `Usuário`, `Responsável`;
- `Setor`;
- `Tipo de computador`, `Tipo`, `Dispositivo`, `Equipamento`;
- `Marca`;
- `Modelo`;
- `Número de série`, `Série`, `Serial`;
- `Patrimônio`;
- `Imobilizado`;
- `MAC`;
- `Monitores`;
- `Ramal`;
- `Antivírus`;
- `USB Lock`;
- `Senha ADM`;
- `Observações`.

Regra da importação:

1. cada linha cria um item em `inventario_itens`;
2. se houver colaborador/usuário na linha, o sistema cria um vínculo ativo;
3. itens vinculados entram como `em_uso`;
4. itens sem colaborador entram como `estoque`;
5. dados complementares como antivírus, USB Lock, monitores e ramal entram nas observações;
6. o histórico recebe movimentação de `entrada` e, quando houver colaborador, também de `entrega`.

## Próximas evoluções
- Relatório de auditoria:
  - equipamentos sem patrimônio;
  - equipamentos sem usuário;
  - equipamentos com usuário mas sem termo;
  - equipamentos em manutenção;
  - equipamentos por setor.
