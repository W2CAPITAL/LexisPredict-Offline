const BPMN_INTENT=/\b(bpmn|camunda|zeebe|flowable|bpmn\.io|swimlane|pool|lane|gateway|as[- ]?is|to[- ]?be|fluxo(?:\s+de)?\s+(?:processo|atendimento|prazo|documento|trabalho)|model(?:ar|agem)\s+(?:de\s+)?processo|diagrama\s+de\s+processo)\b/i;

function isBpmnIntent(text){
  return BPMN_INTENT.test(String(text||""));
}
function bpmnContext(text){
  if(!isBpmnIntent(text))return "";
  return [
    "SKILL BPMN 2.0 ATIVA.",
    "Separe semântica BPMN (eventos, tarefas, gateways, pools, lanes, sequence flows) de layout/DI.",
    "Antes de modelar, identifique trigger, participantes, happy path, decisões, exceções/timeouts e estados finais.",
    "Tarefas usam verbo + objeto; gateways são perguntas. XOR=uma saída, AND=todas, OR=uma ou mais. Split/join devem ser compatíveis.",
    "Use lanes para papéis internos e pools para participantes independentes. Prazo/timeout pode usar timer/boundary event.",
    "Em operação jurídica, DataJud/DJEN fornecem eventos/evidências; não substituem revisão humana. Não invente prazo, status, responsável ou ato.",
    "Ao criar BPMN, gere semântica BPMN 2.0 válida. O tooling determinístico em skills/bpmn cuida de layout, validate, lint, diff e find.",
    "Ao revisar, procure deadlock, execução duplicada, stuck token, unreachable, dead ends, start/end inválidos, boundary host inválido e lane/pool incorretos."
  ].join(" ");
}
module.exports={isBpmnIntent,bpmnContext};
