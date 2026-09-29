# Apps Script unificado — LexisPredict Offline

O projeto da planilha tinha quatro arquivos com **entrypoints duplicados**. Em Apps Script todos os arquivos `.gs` compartilham o mesmo namespace global, portanto mais de um `doGet`, `doPost` ou `onOpen` faz um módulo substituir/competir com o outro.

Isso explica o erro **token invalido**: o Vercel podia chamar um `doPost` diferente daquele que você achava estar publicado.

## Estrutura correta

### 1. `Code.gs` — scanner DataJud + DJEN V6

Troque somente:

```js
function onOpen() {
```

por:

```js
function scannerOnOpen_(e) {
```

Não altere o `onEdit` do scanner.

### 2. `LEXIS-SYNC-AppsScript.gs` — adaptador CRM/Sheets

Troque:

```js
function onOpen() {
```

por:

```js
function syncOnOpen_(e) {
```

Troque:

```js
function doGet(e) {
```

por:

```js
function syncDoGet_(e) {
```

Troque:

```js
function doPost(e) {
```

por:

```js
function syncDoPost_(e) {
```

Mantenha `getToken_()` e `validToken_()`. Este é o módulo que valida o token fixo.

### 3. `LexisApp.gs` — UI antiga dentro da planilha

Troque:

```js
function doGet() {
```

por:

```js
function legacyHtmlDoGet_() {
```

O web app principal agora é o Vercel; esta função fica somente para compatibilidade da UI interna.

### 4. `LexisSheet.gs`

Substitua TODO o conteúdo por `LexisSheetsBridge.gs` deste diretório. Ele é o router único.

Depois da alteração, deve existir **somente um** `doGet`, **somente um** `doPost` e **somente um** `onOpen` em todo o projeto: os três no router.

## Token fixo

O token não deve aparecer no frontend.

### Apps Script

Configurações do projeto → Propriedades do script:

```
LEXIS_SHEETS_TOKEN=<mesmo segredo da Vercel>
```

### Vercel

Project → Settings → Environment Variables:

```
LEXIS_SHEETS_TOKEN=<mesmo segredo do Apps Script>
```

Marque Production, Preview e Development.

O fluxo passa a ser:

```
browser
  -> /api/sheets (Vercel)
      -> injeta process.env.LEXIS_SHEETS_TOKEN
          -> Apps Script /exec
              -> validToken_()
                  -> login/list/get/write
```

O token nunca fica no HTML, JavaScript do navegador ou localStorage.

## Depois de salvar no Apps Script

1. Execute `LEXIS_DIAGNOSTICO_ENTRYPOINTS`.
2. O retorno esperado é:
   - `scannerMenu: true`
   - `syncGet: true`
   - `syncPost: true`
   - `tokenConfigured: true`
3. Implantar → Gerenciar implantações.
4. Edite a implantação atual.
5. Selecione **Nova versão**.
6. Execute como **Eu**.
7. Acesso conforme a política da empresa.
8. Salve e mantenha a URL terminada em `/exec`.
9. Faça redeploy do Vercel depois de alterar a env.

## Importante

Não mantenha o antigo `LexisSheet.gs` v1.1.0 com outro `doGet/doPost`. Ele era um segundo bridge e conflita com o adaptador `LEXIS-SYNC-AppsScript.gs`.

O scanner V6 continua independente e não perde DataJud/DJEN por causa desta mudança.
