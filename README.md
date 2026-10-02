<div align="center">

<img src="docs/assets/sheetspredict-logo.svg" alt="SheetsPredict" width="760" />

<br />

**Cockpit operacional jurídico conectado ao Google Sheets, com IA autenticada, DataJud/DJEN, CRM operacional e WhatsApp.**

<br />

[![CI](https://github.com/W2CAPITAL/SheetsPredict/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/W2CAPITAL/SheetsPredict/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-0F766E)
![Mobile](https://img.shields.io/badge/mobile-touch--first-059669)
![PredictLM](https://img.shields.io/badge/PredictLM-authenticated_API-0B1F33)
![DataJud](https://img.shields.io/badge/DataJud%20%2B%20DJEN-integrated-1677D2)

<br />

[**Visão geral**](#visão-geral) ·
[**Arquitetura**](#arquitetura) ·
[**Central Integrada**](#central-integrada) ·
[**IA**](#ia-no-sheetspredict) ·
[**Mobile**](#interface-responsiva) ·
[**Segurança**](#segurança) ·
[**Licença**](#licença)

</div>

---

**Versão atual: 4.5.0**

SheetsPredict mantém o **Google Sheets como fonte operacional de verdade**, usa IndexedDB como réplica local/offline e concentra integrações externas atrás de funções server-side. O navegador não precisa conhecer chaves de PredictLM, LexisPredict, WA.Auto ou provedores de IA.

## Mapa cerebral da arquitetura

<p align="center">
  <img src="docs/sheetspredict-brain-map.svg" alt="SheetsPredict SaaS brain architecture map" width="100%" />
</p>

O mapa acima representa o SheetsPredict como um cérebro operacional: **córtex de operação**, estado/router, memória em Google Sheets + Apps Script + IndexedDB, inteligência PredictLM ou BYO-AI server-side, rede judicial DataJud/DJEN, comunicação WA.Auto e um córtex de verificação.

O **Graphify Brain** complementa esse desenho com um grafo consultável do código. Antes de refactors que atravessam vários módulos, a skill pode usar `query`, `path` e `explain` para localizar dependências, distinguindo relações `EXTRACTED` das `INFERRED`. Código real e testes continuam sendo a fonte final de verificação.

- Skill: [`skills/graphify-brain/SKILL.md`](skills/graphify-brain/SKILL.md)
- Mapa: [`docs/sheetspredict-brain-map.svg`](docs/sheetspredict-brain-map.svg)
- Referência: `Graphify-Labs/graphify`

## Visão geral

O aplicativo reúne em uma única interface:

- Dashboard de carteira, KPIs, retornos, qualidade e produtividade.
- **Processos** da carteira atribuída ao usuário.
- **Processos da empresa** com visão autorizada da carteira completa.
- Clientes 360°, Pipeline CRM, Agenda, Financeiro, Tarefas, Análise e Report.
- DataJud + DJEN, Audit 3D e histórico do tribunal.
- Cache IndexedDB, outbox e funcionamento offline-first.
- Central Integrada com PredictLM, GREY, WA.Auto, SyncCRM, LEADCHECKIN, Leadcheck e regras do LexisPredict.
- **Predict Studio** com Chat, Legal, Build, Work, Tutor, Research, Imagine e Report, mais catálogo completo de skills/agentes/plugins e Runtime Federation local opt-in.
- **WA.Auto nativo** com a interface operacional do WA.Auto adaptada aos temas do SheetsPredict, sessão WhatsApp cloud e automação DataJud/DJEN baseada no último retorno.
- Configurações com temas claros, escuros, jurídicos e de alto contraste.
- Interface responsiva otimizada para desktop, notebook, tablet e celular, preservando tabelas largas e operação densa sem quebrar a navegação.
- Integrações remotas protegidas por sessão do SheetsPredict e credenciais privadas mantidas no servidor.

A regra operacional central continua sendo:

```text
Assistente = dono/carteira
AtendidoPor = quem efetivamente atendeu
Editar != atender
Atender != transferir carteira
```

## Arquitetura

```text
Google Sheets principal
  ├─ Processos
  ├─ __LEXIS_INDEX
  ├─ __LEXIS_PROCESS_SHARDS
  ├─ Clientes
  ├─ Interacoes
  ├─ PipelineCRM
  ├─ AgendaCRM
  ├─ TarefasCRM
  ├─ DocumentosCRM
  ├─ Honorarios
  ├─ Movimentações_DataJud
  └─ Publicações_DJEN
          │
          ├── Processos (partição 2)
          ├── Processos (partição 3)
          └── ... criadas automaticamente quando necessário
          ↕
Apps Script privado · bridge 8.3
          ↕
Vercel Functions
  ├─ /api/sheets
  ├─ /api/datajud
  ├─ /api/djen
  ├─ /api/judicial-scan
  └─ /api/integration-hub
          ↕
SheetsPredict
          ↕
IndexedDB por gerações + outbox + PWA
```

O Google Sheets continua sendo a persistência operacional. Não há banco SQL, Firebase ou Supabase obrigatório. O IndexedDB funciona como réplica local e fila durável; cada sincronização monta uma nova geração do cache em blocos e só troca a geração ativa depois que ela está completa.

### Escala sem banco pago

A versão 4.3 adiciona particionamento automático da carteira de **Processos**:

- a planilha principal continua sendo o ponto de controle;
- `__LEXIS_INDEX` mantém CNJ → planilha/aba/linha para busca e gravação diretas;
- `__LEXIS_PROCESS_SHARDS` registra as partições existentes;
- quando a partição ativa atinge o limite conservador calculado por células/linhas, o Apps Script cria outra planilha de Processos no Drive do proprietário do bridge;
- leitura, pesquisa por CNJ, atendimento e edição continuam aparecendo como uma única carteira no SheetsPredict;
- as abas de CRM permanecem na planilha principal, enquanto a tabela de maior volume pode crescer horizontalmente em várias planilhas.

O limite padrão por partição é propositalmente conservador e pode ser ajustado pela Script Property `LEXIS_SHARD_TARGET_CELLS`. Isso evita depender de um plano de banco pago, mas **não transforma serviços do Google em recursos literalmente ilimitados**: cotas de Apps Script, Drive e da conta Google continuam existindo.

### Edições instantâneas

A versão 4.4 torna edição de processo, observação e atendimento **local-first**. A interface atualiza assim que a pequena outbox do navegador confirma a gravação local; o envio ao Google Sheets acontece depois, em segundo plano. Essas ações deixam de regravar a carteira inteira no IndexedDB.

O status de retorno também passa a ser derivado primeiro de **Próximo Retorno**: data passada = `VENCIDO`, hoje = `ATENÇÃO`, data futura = `NO PRAZO`. Isso evita exibir um texto antigo da planilha enquanto a nova data ainda está sincronizando.

### PCs fracos e qualquer navegador

O navegador detecta aproximadamente memória, número de núcleos e modo de economia de dados. Em dispositivos mais fracos, o app reduz automaticamente o número de registros renderizados por página, o tamanho das páginas de sincronização e o tamanho dos blocos gravados no IndexedDB. Em máquinas mais fortes, mantém os valores maiores.

Não há instalação de banco local nem processo pesado em segundo plano. Em um computador novo, o usuário abre o SheetsPredict, autentica-se e recebe a carteira da nuvem; o IndexedDB daquele navegador passa a servir apenas como cache/offline.

## Navegação e grandes listas

As telas de Processos, Processos da empresa, Clientes e Tarefas usam paginação adaptativa: **60 registros em dispositivos muito limitados, 100 em dispositivos modestos e 200 no perfil normal**. A busca é aplicada antes da paginação e permite localizar cliente, CNJ, advogado, assistente e outros campos relevantes.

Para listas largas:

- existe **uma única rolagem vertical principal**, na área de conteúdo;
- tabelas não mantêm uma segunda rolagem vertical interna;
- existe **uma única barra horizontal fixa** no rodapé quando a tabela ultrapassa a largura disponível;
- a barra horizontal é sincronizada proporcionalmente com o intervalo real de rolagem da tabela;
- a barra horizontal nativa da tabela é ocultada enquanto a barra fixa está assumindo o controle;
- o menu lateral continua rolável em telas baixas, mas sua barra visual fica oculta.

Isso permite trabalhar em zoom de navegador de 100% sem precisar descer até o fim da tabela para encontrar o scroll horizontal.

## Rotas

| Rota | Tela |
|---|---|
| `/` | Dashboard |
| `/central` | Central Integrada |
| `/studio` | Predict Studio |
| `/wa-auto` | WA.Auto integrado |
| `/cases` | Processos da carteira |
| `/processos` | Processos da empresa |
| `/clientes` | Clientes |
| `/pipeline` | Pipeline CRM |
| `/agenda` | Agenda |
| `/financeiro` | Financeiro |
| `/tarefas` | Tarefas |
| `/analise` | Análise |
| `/report` | Report |
| `/scanner` | DataJud + DJEN |
| `/configuracoes` | Configurações e temas |

A navegação interna usa hash routing para resiliência, e o `vercel.json` mantém fallback SPA global para evitar 404 em F5/deep-link.

## CRM no Google Sheets

O CRM permanece distribuído em abas relacionadas por IDs:

| Aba | Função |
|---|---|
| `Clientes` | cadastro 360° |
| `Processos` | carteira jurídica |
| `Interacoes` | registros de contato |
| `PipelineCRM` | funil |
| `AgendaCRM` | compromissos |
| `TarefasCRM` | tarefas manuais |
| `DocumentosCRM` | metadados de documentos |
| `Honorarios` | financeiro/honorários |
| `AuditoriaLogsApp` | trilha de alterações |

Editar ou registrar atendimento não transfere a carteira. O campo `Assistente` permanece como dono; `AtendidoPor` registra quem realizou o atendimento.

## DataJud + DJEN

O módulo judicial inclui:

- consulta DataJud por CNJ;
- normalização e deduplicação de movimentos;
- detecção operacional de encerramento, mérito, cumprimento e novidade;
- DJEN por CNJ e filtros de data;
- persistência do histórico em `Movimentações_DataJud` e `Publicações_DJEN`;
- histórico do tribunal combinando cache persistido + consulta atual;
- atualização do resumo na aba `Processos`.

Endpoint DJEN padrão no backend:

```text
https://comunicaapi.pje.jus.br/api/v1/comunicacao
```

Pode ser alterado por `DJEN_UPSTREAM` para manutenção controlada.

O sistema **não tenta contornar 429/403**. Quando o DJEN está limitado ou bloqueado, o último dado válido é preservado e o DataJud continua funcionando quando disponível.

Configure `DATAJUD_API_KEY` na Vercel. Nenhuma chave deve ser versionada.

## Central Integrada

A rota `/central` unifica oito motores/fontes:

| Motor | Repositório | Papel |
|---|---|---|
| PredictLM | `W2CAPITAL/PredictLm` | IA principal, análise e dossiês |
| WA.Auto | `W2CAPITAL/Wa.Auto` | WhatsApp, fila e monitor |
| LexisPredict | `W2CAPITAL/LexisPredict` | regras jurídicas e KPIs |
| SyncCRM | `W1CAPITAL/SyncCRM` | auditoria e mapeamento de planilha |
| LEADCHECKIN | `W2CAPITAL/LEADCHECKIN` | scanner e descoberta pública |
| OFFLINE-LEXISPREDICT | `W1CAPITAL/OFFLINE-LEXISPREDICT` | continuidade offline |
| Leadcheck | `W1CAPITAL/Leadcheck` | Bacen e triagem revisional |
| GREY | `W1CAPITAL/GREY` | IA privada/self-hosted e fallback |

Abas da Central:

```text
Visão geral | IA | WhatsApp | Leads | Revisional | Planilha | Integrações
```

Funcionalidades embutidas, como auditoria da planilha, Bacen/revisional, scanner público e núcleo offline, continuam funcionando sem os serviços remotos.

### APIs de serviço

PredictLM e LexisPredict entram no SheetsPredict por **credenciais de serviço independentes**. Nenhuma integração reutiliza senha de usuário ou credencial de proprietário.

```text
SheetsPredict server
  ├─ PredictLM API → Chat / Legal / Build / Research / Imagine / Report / skills / agentes
  └─ LexisPredict API → inteligência jurídica e DataJud em superfície de serviço limitada
```

O LexisPredict expõe ao SheetsPredict somente uma superfície de integração delimitada; dados multi-tenant do CRM não são liberados por essa chave genérica.

### Estado das integrações

A Central não trata toda integração ausente como erro. Os cards distinguem:

| Estado | Significado |
|---|---|
| **ativo** | integração configurada e respondendo |
| **ativo · autenticação não confirmada pelo diagnóstico** | o serviço responde normalmente, mas o endpoint de health não consegue confirmar a credencial; o painel não trata isso como falha sem um 401/403 real |
| **indisponível** | integração configurada, mas sem resposta válida naquele momento |
| **requer API** | integração obrigatória sem credencial local |
| **opcional** | integração não habilitada neste deploy e não necessária ao núcleo do SheetsPredict |

Esse modelo evita exibir “não configurado” como se fosse falha do aplicativo.

Configuração de integrações:

O repositório mantém apenas nomes de configuração e exemplos vazios em [`.env.example`](.env.example). Credenciais, endereços privados e dados reais de implantação pertencem ao ambiente do servidor e não ao código-fonte.

Para IA, o caminho recomendado é PredictLM com chave de API dedicada. Forks também podem usar uma API própria compatível com o contrato OpenAI sem expor a chave ao navegador.

O envio avulso continua exigindo ação explícita. A automação processual só envia depois que o usuário habilita o interruptor no módulo WA.Auto e continua sujeita às regras de fila/opt-out do WA.Auto.

## WA.Auto integrado

A rota `/wa-auto` incorpora a operação do repositório `W2CAPITAL/Wa.Auto` ao SheetsPredict sem abrir um segundo cliente WhatsApp.

A interface reproduz a hierarquia operacional do WA.Auto:

```text
Campanhas · WhatsApp · Clientes · Histórico · Processos · Configurações
```

Ela usa os tokens de tema do SheetsPredict, portanto Dark, Midnight, Graphite, Vinho Jurídico, Alto Contraste e os demais temas continuam aplicados. A navegação interna é horizontal para evitar uma segunda sidebar.

### Sessão WhatsApp

O SheetsPredict usa `WA_AUTO_URL` como backend. QR Code, pareamento, sessão Baileys, lista de não contatar, fila, ACKs e recuperação permanecem no WA.Auto.

```text
SheetsPredict /#/wa-auto
       ↓
/api/wa-auto
       ↓ HTTPS
WA.Auto Cloud
       ├─ sessão WhatsApp
       ├─ fila segura
       ├─ opt-out
       └─ monitor DataJud + DJEN
```

O navegador nunca recebe o CSRF interno do WA.Auto. O proxy server-side obtém o token de bootstrap e só permite uma lista fixa de ações.

### Automação de atualização processual

A automação é **desligada por padrão**. Ao ativá-la na interface:

1. o SheetsPredict sincroniza primeiro toda a carteira em lotes de **200**;
2. cada processo envia CNJ, cliente, telefone, último/próximo retorno, último DataJud salvo e último DJEN salvo;
3. clientes marcados como opt-out/NÃO CONTATAR são sincronizados como bloqueio;
4. somente depois dessa sincronização o WA.Auto libera `notify_whatsapp`;
5. o WA.Auto continua consultando **seu próprio DataJud + DJEN**;
6. somente eventos posteriores ao limite `max(Último Retorno, Último Aviso)` entram na fila;
7. eventos antigos viram linha de base ou `covered_by_return`;
8. se o WhatsApp estiver desconectado, a novidade fica aguardando em vez de ser perdida;
9. após envio confirmado, o WA.Auto atualiza seu limite de retorno para impedir repetição.

Formato-base do aviso:

```text
📌 ATUALIZAÇÃO PROCESSUAL

Cliente: <cliente>
Processo: <CNJ>
Fonte: DataJud ou DJEN
Nova movimentação: <evento>
Detalhe: <quando houver>
Data/Hora: <data>

Mensagem automática de acompanhamento.
Responda SAIR se não quiser receber novos avisos.
```

Quando várias novidades do mesmo processo estão pendentes, o WA.Auto envia um digest único em vez de uma mensagem por evento.

### Último retorno sincronizado

Registrar atendimento no SheetsPredict também sincroniza imediatamente aquele processo com o WA.Auto. Isso evita que uma movimentação anterior ao contato humano seja enviada depois como se fosse novidade.

A sincronização completa também roda em segundo plano depois da atualização do Google Sheets quando a automação estiver habilitada, com throttle para não reenviar milhares de registros desnecessariamente.

### Segurança operacional

- ativar é uma ação explícita do usuário;
- opt-out/NÃO CONTATAR sempre bloqueia o envio;
- falha ambígua durante o envio vira `uncertain` e não é reenviada automaticamente;
- nenhum evento é inventado quando DataJud/DJEN falha;
- o DJEN usado para a automação é o runtime do WA.Auto;
- uma campanha comum ativa continua tendo precedência sobre alertas jurídicos;
- o primeiro scan não dispara histórico antigo.

## IA no SheetsPredict

O **Chat AI** integrado usa um proxy server-side. O navegador conversa apenas com o SheetsPredict; credenciais de provedores não são entregues ao cliente.

O runtime preferencial é o PredictLM autenticado por uma **chave de API dedicada ao SheetsPredict**. O token de proprietário do PredictLM não é usado como fallback para chamadas de integração.

Como o SheetsPredict é open source, cada deploy também pode usar sua própria API OpenAI-compatible através do contrato BYO-AI documentado em [`.env.example`](.env.example). AshnaAI permanece como adapter opcional quando configurado.

```text
Browser
  -> sessão SheetsPredict
  -> proxy server-side
     -> PredictLM com API key dedicada
        ou
     -> IA própria OpenAI-compatible
```

Recursos que dependem do runtime completo — como Legal, Build, Research, Imagine e Report — continuam usando o PredictLM quando essa integração está habilitada.

## Predict Studio

A rota `/studio` traz a camada de execução do PredictLM para dentro do SheetsPredict sem incorporar o Next.js inteiro nem acoplar o CRM ao runtime de IA.

### Superfícies

| Superfície | Execução |
|---|---|
| **Chat** | `PredictLM /api/chat` com contexto opcional da carteira |
| **Legal** | `/api/legal/process` + geração de dossiê HTML |
| **Build** | `/api/agent`: explorer → architect → implementer → reviewers → verifier |
| **Work** | Chat com contrato de continuidade, critérios de conclusão e bloqueios |
| **Tutor** | Chat com ciclo probe → teach/practice → assess → review |
| **Research** | `/api/research` com árvore de pesquisa, fontes e cobertura |
| **Imagine** | `/api/media/generate` com reference/identity grounding |
| **Report** | `/api/report-dossier/generate` com FORGE + AEGIS + PARALLAX + Chair/Council |

O proxy `/api/predict-studio` mantém o runtime remoto atrás da camada server-side do SheetsPredict. A integração com PredictLM usa a credencial de API mantida no ambiente do servidor; o navegador não recebe essa credencial.

### Skill & Agent Federation

Quando o PredictLM está conectado, o SheetsPredict consulta pela **API autenticada** o catálogo atual de skills e papéis do Agent Fabric. O snapshot local permanece somente como fallback para operação offline ou indisponibilidade temporária do runtime remoto.

A integração atual cobre:

- **81 skills/capabilities do PredictLM**;
- **16 papéis de agentes**: Explorer, Architect, Implementer, Researcher, Reviewer, Test Analyst, Security Reviewer, Visual Director, Identity Reviewer, Game Producer, Game Designer, Game Technical Director, Game Art Director, Gameplay Specialist, Playtest Reviewer e Verifier;
- **4 controladores Four-Core**: Fly, Mouse, Macaque e Human;
- Provider Mesh e runtimes federados;
- Capability Fusion e catálogo de adapters/plugins.

A presença de uma capability no catálogo **não significa que um serviço externo esteja configurado**. O runtime autenticado informa o catálogo; credenciais continuam exclusivamente no servidor.

### PredictLM Learning Pack

O SheetsPredict incorpora o aprendizado consolidado do PredictLM em duas camadas:

- snapshot local com **146 lições técnicas versionadas + 3 lições operacionais promovidas**;
- sincronização autenticada com o PredictLM para receber uma versão mais nova do pacote quando o runtime estiver disponível.

As lições são recuperadas por relevância e entram tanto no Chat AI server-side quanto nos runtimes locais/WebLLM. Feedback bruto, credenciais e dados pessoais não fazem parte do pacote portátil.


O fallback auditável é derivado de:

```text
W2CAPITAL/PredictLm
├─ src/lib/skills.ts
├─ src/lib/agent-runtime/agentic-fabric.ts
├─ src/lib/fusion/capability-fabric.ts
└─ skills/predictlm-master/manifest.json
```

### Runtime Federation local

Motores locais são explicitamente opt-in. O SheetsPredict não faz port scanning.

**WebLLM / WebGPU**

- Lite: Qwen3 1.7B;
- Smart: Qwen3.5 4B;
- Power: Qwen3.5 9B;
- seleção Auto usa apenas hints de hardware e o carregamento real faz self-test;
- nenhum modelo é baixado até o usuário clicar em **Carregar**;
- modelos grandes podem consumir vários GB e podem ser descarregados pela interface.

**Runtime local manual**

- FreeLLMAPI / API OpenAI-compatible;
- Ollama;
- llama.cpp/llamafile e outros servidores compatíveis através do adapter;
- URL manual em loopback ou HTTPS;
- sem descoberta automática de portas;
- credencial local não passa pelo backend do SheetsPredict.

Transformers.js/ONNX permanece no catálogo de compatibilidade do PredictLM; o runtime direto do SheetsPredict prioriza WebLLM ou um endpoint local explicitamente configurado para não duplicar vários modelos grandes na memória do navegador.

### Isolamento de falhas

O Predict Studio é um módulo separado do `app.js` e não participa da inicialização de Processos, Clientes, Tarefas ou DataJud/DJEN.

```text
app.js
  └─ delega /studio

lib/predict-studio.js
  ├─ UI e estado do Studio
  ├─ Chat / Work / Tutor
  ├─ Legal / Build / Research / Imagine / Report
  └─ catálogo Skills / Agentes / Plugins / Motores

lib/predict-runtime.js
  ├─ WebLLM opt-in
  └─ runtime local manual

api/predict-studio.js
  └─ proxy server-side com allowlist para PredictLM
```

Se `PREDICTLM_URL` não estiver configurada, o restante do SheetsPredict continua operando. A interface deixa claro que as superfícies remotas estão indisponíveis; Skills/Agentes/Plugins e os runtimes locais opt-in continuam acessíveis.

## Interface responsiva

A camada visual foi revisada sem trocar o modelo de dados nem as rotas existentes. O objetivo é reduzir a aparência de planilha e aproximar o produto de um SaaS operacional maduro:

- desktop largo aproveita melhor a largura útil para KPIs, cards e operação simultânea;
- em telas menores, grids e painéis colapsam para uma coluna sem perder contexto;
- no celular, a navegação principal vira barra inferior compacta e rolável;
- Central Integrada e Chat AI ajustam altura, composição e ações para viewport móvel;
- diálogos e formulários ocupam a largura disponível sem ultrapassar a tela;
- tabelas largas preservam rolagem horizontal controlada, sem criar rolagens verticais concorrentes;
- sidebar organizada por **Visão / Operação / Gestão / Sistema**;
- contexto de workspace visível, sem criar uma segunda sidebar;
- topbar mais enxuta e hierarquia tipográfica consistente;
- cards/KPIs com densidade uniforme e estados menos “decorativos”;
- tabelas, filtros, pipeline, agenda, diálogos e histórico usando os mesmos tokens;
- sombras, raios, espaçamento e foco padronizados;
- temas continuam usando `--surface`, `--ink`, `--line`, `--primary` e demais tokens, em vez de depender de fundos brancos fixos;
- listas largas preservam a paginação de 200 registros e o scroll global já existente.

A revisão é visual/estrutural: não altera as regras `Assistente = dono`, `AtendidoPor = quem atendeu`, nem a fonte de verdade no Google Sheets.

## Temas e acessibilidade

`Configurações → Tema do aplicativo` oferece:

- SheetsPredict
- Clean
- Dark
- Midnight
- Graphite
- Emerald
- Vinho Jurídico
- Executive Violet
- Imperial Gold
- Alto Contraste

A preferência fica salva no navegador. A camada de temas cobre tabelas, cards, Central Integrada, Tarefas, Pipeline, histórico, Audit 3D, formulários e diálogos.

Os testes verificam contraste mínimo de **4,5:1** nos principais pares de texto/fundo, links, botões e estados semânticos.

## Offline e sincronização

O navegador utiliza IndexedDB para:

- cache de processos e entidades CRM;
- sessão visual;
- outbox de alterações;
- continuidade durante indisponibilidade temporária.

O sync reconcilia gravações por processo. Registros confirmados saem do outbox; conflitos reais ficam preservados para nova tentativa sem travar o restante do lote.

## Apps Script

O projeto vinculado à planilha deve manter um único router:

```text
LexisSheet.gs
  ├─ onOpen()
  ├─ doGet()
  └─ doPost()

Code.gs
  └─ scanner DataJud/DJEN → scannerOnOpen_()

LEXIS-SYNC-AppsScript.gs
  ├─ syncOnOpen_()
  ├─ syncDoGet_()
  └─ syncDoPost_()

LexisApp.gs
  └─ UI interna legada
```

Ao atualizar o bridge, publique uma **nova versão da implantação existente** do Apps Script. Não duplique `doGet`, `doPost` ou `onOpen`.

## Segurança

O SheetsPredict separa navegador, sessão, bridge de planilha e integrações remotas. Credenciais de PredictLM, IA própria, WA.Auto e demais serviços permanecem no servidor.

O repositório público não deve conter tokens, endereços privados de implantação, dados reais de clientes nem documentação detalhada de vulnerabilidades. Relatos de segurança devem seguir o fluxo privado descrito em [`SECURITY.md`](SECURITY.md).

A política pública documenta apenas o modelo de confiança necessário para operar e integrar o projeto, sem transformar o README em um mapa de ataque.

## Desenvolvimento e testes

Frontend sem framework de build:

```bash
npm test
npx serve .
```

O pipeline valida, entre outros pontos:

- sintaxe das Vercel Functions e bibliotecas;
- regras DataJud/DJEN;
- histórico judicial;
- escopo de carteira;
- prioridade de tarefas;
- CRM;
- deep-links/F5;
- Central Integrada;
- Predict Studio com oito superfícies do PredictLM;
- WA.Auto integrado com sessão cloud, clientes da carteira e automação DataJud/DJEN opt-in;
- Skill Federation com catálogo auditável de skills/agentes/plugins;
- Runtime Federation local opt-in;
- temas e contraste;
- comportamento de navegação/scroll.

## Deploy

A publicação principal é feita pela Vercel a partir da branch `main`.

Arquivos estáticos usam PWA/service worker; `/api/*` são Vercel Functions. O service worker não deve interceptar navegações de documentos.

Após uma alteração grande de frontend, um `Ctrl+Shift+R` pode ser usado uma vez para forçar o navegador a buscar a versão mais recente do shell.

## Estado atual

**SheetsPredict 4.2.0**

Foco da versão:
- autenticação reforçada entre navegador, SheetsPredict e serviços externos;
- PredictLM consumido somente por API key dedicada;
- Chat AI com suporte a PredictLM ou BYO-AI server-side;
- Central Integrada com estados `ativo`, `indisponível`, `requer API` e `opcional`;
- UI responsiva revisada para PC e celular;
- shell SaaS empresarial com navegação agrupada e design tokens consistentes;
- Graphify Brain + mapas cerebrais versionados;
- Central Integrada;
- identidade SheetsPredict;
- paginação de 200 registros;
- busca nas grandes listas;
- histórico DataJud/DJEN persistente;
- sincronização resiliente;
- temas com contraste validado;
- uma única rolagem vertical de conteúdo;
- uma única barra horizontal útil para tabelas largas;
- correções de F5/deep-link/PWA;
- isolamento da camada de IA para preservar o núcleo operacional em falhas de provider.

## Licença

SheetsPredict é open source sob a licença [MIT](LICENSE). Integrações, APIs, datasets e componentes de terceiros permanecem sujeitos aos respectivos termos.

## BPMN 2.0 — fluxos jurídicos e operacionais

A versão 4.5 integra modelagem BPMN 2.0 adaptada de `architawr/claude-bpmn-skill` (MIT). A skill é roteada automaticamente quando a Central Integrada ou o Predict Studio recebe pedidos sobre BPMN, Camunda, swimlanes, gateways, As-Is/To-Be ou modelagem de processos.

Ela pode ser usada para documentar fluxos como DataJud/DJEN → triagem → tarefa → atendimento, publicação → prazo → responsável, revisão documental, retorno de cliente e outros processos internos.

Tooling determinístico versionado em `skills/bpmn`:

```bash
npm install --prefix skills/bpmn
node skills/bpmn/scripts/bpmn-tool.mjs summarize processo.bpmn
node skills/bpmn/scripts/bpmn-tool.mjs layout entrada.bpmn saida.bpmn
node skills/bpmn/scripts/bpmn-tool.mjs validate processo.bpmn
node skills/bpmn/scripts/bpmn-tool.mjs lint processo.bpmn
node skills/bpmn/scripts/bpmn-tool.mjs diff as-is.bpmn to-be.bpmn
node skills/bpmn/scripts/bpmn-tool.mjs find processo.bpmn "prazo"
```

O layout existente é preservado por padrão. `--rebuild` só deve ser usado quando a reconstrução total do diagrama for desejada. A licença original está em `skills/bpmn/THIRD_PARTY_LICENSE.md`.
