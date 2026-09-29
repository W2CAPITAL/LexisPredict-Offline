# LexisPredict Offline Web

Versão **offline-first** do LexisPredict para Vercel, usando a planilha jurídica como fonte de verdade operacional.

## O que está implementado

- Dashboard jurídico com KPIs da carteira.
- Processos com busca, filtros, score 0–100, qualidade **BOM / NEUTRO / RUIM** e edição.
- Fila automática de tarefas por prazo, audiência, cumprimento, trânsito/decurso, novidade e qualidade.
- Aba de análise com fases processuais, advogados, procedência/improcedência e triagem comercial.
- Cache local em **IndexedDB**: o app continua abrindo sem internet.
- Outbox de alterações: edições offline são reenviadas quando a conexão volta.
- Importação CSV e exportação JSON.
- Bridge opcional de duas vias com Google Sheets via Apps Script.
- Scanner DJEN server-side para evitar CORS no navegador.
- Rota compatível com o scanner da planilha: `/api/v1/comunicacao`.
- PWA/service worker para shell offline.

## Arquitetura

```
Google Sheets (Processos / Usuarios / DataJud / DJEN)
        ↕ Apps Script bridge
Vercel /api/sheets
        ↕
LexisPredict Offline Web
        ↕
IndexedDB + outbox

DJEN:
Browser → /api/djen → API pública oficial CNJ
Planilha V6 → <URL Vercel>/api/v1/comunicacao → API pública oficial CNJ
```

O proxy **não tenta burlar rate limit**. HTTP 429 é devolvido ao cliente e o scanner espera antes de retomar.

## Conectar à planilha

A integração com a planilha é feita por um Apps Script privado vinculado ao arquivo. O código-fonte do bridge não é distribuído neste repositório público.

Configure no backend da Vercel as variáveis de ambiente necessárias e use a implantação `/exec` do Apps Script privado.

O bridge preserva colunas não alteradas ao editar um processo.

## DataJud + DJEN

O módulo judicial do LexisPredict Sheets foi adaptado a partir do núcleo DataJud/DJEN do `W1CAPITAL/LexisPredict` para a arquitetura Sheets + Vercel.

Inclui:
- consulta DataJud por CNJ, nome e CPF/CNPJ;
- resolução de aliases TJ/TRF/TRT e tribunais superiores;
- sanitização e deduplicação de movimentos;
- detecção de encerramento, cumprimento de sentença, mérito e novidade pós-retorno;
- consulta DJEN oficial por CNJ, nome, texto e intervalo de datas;
- normalização de HTML, links de publicação, ato crítico, custas, Busca e Apreensão, CPF e veículo;
- scanner combinado DataJud + DJEN com atualização dos campos da aba `Processos`;
- pausa automática em HTTP 429, sem contornar bloqueios ou limites do CNJ.

A chave DataJud não é versionada. Configure `DATAJUD_API_KEY` na Vercel. O DJEN usa por padrão:

`https://comunicaapi.pje.jus.br/api/v1/comunicacao`

## Corrigir o DJEN da planilha V6

Depois do deploy na Vercel, coloque a URL base do site na configuração:

`Config → DJEN proxy URL (opcional)`

Exemplo:

`https://lexispredict-offline.vercel.app`

O scanner V6 já concatena `/api/v1/comunicacao`. Essa rota usa primeiro o endpoint de produção do DJEN e preserva o comportamento oficial de 429/403.

## Segurança

- O repositório público não contém o código-fonte do Apps Script privado.
- O token do bridge não é enviado ao navegador; fica nas Environment Variables da Vercel e nas Script Properties do Apps Script.
- `/api/sheets` aceita somente URLs HTTPS de Apps Script.
- Não versionar chaves, tokens, URLs privadas de implantação ou credenciais.
- A autenticação é validada pelo bridge privado conectado à planilha.

## Base usada

Este projeto combina:
- visual e operação do `W2CAPITAL/LexisPredict`;
- lógica offline-first do `W1CAPITAL/OFFLINE-LEXISPREDICT`;
- estrutura real da planilha `LexisPredict_Relatorio_Carteira_2026-08-27`.

## Desenvolvimento local

Não há dependências de frontend.

```bash
npx serve .
```

As rotas `/api` são Vercel Functions e funcionam integralmente quando publicadas na Vercel.

## SheetsPredict — Processos da empresa, fila Lexis e cache persistente

A versão **1.6.0** consolida o modo SheetsPredict sem Supabase:

- **Processos da empresa**: qualquer usuário autenticado pode consultar e editar a carteira completa da empresa.
- **Sem roubar processo**: editar ou registrar atendimento **não altera** o campo `Assistente`/dono da carteira. O crédito fica em `AtendidoPor`.
- **Novo cadastro**: o botão “Novo cadastro” cria processo novo e atribui o `Assistente` ao usuário atual por padrão.
- **Última movimentação reutilizada**: DataJud/DJEN já salvos na planilha aparecem imediatamente no app e no Audit 3D; consulta de rede só ocorre quando necessária/solicitada.
- **Tarefas estilo LexisPredict**: cards operacionais ordenados do caso mais crítico ao mais tranquilo, com mensagem rápida, WhatsApp, sugestão de resposta, Audit 3D e registro de atendimento.
- **Audit 3D / Sugerir resposta**: substituem o antigo botão “Auditar” da listagem. O Audit 3D combina cache da planilha + DataJud/DJEN quando atualizado.
- **F5 sem recarga pesada**: sessão visual + IndexedDB são reaproveitados; a carteira só é baixada novamente se o cache estiver antigo ou houver pendências.
- **Arquitetura**: Google Sheets + Apps Script + IndexedDB/outbox + Vercel Functions. **Não usa Supabase.**

