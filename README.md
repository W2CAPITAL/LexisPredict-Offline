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

1. Abra a planilha.
2. Extensões → Apps Script.
3. Siga [apps-script/ROUTER-INSTALACAO.md](apps-script/ROUTER-INSTALACAO.md) para deixar apenas um `doGet`, um `doPost` e um `onOpen` no projeto.
4. Em **Configurações do projeto → Propriedades do script**, crie `LEXIS_SHEETS_TOKEN`.
5. Na Vercel, crie a Environment Variable `LEXIS_SHEETS_TOKEN` com exatamente o mesmo valor.
6. Implantar → Gerenciar implantações → Nova versão do Aplicativo da web.
7. Copie a URL terminada em `/exec`.
8. No LexisPredict Offline → **Configurações → Google Sheets**, informe somente a URL `/exec` e a URL da planilha. O token fica fixo no backend da Vercel.

O bridge preserva colunas não alteradas ao editar um processo.

## Corrigir o DJEN da planilha V6

Depois do deploy na Vercel, coloque a URL base do site na configuração:

`Config → DJEN proxy URL (opcional)`

Exemplo:

`https://lexispredict-offline.vercel.app`

O scanner V6 já concatena `/api/v1/comunicacao`. Essa rota usa primeiro o endpoint de produção do DJEN e preserva o comportamento oficial de 429/403.

## Segurança

- O repositório não contém token do Apps Script.
- O token do bridge não é enviado ao navegador; fica nas Environment Variables da Vercel e nas Script Properties do Apps Script.
- `/api/sheets` aceita somente URLs HTTPS de Apps Script.
- Não versionar chaves privadas.
- A autenticação é validada pela aba `Usuarios` através do Apps Script.

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

**v1.2.0 — base funcional com router único do Apps Script e token server-side.** A planilha continua sendo a fonte operacional e o navegador mantém uma réplica offline para continuidade.


## DJEN — fonte oficial

A consulta pública usa o endpoint documentado no Swagger oficial do DJEN:

`https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao`

O GET público não exige login, mas possui controle de taxa por IP. O app e o proxy **não tentam contornar 429/403**: preservam o último dado válido e aguardam a janela indicada pelo CNJ antes de retomar. O upstream pode ser trocado por variável `DJEN_UPSTREAM` apenas para manutenção controlada.

## Deploy rápido na Vercel

Depois de conectar este repositório à Vercel, o deploy é automático a cada push na `main`. Não há build de frontend; `index.html` e assets são estáticos e `/api/*` são Vercel Functions.

[Importar este repositório na Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FW2CAPITAL%2FLexisPredict-Offline)
