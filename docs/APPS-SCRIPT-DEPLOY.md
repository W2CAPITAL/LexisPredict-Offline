# Publicar a atualização do Apps Script do SheetsPredict

O SheetsPredict usa um Web App do Google Apps Script como bridge privado entre a Vercel e a planilha. Atualizar o arquivo de código não atualiza automaticamente a implantação `/exec`.

## Atualizar sem trocar a URL

1. Abra a planilha oficial do SheetsPredict.
2. Vá em **Extensões → Apps Script**.
3. No projeto vinculado à planilha, substitua o conteúdo do bridge pelo arquivo privado atualizado **LEXIS-SYNC-AppsScript.gs**.
4. Confirme em **Configurações do projeto → Propriedades do script** que existe `LEXIS_SHEETS_TOKEN`. Não publique esse valor no GitHub nem no navegador.
5. Clique em **Implantar → Gerenciar implantações**.
6. Abra a implantação existente do tipo **App da Web** e clique em **Editar**.
7. Em **Versão**, escolha **Nova versão**.
8. Mantenha **Executar como: você/proprietário do script**.
9. Mantenha o mesmo nível de acesso usado pela implantação atual. Para o backend da Vercel conseguir chamar o Web App sem sessão Google interativa, a implantação precisa permitir o acesso compatível com a configuração atual; a autenticação do bridge continua sendo protegida pelo token e pela sessão do app.
10. Clique em **Implantar**.

Ao editar a implantação existente, a URL terminada em `/exec` permanece a mesma. Assim a variável `LEXIS_APPS_SCRIPT_URL` da Vercel não precisa ser alterada.

## Como validar

Depois da publicação:

1. Abra o SheetsPredict e faça login.
2. Clique em **Sincronizar**.
3. Abra **Clientes** e registre uma interação de teste.
4. Confirme que a nova linha apareceu na aba `Interacoes`.
5. Abra um processo e registre um atendimento.
6. Confirme que `AtendidoPor` e `Último Retorno` foram atualizados, enquanto `Assistente` permaneceu igual.
7. Confirme que `AuditoriaLogsApp` recebeu a alteração.

## Ações esperadas na versão CRM do bridge

A versão atual deve reconhecer, além das ações anteriores:

- `crm_list`
- `crm_write`
- `crm_seed_clients`

Se o app informar **“ação desconhecida: crm_list”**, a implantação `/exec` ainda está apontando para a versão antiga do Apps Script.

## Segurança

Não coloque `LEXIS_SHEETS_TOKEN`, senhas da aba `Usuarios`, URLs privadas ou chaves DataJud em arquivos versionados. O token deve existir somente em **Script Properties** e nas **Environment Variables** da Vercel.