Regra operacional principal:

```text
Assistente = dono/carteira
AtendidoPor = quem efetivamente atendeu
Editar != atender
Atender != transferir carteira
```

## SheetsPredict CRM — Google Sheets continua sendo a fonte da verdade

A partir da **v1.7.0**, a decisão arquitetural é explícita: o CRM continua na planilha. Não há migração obrigatória para Postgres/Supabase.

Para evitar transformar `Processos` em uma tabela única impossível de manter, o CRM usa **abas relacionadas por IDs**:

| Aba | Função |
|---|---|
| `Clientes` | cadastro 360° da pessoa/empresa |
| `Processos` | processos jurídicos; referencia `ClienteId` |
| `Interacoes` | WhatsApp, telefone, e-mail, reunião e registros internos |
| `PipelineCRM` | lead → consulta → proposta → contrato → cliente ativo/perdido |
| `AgendaCRM` | retornos, reuniões, audiências e outros compromissos |
| `TarefasCRM` | tarefas manuais, prioridade, SLA, recorrência e checklist |
| `DocumentosCRM` | metadados de documentos/arquivos do Drive |
| `Honorarios` | financeiro/honorários; acesso restrito a perfis elevados |
| `AuditoriaLogsApp` | trilha de alteração com entidade, campo, valor anterior e valor novo |

A aba `Processos` ganhou somente a coluna `ClienteId`; os dados existentes foram preservados.

### Migração inicial

A carteira atual foi agrupada por cliente e recebeu IDs estáveis:

- 2.496 cadastros iniciais em `Clientes`;
- 2.573 processos vinculados por `ClienteId`;
- registros genéricos como “NÃO IDENTIFICADO” não foram unidos automaticamente.

### Cliente 360°

A rota `/clientes` reúne processos, contatos, interações, pipeline, agenda e financeiro do mesmo cliente. Se o bridge CRM ainda não estiver publicado, a tela continua funcionando a partir da réplica de `Processos`; depois da publicação do Apps Script v8, carrega as abas CRM completas.

### Cache e concorrência

O navegador mantém `Processos` e as entidades CRM em IndexedDB. Edições offline usam outbox separado para processos e CRM. O Google Sheets continua sendo a fonte persistente; IndexedDB é apenas réplica/cache.


## SheetsPredict v1.8 — interface Lexis + rotas SPA

A interface operacional foi alinhada ao `W1CAPITAL/LexisPredict` sem trocar a arquitetura Google Sheets:

- `/cases` = **Processos** da carteira atribuída ao usuário;
- `/processos` = **Processos da empresa**, visível a todos os usuários autenticados;
- `/` = Dashboard operacional;
- `/report` = dossiê executivo;
- sidebar recolhível, com scroll próprio;
- único scanner do menu: **DataJud + DJEN**;
- listas de processos com scroll vertical e horizontal;
- botão **Histórico tribunal** abre a cronologia completa retornada por DataJud + DJEN;
- botão **Registrar atendimento** abre o fluxo detalhado e não altera `Assistente`;
- o Service Worker não armazena respostas 404;
- as rotas principais possuem rewrite para `index.html`, evitando 404 ao atualizar/F5.

A atualização do bridge do Google Apps Script é documentada em `docs/APPS-SCRIPT-DEPLOY.md`.


## Status

**v1.8.0 — interface operacional Lexis, /cases + /processos, histórico completo do tribunal, atendimento detalhado e correção de F5/SPA.** A planilha continua sendo a fonte operacional e o navegador mantém uma réplica offline para continuidade.


## DJEN — fonte oficial

A consulta pública usa o endpoint documentado no Swagger oficial do DJEN:

`https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao`

O GET público não exige login, mas possui controle de taxa por IP. O app e o proxy **não tentam contornar 429/403**: preservam o último dado válido e aguardam a janela indicada pelo CNJ antes de retomar. O upstream pode ser trocado por variável `DJEN_UPSTREAM` apenas para manutenção controlada.

## Deploy rápido na Vercel

Depois de conectar este repositório à Vercel, o deploy é automático a cada push na `main`. Não há build de frontend; `index.html` e assets são estáticos e `/api/*` são Vercel Functions.

[Importar este repositório na Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FW2CAPITAL%2FLexisPredict-Offline)

## Regra de propriedade da carteira

A coluna canônica para definir a carteira visível de um assistente é **`Processos!Assistente`**.

- **`CreatedBy` / `Criado por`** é trilha de auditoria/proveniência e **não** deve ser usada para filtrar a carteira.
- Assistentes veem as linhas em que `Assistente` corresponde ao seu nome, inclusive combinações como `ADRIANA/DRIKA`.
- Supervisor, administrador e superadmin podem receber a carteira completa.
- A API `/api/sheets` aplica esse escopo no servidor antes de devolver os processos ao navegador.

Essa separação evita o erro em que um usuário visualiza somente a única linha que possui `CreatedBy` preenchido.

## Referências de interface CRM

A interface usa como referência de interação os padrões de CRM observados em **EspoCRM** (menu lateral/minimização, navegação por módulos e dashboard modular) e **IDURAR ERP/CRM** (sidebar persistente, rotas selecionadas, cards-resumo e tabelas recentes com ações contextuais). A implementação do LexisPredict continua própria e focada em carteira jurídica, tarefas, DataJud e DJEN.

