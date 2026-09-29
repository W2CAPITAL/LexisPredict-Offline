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

## Status

**v1.4.0 — autenticação server-side, sincronização Sheets e núcleo DataJud + DJEN integrado.** A planilha continua sendo a fonte operacional e o navegador mantém uma réplica offline para continuidade.


## DJEN — fonte oficial

A consulta pública usa o endpoint documentado no Swagger oficial do DJEN:

`https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao`

O GET público não exige login, mas possui controle de taxa por IP. O app e o proxy **não tentam contornar 429/403**: preservam o último dado válido e aguardam a janela indicada pelo CNJ antes de retomar. O upstream pode ser trocado por variável `DJEN_UPSTREAM` apenas para manutenção controlada.

## Deploy rápido na Vercel

Depois de conectar este repositório à Vercel, o deploy é automático a cada push na `main`. Não há build de frontend; `index.html` e assets são estáticos e `/api/*` são Vercel Functions.

[Importar este repositório na Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FW2CAPITAL%2FLexisPredict-Offline)
