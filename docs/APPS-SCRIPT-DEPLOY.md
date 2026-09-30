# Publicar a atualização do Apps Script do SheetsPredict

> **ATUALIZAÇÃO DO APPS SCRIPT NECESSÁRIA — versão 8.1**
>
> No seu projeto atual, substitua **somente o conteúdo de `LEXIS-SYNC-AppsScript.gs`** pelo conteúdo completo de `installer-script.txt`.
> Não cole o installer em `Code.gs`, `LexisApp.gs`, `LexisSheet.gs` ou `LexisIndex.html`.
>
> Arquivo: https://github.com/W2CAPITAL/SheetsPredict/blob/main/installer-script.txt
>
> RAW para copiar: https://raw.githubusercontent.com/W2CAPITAL/SheetsPredict/main/installer-script.txt

O SheetsPredict usa um Web App do Google Apps Script como bridge privado entre a Vercel e a planilha. Atualizar o arquivo de código não atualiza automaticamente a implantação `/exec`.

## Atualizar sem trocar a URL

1. Abra a planilha oficial do SheetsPredict.
2. Vá em **Extensões → Apps Script**.
3. No projeto vinculado à planilha, atualize o arquivo do bridge com **installer-script.txt**, disponível neste repositório e na página `/installer` do app. Preserve os outros arquivos, configurações e gatilhos do scanner. Deve existir apenas uma função pública `doPost` e uma `doGet`: se houver um roteador próprio, mantenha-o delegando as ações do bridge para `syncDoPost_` e `syncDoGet_`.
4. Confirme em **Configurações do projeto → Propriedades do script** que existe `LEXIS_SHEETS_TOKEN`. Não publique esse valor no GitHub nem no navegador.
5. Clique em **Implantar → Gerenciar implantações**.
6. Abra a implantação existente do tipo **App da Web** e clique em **Editar**.
7. Em **Versão**, escolha **Nova versão**.
8. Mantenha **Executar como: você/proprietário do script**.
9. Mantenha o mesmo nível de acesso usado pela implantação atual. Para o backend da Vercel conseguir chamar o Web App sem sessão Google interativa, a implantação precisa permitir o acesso compatível com a configuração atual; a autenticação do bridge continua sendo protegida pelo token e pela sessão do app.
10. Clique em **Implantar**.

Ao editar a implantação existente, a URL terminada em `/exec` permanece a mesma. Assim a variável `LEXIS_APPS_SCRIPT_URL` da Vercel não precisa ser alterada.

## Automação de novos processos

A versão atual do `installer-script.txt` também instala dois gatilhos na aba **Processos**:

- edição do campo **Protocolo/CNJ**: marca o registro como `PENDENTE`, define a próxima sincronização e aplica os valores operacionais mínimos;
- inserção/alteração estrutural de linhas: procura processos válidos ainda sem sincronização e os coloca na fila.

O lote DJEN passa a priorizar registros pendentes. Quando o SheetsPredict estiver aberto e autenticado, a sincronização da carteira identifica CNJs novos e executa automaticamente a consulta **DataJud + DJEN**, gravando tanto os campos visíveis quanto os campos legados e as abas de histórico.

Para criar/confirmar esses gatilhos, após colar a nova versão do script execute uma vez **Léxis → Garantir abas e cabeçalhos** ou a função `ensureSheetsUI`.

## O que mudou na versão 8.1

- `list_compact`: a carteira deixa de enviar milhares de objetos com os mesmos nomes de colunas repetidos;
- `readRowsCompact_`: a aba **Processos** é lida em páginas de até 600–800 linhas;
- `list`, `get` e `upsert_batch` passam a exigir sessão válida no próprio Apps Script;
- o navegador abre imediatamente usando o cache e carrega a planilha em páginas em segundo plano;
- a sessão autenticada passa a ser assinada no backend da Vercel, eliminando uma consulta extra ao Apps Script em praticamente toda chamada.

Essas alterações atacam diretamente o erro **“Tempo esgotado ao acessar o Google Apps Script”**.

## Multiusuário

A versão 8.1 também reduz contenção quando várias pessoas usam o SheetsPredict ao mesmo tempo. A sessão do Apps Script deixa de ser regravada em `Script Properties` a cada página da carteira; ela só é prorrogada quando estiver próxima de expirar. O cliente também distribui as sincronizações automáticas em janelas diferentes por usuário/navegador para evitar que todos atinjam o Apps Script no mesmo segundo.

Se o SheetsPredict detectar que a implantação publicada ainda não conhece `list_compact`, ele **não volta mais para a leitura pesada antiga**. Em vez disso, mostra explicitamente que o Apps Script precisa ser atualizado para a versão 8.1.

## Como validar

Depois da publicação:

1. Abra o SheetsPredict e faça login.
2. Clique em **Sincronizar**.
3. Abra **Clientes** e registre uma interação de teste.
4. Confirme que a nova linha apareceu na aba `Interacoes`.
5. Abra um processo e registre um atendimento.
6. Confirme que `AtendidoPor` e `Último Retorno` foram atualizados, enquanto `Assistente` permaneceu igual.
7. Confirme que `AuditoriaLogsApp` recebeu a alteração.
8. No scanner, consulte um processo e confira os eventos em `Movimentações_DataJud` e `Publicações_DJEN`. Repita a consulta: os mesmos eventos não devem gerar novas linhas.
9. Se aparecer o aviso de Apps Script antigo, a implantação `/exec` ainda não recebeu a nova versão. Os eventos permanecem na fila do navegador; depois da publicação, clique em **Sincronizar**.

As duas abas recebem apenas eventos efetivamente retornados. Resposta vazia, erro ou limite de requisições do DJEN não apaga o histórico existente nem cria uma publicação fictícia.

## Ações esperadas na versão CRM do bridge

A versão atual deve reconhecer, além das ações anteriores:

- `crm_list`
- `crm_write`
- `crm_seed_clients`

Se o app informar **“ação desconhecida: crm_list”**, a implantação `/exec` ainda está apontando para a versão antiga do Apps Script.

## Segurança

Não coloque `LEXIS_SHEETS_TOKEN`, senhas da aba `Usuarios`, URLs privadas ou chaves DataJud em arquivos versionados. O token deve existir somente em **Script Properties** e nas **Environment Variables** da Vercel.
