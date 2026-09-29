# Arquitetura do CRM no Google Sheets

O SheetsPredict mantém o Google Sheets como fonte de verdade. O navegador nunca vira o banco principal: IndexedDB é cache e outbox.

## Relacionamentos

```text
Clientes (ClienteId)
  ├── Processos (ClienteId, Protocolo)
  ├── Interacoes (ClienteId, Protocolo opcional)
  ├── PipelineCRM (ClienteId, Protocolo opcional)
  ├── AgendaCRM (ClienteId, Protocolo opcional)
  ├── TarefasCRM (ClienteId, Protocolo opcional)
  ├── DocumentosCRM (ClienteId, Protocolo opcional)
  └── Honorarios (cliente_id, protocolo)
```

`Assistente` continua sendo o dono da carteira do processo. `AtendidoPor` registra quem realizou o atendimento. Editar ou atender nunca transfere automaticamente o processo.

## Controle de acesso

- Processos da empresa: todo usuário autenticado pode visualizar e editar.
- Carteira pessoal: filtrada por `Assistente`.
- Clientes, interações, pipeline, agenda e tarefas: usuários autenticados.
- Honorários/financeiro: administrador, supervisor e superadmin.
- Auditoria completa: leitura de perfis elevados; gravação automática pelo bridge.

## Identificadores

`ClienteId` é estável e não depende de telefone ou CPF/CNPJ, para que correções cadastrais não quebrem vínculos. Registros novos recebem IDs próprios para interação, oportunidade, evento, tarefa e documento.

## Validação

O frontend valida CNJ pelo cálculo oficial mod 97, normaliza telefone para E.164 e valida CPF/CNPJ quando informado. As abas CRM também usam validação de lista no Google Sheets para etapas, status, prioridade e opt-out.

## Auditoria

O bridge CRM registra alterações em `AuditoriaLogsApp` com entidade, ID, campo, valor anterior, valor novo, usuário e data. Isso permite reconstruir quem alterou o quê.

## Offline

- `rows`: réplica local da aba Processos.
- `crm`: réplica local das entidades CRM.
- `outbox`: alterações de Processos.
- `crmOutbox`: alterações das entidades CRM.

No F5, o app renderiza o cache primeiro. A sincronização remota ocorre depois e apenas quando necessário.

## Apps Script

A versão CRM do bridge adiciona as ações:

- `crm_list`
- `crm_write`
- `crm_seed_clients`

Depois de atualizar o projeto Apps Script é necessário publicar uma nova versão da implantação `/exec`. O token permanece somente nas Script Properties e na Vercel.
