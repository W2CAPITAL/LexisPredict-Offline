# Apps Script unificado — LexisPredict Offline v1.3

Use exatamente estes quatro arquivos no MESMO projeto Apps Script vinculado à planilha:

- `Code.gs`
- `LEXIS-SYNC-AppsScript.gs`
- `LexisApp.gs`
- `LexisSheet.gs`

Eles já estão corrigidos neste diretório. Não é necessário renomear funções manualmente.

## Arquitetura

`Code.gs` contém o scanner DataJud/DJEN V6 e expõe `scannerOnOpen_`.

`LEXIS-SYNC-AppsScript.gs` contém autenticação, sessões, leitura/escrita da aba Processos, usuários e permissões. Expõe `syncOnOpen_`, `syncDoGet_` e `syncDoPost_`.

`LexisApp.gs` contém apenas o menu/atalho da planilha para abrir o LexisPredict Web.

`LexisSheet.gs` é o router ÚNICO. Só ele contém `onOpen`, `doGet` e `doPost`.

## Segurança e acesso

O browser nunca recebe `LEXIS_SHEETS_TOKEN`.

Vercel:

```
LEXIS_SHEETS_TOKEN=<segredo>
LEXIS_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
LEXIS_SHEET_URL=https://docs.google.com/spreadsheets/d/1qbuJee6DCv0bh9XGvnBDPltc0Ziphdn2yx11QKOnchc/edit
DJEN_UPSTREAM=https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao
```

Apps Script → Configurações do projeto → Propriedades do script:

```
LEXIS_SHEETS_TOKEN=<o mesmo segredo>
LEXIS_APP_URL=<URL final do projeto Vercel>
```

Para gerar um token forte automaticamente, execute `LEXIS_GERAR_TOKEN_ENV` em `LexisSheet.gs`.

## Assistentes compostos

O controle de carteira entende valores como:

```
KRIS / DRIKA
ADRIANA / DRIKA
DAVI ALVES FIGUEREDO / DRIKA
```

Os dois responsáveis conseguem visualizar o processo quando são assistentes. Supervisores, administradores e superadmins continuam vendo toda a carteira.

## Depois de colar

1. Salve o projeto.
2. Execute `LEXIS_DIAGNOSTICO_ENTRYPOINTS`.
3. Confirme:
   - scannerMenu: true
   - syncMenu: true
   - syncGet: true
   - syncPost: true
   - internalUiMenu: true
   - tokenConfigured: true
4. Implantar → Gerenciar implantações → Editar.
5. Escolha Nova versão.
6. Executar como: Eu.
7. Publique e copie a URL `/exec`.
8. Coloque essa URL em `LEXIS_APPS_SCRIPT_URL` na Vercel.
