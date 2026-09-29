/**
 * LexisPredict — Monitoramento DataJud + DJEN V6 para Google Sheets
 * Planilha esperada: aba "Processos", F=Protocolo, M=Retorno, N=Proximo_Retorno, O=Tribunal.
 *
 * Princípios:
 * - cada processo é consultado individualmente (um request DataJud por CNJ);
 * - cada CNJ é consultado sequencialmente, um processo por vez, e é salvo imediatamente;
 * - falha de DataJud/DJEN nunca apaga o último dado válido;
 * - DJEN 403 ativa circuit breaker e não transforma a carteira inteira em erro;
 * - chave pública do DataJud é lida de Config e pode ser atualizada automaticamente da Wiki do CNJ;
 * - fila prioriza retorno vencido/hoje, erros e processos nunca sincronizados.
 */

var LEXIS_MONITOR_V5 = Object.freeze({
  SPREADSHEET_ID: '1qbuJee6DCv0bh9XGvnBDPltc0Ziphdn2yx11QKOnchc',
  MAIN_SHEET_ID: 2116374046,
  SHEET: 'Processos',
  CONFIG: 'Config',
  DATAJUD_LOG: 'Movimentações_DataJud',
  DJEN_LOG: 'Publicações_DJEN',
  RUN_LOG: 'Log_Monitoramento',
  TIMEZONE: 'America/Sao_Paulo',
  DATAJUD_BASE: 'https://api-publica.datajud.cnj.jus.br/',
  DATAJUD_KEY_PAGE: 'https://datajud-wiki.cnj.jus.br/api-publica/acesso/',
  DJEN_BASE: 'https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao',
  FIRST_DATA_ROW: 2,
  // 1-based columns
  COL: {
    CLIENTE: 4, PROTOCOLO: 6, DATA_MOV: 11, ANDAMENTO: 12, RETORNO: 13,
    PROX_RETORNO: 14, TRIBUNAL: 15, NOVO_ANDAMENTO_LEGACY: 17,
    SITUACAO_RETORNO: 37, DIAS_RETORNO: 38,
    DJ_MOV: 39, DJ_DATA: 40, DJEN_RESUMO: 41, DJEN_DATA: 42,
    NOVA_ATUALIZACAO: 43, FONTE: 44, ULT_SYNC: 45, PROX_SYNC: 46,
    STATUS_SYNC: 47, ERRO_SYNC: 48, DATAJUD_KEY: 49, DJEN_ID: 50, DJEN_DATE: 51
  },
  DEFAULT_MAX_PER_CYCLE: 18,
  DJEN_MAX_PER_CYCLE: 6,
  LOCK_WAIT_MS: 20000,
  PUBLIC_KEY_FALLBACK: 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==',
  PARALLEL_CHUNK: 1,
  MAX_RUNTIME_MS: 275000,
  DJEN_BLOCK_HOURS: 6,
  DJEN_TIMEOUT_RETRY_HOURS: 2
});

function getSpreadsheetV5_() {
  return SpreadsheetApp.openById(LEXIS_MONITOR_V5.SPREADSHEET_ID);
}

function getMainSheetV5_(ss) {
  ss = ss || getSpreadsheetV5_();
  var sh = null;
  try { sh = ss.getSheetById(LEXIS_MONITOR_V5.MAIN_SHEET_ID); } catch (e) {}
  if (!sh) sh = ss.getSheetByName(LEXIS_MONITOR_V5.SHEET);
  if (!sh) throw new Error('Aba principal não encontrada. Esperado: Processos / gid 2116374046.');
  var protocolo = String(sh.getRange(1, LEXIS_MONITOR_V5.COL.PROTOCOLO).getDisplayValue() || '').trim();
  if (protocolo !== 'Protocolo') {
    throw new Error('Estrutura inesperada: Processos!F1 deve ser "Protocolo". Encontrado: "' + protocolo + '".');
  }
  return sh;
}

function scannerOnOpen_(e) {
  SpreadsheetApp.getUi()
    .createMenu('⚖️ Monitoramento CNJ')
    .addItem('▶ Ativar scanner', 'ATIVAR_SCANNER_V6')
    .addItem('⏸ Pausar scanner', 'PAUSAR_SCANNER_V6')
    .addItem('⚡ Executar 1 ciclo', 'EXECUTAR_UM_CICLO_V6')
    .addItem('⟳ Varredura completa', 'INICIAR_VARREDURA_COMPLETA')
    .addSeparator()
    .addItem('RESET TOTAL + instalar V6', 'RESET_TOTAL_E_INSTALAR_V6')
    .addItem('Configurar / reparar', 'SETUP_MONITORAMENTO')
    .addItem('Testar linha selecionada', 'TESTAR_LINHA_ATIVA_V5')
    .addItem('Diagnóstico de gatilhos', 'DIAGNOSTICO_GATILHOS_V5')
    .addItem('Limpar erros antigos do log', 'LIMPAR_LOG_ERROS_ANTIGOS_V5')
    .addItem('Sincronizar agora', 'SINCRONIZAR_AGORA')
    .addSeparator()
    .addItem('Atualizar retornos', 'ATUALIZAR_STATUS_RETORNOS')
    .addItem('Atualizar chave DataJud', 'ATUALIZAR_CHAVE_DATAJUD')
    .addItem('Diagnóstico', 'DIAGNOSTICO_MONITORAMENTO')
    .addToUi();
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    // O controle visual do CRM usa gatilho instalável (CONTROLE_PAINEL_ONEDIT_V6).
    // O onEdit simples continua apenas para ajustes locais na aba Processos.
    if (sh.getName() !== LEXIS_MONITOR_V5.SHEET || e.range.getRow() < 2) return;
    const c1 = e.range.getColumn();
    const c2 = e.range.getLastColumn();
    if (c1 <= LEXIS_MONITOR_V5.COL.PROX_RETORNO && c2 >= LEXIS_MONITOR_V5.COL.RETORNO) {
      atualizarRetornos_(sh, e.range.getRow(), e.range.getLastRow());
    }
    // CNJ/tribunal alterado: coloca a linha de volta na fila imediatamente.
    if ((c1 <= LEXIS_MONITOR_V5.COL.PROTOCOLO && c2 >= LEXIS_MONITOR_V5.COL.PROTOCOLO) ||
        (c1 <= LEXIS_MONITOR_V5.COL.TRIBUNAL && c2 >= LEXIS_MONITOR_V5.COL.TRIBUNAL)) {
      sh.getRange(e.range.getRow(), LEXIS_MONITOR_V5.COL.PROX_SYNC, e.range.getNumRows(), 1).clearContent();
      sh.getRange(e.range.getRow(), LEXIS_MONITOR_V5.COL.STATUS_SYNC, e.range.getNumRows(), 1).setValue('PENDENTE');
    }
  } catch (err) {
    console.error(err);
  }
}

function RESET_TOTAL_E_INSTALAR_V6() {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    removed.push(t.getHandlerFunction());
    ScriptApp.deleteTrigger(t);
  });
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('DJEN_BLOCKED_UNTIL');
  props.deleteProperty('DJEN_RATE_LIMIT_UNTIL');
  LIMPAR_LOG_ERROS_ANTIGOS_V5();
  SETUP_MONITORAMENTO();
  var ss = getSpreadsheetV5_();
  var log = ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
  if (log) log.appendRow([new Date(), 0, 0, 0, 0, 'RESET TOTAL V6. Gatilhos antigos removidos: ' + removed.join(', ')]);
}

// Compatibilidade com atalhos antigos.
function RESET_TOTAL_E_INSTALAR_V5() { return RESET_TOTAL_E_INSTALAR_V6(); }

function sincronizarControlesV6_() {
  var ss = getSpreadsheetV5_();
  var ativo = String(getConfigValue_('Status automático') || '').toUpperCase() === 'ATIVO';
  var painel = ss.getSheetByName('Painel_Monitoramento');
  if (painel) {
    painel.getRange('M2').setValue(ativo);
    if (painel.getRange('N2').isBlank()) painel.getRange('N2').setValue('— AÇÃO —');
  }
  var dash = ss.getSheetByName('Dashboard');
  if (dash) {
    dash.getRange('G4').setValue(ativo);
    if (dash.getRange('H4').isBlank()) dash.getRange('H4').setValue('— AÇÃO —');
  }
}

function ATIVAR_SCANNER_V6() {
  setConfigValue_('Status automático', 'ATIVO');
  setConfigValue_('Estado da varredura', 'ATIVO • aguardando/consultando fila');
  sincronizarControlesV6_();
  SpreadsheetApp.flush();
  return processarFilaV5_(true, false);
}

function PAUSAR_SCANNER_V6() {
  setConfigValue_('Status automático', 'PAUSADO');
  setConfigValue_('Estado da varredura', 'PAUSADO PELO USUÁRIO');
  sincronizarControlesV6_();
  getSpreadsheetV5_().toast('Scanner DataJud + DJEN pausado.', 'LexisPredict', 6);
  return {paused:true};
}

function EXECUTAR_UM_CICLO_V6() {
  setConfigValue_('Status automático', 'ATIVO');
  setConfigValue_('Estado da varredura', 'EXECUÇÃO MANUAL');
  sincronizarControlesV6_();
  SpreadsheetApp.flush();
  return processarFilaV5_(true, true);
}

function CONTROLE_PAINEL_ONEDIT_V6(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var a1 = e.range.getA1Notation();
  var isPainel = sh.getName() === 'Painel_Monitoramento';
  var isDash = sh.getName() === 'Dashboard';
  if (!isPainel && !isDash) return;

  var toggleCell = isPainel ? 'M2' : 'G4';
  var actionCell = isPainel ? 'N2' : 'H4';
  if (a1 === toggleCell) {
    if (String(e.value).toUpperCase() === 'TRUE') ATIVAR_SCANNER_V6();
    else PAUSAR_SCANNER_V6();
    return;
  }
  if (a1 === actionCell) {
    var action = String(e.value || '');
    try {
      if (action === '▶ INICIAR') ATIVAR_SCANNER_V6();
      else if (action === '⏸ PAUSAR') PAUSAR_SCANNER_V6();
      else if (action === '⚡ EXECUTAR 1 CICLO') EXECUTAR_UM_CICLO_V6();
      else if (action === '⟳ VARREDURA COMPLETA') INICIAR_VARREDURA_COMPLETA();
    } finally {
      sh.getRange(actionCell).setValue('— AÇÃO —');
      sincronizarControlesV6_();
    }
  }
}

function SETUP_MONITORAMENTO() {
  var ss = getSpreadsheetV5_();
  var sh = getMainSheetV5_(ss);

  garantirCabecalhos_(sh);
  garantirAbasLog_(ss);
  garantirConfig_(ss);
  setConfigValue_('Status automático', 'ATIVO');
  setConfigValue_('Intervalo automático (min)', 1);
  setConfigValue_('Processos por ciclo', LEXIS_MONITOR_V5.DEFAULT_MAX_PER_CYCLE);
  setConfigValue_('Estado da varredura', 'PRONTO');
  setConfigValue_('DJEN ativo', 'SIM');
  setConfigValue_('GID da aba principal', LEXIS_MONITOR_V5.MAIN_SHEET_ID);
  setConfigValue_('Modo', 'V6 — CRM control center • scanner visual • DataJud por processo • DJEN desacoplado');
  setConfigValue_('Último erro DataJud', '');
  setConfigValue_('Último erro DJEN', '');
  try { ATUALIZAR_CHAVE_DATAJUD(); } catch (e) { setConfigValue_('Último erro DataJud', 'Não consegui renovar a chave automaticamente: ' + e.message); }
  ATUALIZAR_STATUS_RETORNOS();
  var removed = instalarTriggers_();
  SpreadsheetApp.flush();

  var log = ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
  sincronizarControlesV6_();
  if (log) log.appendRow([new Date(), 0, 0, 0, 0, 'V6 instalada. Gatilhos removidos: ' + removed.join(', ')]);
  ss.toast('V6 instalada. Use o controle visual no Painel_Monitoramento ou no Dashboard.', 'LexisPredict', 10);
}

function instalarTriggers_() {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    removed.push(t.getHandlerFunction());
    ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('RODAR_MONITORAMENTO_V5').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('ATUALIZAR_RETORNOS_V5').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('REVARREDURA_DIARIA_V5').timeBased().atHour(6).everyDays(1).create();
  ScriptApp.newTrigger('CONTROLE_PAINEL_ONEDIT_V6').forSpreadsheet(getSpreadsheetV5_()).onEdit().create();
  return removed;
}

function garantirCabecalhos_(sh) {
  const headers = [
    ['Situação do Retorno', LEXIS_MONITOR_V5.COL.SITUACAO_RETORNO], ['Dias até o Retorno', LEXIS_MONITOR_V5.COL.DIAS_RETORNO],
    ['DataJud - Último Movimento', LEXIS_MONITOR_V5.COL.DJ_MOV], ['DataJud - Data', LEXIS_MONITOR_V5.COL.DJ_DATA],
    ['DJEN - Última Publicação', LEXIS_MONITOR_V5.COL.DJEN_RESUMO], ['DJEN - Data', LEXIS_MONITOR_V5.COL.DJEN_DATA],
    ['Nova Atualização', LEXIS_MONITOR_V5.COL.NOVA_ATUALIZACAO], ['Fonte da Atualização', LEXIS_MONITOR_V5.COL.FONTE],
    ['Última Sincronização', LEXIS_MONITOR_V5.COL.ULT_SYNC], ['Próxima Sincronização', LEXIS_MONITOR_V5.COL.PROX_SYNC],
    ['Status da Sincronização', LEXIS_MONITOR_V5.COL.STATUS_SYNC], ['Erro de Sincronização', LEXIS_MONITOR_V5.COL.ERRO_SYNC],
    ['_DataJudKey', LEXIS_MONITOR_V5.COL.DATAJUD_KEY], ['_DJENId', LEXIS_MONITOR_V5.COL.DJEN_ID], ['_DJENDate', LEXIS_MONITOR_V5.COL.DJEN_DATE]
  ];
  const need = LEXIS_MONITOR_V5.COL.DJEN_DATE - sh.getMaxColumns();
  if (need > 0) sh.insertColumnsAfter(sh.getMaxColumns(), need);
  headers.forEach(([name, col]) => sh.getRange(1, col).setValue(name));
  sh.setFrozenRows(1);
  sh.getRange(2, LEXIS_MONITOR_V5.COL.DATA_MOV, Math.max(1, sh.getMaxRows()-1), 1).setNumberFormat('dd/MM/yyyy HH:mm');
  sh.getRange(2, LEXIS_MONITOR_V5.COL.DJ_DATA, Math.max(1, sh.getMaxRows()-1), 1).setNumberFormat('dd/MM/yyyy HH:mm');
  sh.getRange(2, LEXIS_MONITOR_V5.COL.DJEN_DATA, Math.max(1, sh.getMaxRows()-1), 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(2, LEXIS_MONITOR_V5.COL.ULT_SYNC, Math.max(1, sh.getMaxRows()-1), 2).setNumberFormat('dd/MM/yyyy HH:mm');
}

function garantirAbasLog_(ss) {
  const defs = [
    [LEXIS_MONITOR_V5.DATAJUD_LOG, ['Data/Hora','CNJ','Data Movimento','Movimento','Órgão Julgador','Chave']],
    [LEXIS_MONITOR_V5.DJEN_LOG, ['Data/Hora','CNJ','Data Disponibilização','Tipo','Órgão','Destinatário','Resumo','ID']],
    [LEXIS_MONITOR_V5.RUN_LOG, ['Data/Hora','Processos consultados','Novidades','DataJud','DJEN','Observação']]
  ];
  defs.forEach(([name, headers]) => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    s.getRange(1,1,1,headers.length).setValues([headers]);
    s.setFrozenRows(1);
  });
}

function garantirConfig_(ss) {
  let s = ss.getSheetByName(LEXIS_MONITOR_V5.CONFIG);
  if (!s) s = ss.insertSheet(LEXIS_MONITOR_V5.CONFIG);
  const wanted = [
    ['DataJud API Key', ''],
    ['Intervalo automático (min)', 1],
    ['Processos por ciclo', LEXIS_MONITOR_V5.DEFAULT_MAX_PER_CYCLE],
    ['Fuso horário', LEXIS_MONITOR_V5.TIMEZONE],
    ['GID da aba principal', getMainSheetV5_(ss).getSheetId()],
    ['Status automático', 'ATIVO'],
    ['Última execução', ''],
    ['Último erro DataJud', ''],
    ['Último erro DJEN', ''],
    ['Observação DJEN', 'HTTP 403 pode ocorrer por origem da execução; o último dado válido é preservado.'],
    ['Modo', 'Scanner V6 por CNJ + controle CRM + progresso visível + retry + preservação do último dado válido'],
    ['DJEN ativo', 'SIM'],
    ['DJEN proxy URL (opcional)', ''],
    ['Paralelismo DataJud', LEXIS_MONITOR_V5.PARALLEL_CHUNK],
    ['Tempo máximo por ciclo (seg)', Math.floor(LEXIS_MONITOR_V5.MAX_RUNTIME_MS/1000)],
    ['Última varredura completa', ''],
    ['Fonte chave DataJud', LEXIS_MONITOR_V5.DATAJUD_KEY_PAGE],
    ['Aba principal fixa', 'Processos / gid 2116374046 / coluna F = Protocolo'],
    ['Estado da varredura', 'PRONTO'],
    ['Fila válida restante', ''],
    ['CNJs inválidos', ''],
    ['Aviso chave DataJud', ''],
    ['Versão do monitor', '6.0.0']
  ];
  const existing = s.getLastRow() ? s.getRange(1,1,s.getLastRow(),2).getValues() : [];
  const map = new Map(existing.slice(1).map((r,i)=>[String(r[0]||'').trim(), i+2]));
  if (String(s.getRange(1,1).getValue()) !== 'CONFIGURAÇÃO') s.getRange(1,1,1,2).setValues([['CONFIGURAÇÃO','VALOR']]);
  wanted.forEach(([label, value]) => {
    const row = map.get(label) || s.getLastRow()+1;
    s.getRange(row,1).setValue(label);
    if (label === 'Versão do monitor' || label === 'Modo') s.getRange(row,2).setValue(value);
    else if (!map.has(label) || s.getRange(row,2).isBlank()) s.getRange(row,2).setValue(value);
  });
  if (!getConfigValue_('DataJud API Key')) ATUALIZAR_CHAVE_DATAJUD();
}

function getConfigMap_() {
  const s = getSpreadsheetV5_().getSheetByName(LEXIS_MONITOR_V5.CONFIG);
  if (!s || s.getLastRow() < 2) return {};
  const vals = s.getRange(2,1,s.getLastRow()-1,2).getValues();
  const out = {};
  vals.forEach(r => { if (r[0] !== '') out[String(r[0]).trim()] = r[1]; });
  return out;
}
function getConfigValue_(label) { return getConfigMap_()[label]; }
function setConfigValue_(label, value) {
  const s = getSpreadsheetV5_().getSheetByName(LEXIS_MONITOR_V5.CONFIG);
  const vals = s.getRange(1,1,Math.max(1,s.getLastRow()),1).getValues().flat();
  let idx = vals.findIndex(x=>String(x).trim()===label);
  if (idx < 0) idx = s.getLastRow();
  s.getRange(idx+1,1).setValue(label);
  s.getRange(idx+1,2).setValue(value);
}

function ATUALIZAR_CHAVE_DATAJUD() {
  var atual = String(getConfigValue_('DataJud API Key') || '').trim();
  var chave = '';
  var http = 0;
  try {
    var r = UrlFetchApp.fetch(LEXIS_MONITOR_V5.DATAJUD_KEY_PAGE, {
      muteHttpExceptions:true,
      followRedirects:true,
      headers:{'User-Agent':'Mozilla/5.0 LexisPredict/5.0'}
    });
    http = r.getResponseCode();
    var txt = r.getContentText() || '';
    var plain = txt
      .replace(/<script[\s\S]*?<\/script>/gi,' ')
      .replace(/<style[\s\S]*?<\/style>/gi,' ')
      .replace(/<[^>]+>/g,' ')
      .replace(/&nbsp;|&#160;/gi,' ')
      .replace(/\s+/g,' ');
    var m = plain.match(/Authorization\s*:\s*APIKey\s+([A-Za-z0-9+\/=]{40,})/i) ||
            plain.match(/APIKey\s+([A-Za-z0-9+\/=]{40,})/i) ||
            txt.match(/cDZ[A-Za-z0-9+\/=]{40,}/);
    if (m) chave = m[1] || m[0];
  } catch (e) {
    setConfigValue_('Aviso chave DataJud', 'Leitura automática falhou; chave já configurada será preservada: ' + e.message);
  }

  if (!chave && /^[A-Za-z0-9+\/=]{40,}$/.test(atual)) {
    chave = atual;
    setConfigValue_('Aviso chave DataJud', 'Chave existente preservada; página oficial não pôde ser interpretada automaticamente' + (http ? ' (HTTP '+http+')' : '') + '.');
  }
  if (!chave) {
    chave = LEXIS_MONITOR_V5.PUBLIC_KEY_FALLBACK;
    setConfigValue_('Aviso chave DataJud', 'Usando chave pública de fallback embutida. O V5 tentará renovar novamente nas próximas instalações.');
  }

  setConfigValue_('DataJud API Key', chave);
  setConfigValue_('Último erro DataJud', '');
  return chave;
}

function ATUALIZAR_STATUS_RETORNOS() {
  const sh = getMainSheetV5_(getSpreadsheetV5_());
  if (!sh) return;
  const last = sh.getLastRow();
  if (last < 2) return;
  atualizarRetornos_(sh, 2, last);
}

function atualizarRetornos_(sh, startRow, endRow) {
  const n = endRow - startRow + 1;
  const vals = sh.getRange(startRow, LEXIS_MONITOR_V5.COL.RETORNO, n, 2).getValues(); // M:N
  const today = inicioDia_(new Date());
  const out = vals.map(r => {
    const prox = parseDate_(r[1]);
    if (!prox) return ['SEM DATA',''];
    const d = Math.round((inicioDia_(prox)-today)/86400000);
    return [d < 0 ? 'VENCIDO' : d === 0 ? 'ATENÇÃO' : 'EM DIA', d];
  });
  sh.getRange(startRow, LEXIS_MONITOR_V5.COL.SITUACAO_RETORNO, n, 2).setValues(out);
}

function RODAR_MONITORAMENTO_V5() { return processarFilaV5_(false, false); }
function SINCRONIZAR_AGORA() { setConfigValue_('Status automático','ATIVO'); sincronizarControlesV6_(); return processarFilaV5_(true, true); }
function ATUALIZAR_RETORNOS_V5() { ATUALIZAR_STATUS_RETORNOS(); }
function REVARREDURA_DIARIA_V5() { REVARREDURA_DIARIA(); }

function INICIAR_VARREDURA_COMPLETA() {
  var ss = getSpreadsheetV5_();
  var sh = getMainSheetV5_(ss);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('A aba Processos não possui linhas para consultar.');

  setConfigValue_('Status automático', 'ATIVO');
  setConfigValue_('Último erro DataJud', '');
  setConfigValue_('Último erro DJEN', '');
  PropertiesService.getScriptProperties().deleteProperty('DJEN_BLOCKED_UNTIL');
  PropertiesService.getScriptProperties().deleteProperty('DJEN_RATE_LIMIT_UNTIL');

  sh.getRange(2, LEXIS_MONITOR_V5.COL.PROX_SYNC, last-1, 1).clearContent();
  sh.getRange(2, LEXIS_MONITOR_V5.COL.STATUS_SYNC, last-1, 1).setValue('PENDENTE');
  sh.getRange(2, LEXIS_MONITOR_V5.COL.ERRO_SYNC, last-1, 1).clearContent();
  setConfigValue_('Última varredura completa', new Date());
  setConfigValue_('Estado da varredura', 'INICIANDO');

  var log = ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
  if (log) log.appendRow([new Date(), 0, 0, 0, 0, 'V6 START • fila completa reaberta • Processos!F=Protocolo • controle CRM ativo']);
  SpreadsheetApp.flush();

  var result = processarFilaV5_(true, true);
  sincronizarControlesV6_();
  ss.toast('Varredura V6 iniciada. Acompanhe o status no Painel_Monitoramento.', 'LexisPredict', 10);
  return result;
}

function REVARREDURA_DIARIA() {
  const sh = getMainSheetV5_(getSpreadsheetV5_());
  const last = sh.getLastRow();
  if (last < 2) return;
  // força nova passagem diária sem apagar dados obtidos.
  sh.getRange(2, LEXIS_MONITOR_V5.COL.PROX_SYNC, last-1, 1).clearContent();
  setConfigValue_('Última varredura completa', new Date());
}

function processarFilaV5_(force, manual) {
  var lock = LockService.getScriptLock();
  if (manual) {
    try { lock.waitLock(LEXIS_MONITOR_V5.LOCK_WAIT_MS); }
    catch (lockErr) { throw new Error('Scanner ocupado por outra execução. Aguarde a execução atual terminar.'); }
  } else {
    if (!lock.tryLock(500)) return {consulted:0, reason:'LOCK_SKIP'};
  }

  var started = Date.now();
  var ss = getSpreadsheetV5_();
  var sh = getMainSheetV5_(ss);
  var consulted = 0, novidades = 0, djOk = 0, djenOk = 0;

  try {
    var cfg = getConfigMap_();
    if (manual) {
      setConfigValue_('Status automático', 'ATIVO');
      cfg['Status automático'] = 'ATIVO';
    }
    if (String(cfg['Status automático'] || 'ATIVO').toUpperCase() !== 'ATIVO') return {consulted:0, reason:'PAUSADO'};

    setConfigValue_('Estado da varredura', 'LENDO FILA');
    ATUALIZAR_STATUS_RETORNOS();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return {consulted:0, reason:'SEM LINHAS'};

    var lastCol = Math.max(LEXIS_MONITOR_V5.COL.DJEN_DATE, sh.getLastColumn());
    var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var now = new Date();
    var requestedMax = Number(cfg['Processos por ciclo']) || LEXIS_MONITOR_V5.DEFAULT_MAX_PER_CYCLE;
    var maxPer = Math.max(1, Math.min(25, requestedMax));

    var candidates = [];
    var invalid = [];
    rows.forEach(function(r, i) {
      var rowNumber = i + 2;
      var raw = r[LEXIS_MONITOR_V5.COL.PROTOCOLO - 1];
      if (raw === '' || raw === null) return;
      var cnj = normalizeCNJ_(raw);
      if (!cnj) { invalid.push(rowNumber); return; }
      var next = parseDate_(r[LEXIS_MONITOR_V5.COL.PROX_SYNC - 1]);
      if (!force && next && next > now) return;
      var stRet = String(r[LEXIS_MONITOR_V5.COL.SITUACAO_RETORNO - 1] || 'SEM DATA');
      var stSync = String(r[LEXIS_MONITOR_V5.COL.STATUS_SYNC - 1] || '');
      var lastSync = parseDate_(r[LEXIS_MONITOR_V5.COL.ULT_SYNC - 1]);
      candidates.push({rowNumber:rowNumber,r:r,cnj:cnj,priority:prioridade_(stRet,stSync,lastSync),lastSync:lastSync?lastSync.getTime():0});
    });

    marcarProtocolosInvalidosV5_(sh, invalid);
    candidates.sort(function(a,b){return a.priority-b.priority || a.lastSync-b.lastSync || a.rowNumber-b.rowNumber;});
    var queue = candidates.slice(0,maxPer);

    setConfigValue_('Fila válida restante', candidates.length);
    setConfigValue_('CNJs inválidos', invalid.length);
    if (!queue.length) {
      setConfigValue_('Última execução', new Date());
      setConfigValue_('Estado da varredura', 'FILA VAZIA');
      var emptyLog=ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
      if(emptyLog) emptyLog.appendRow([new Date(),0,0,0,0,'V5 • fila vazia']);
      return {consulted:0, reason:'FILA VAZIA'};
    }

    var apiKey = String(cfg['DataJud API Key'] || '').trim();
    if (!/^[A-Za-z0-9+\/=]{40,}$/.test(apiKey)) apiKey = ATUALIZAR_CHAVE_DATAJUD();

    var djenBudget = Math.min(LEXIS_MONITOR_V5.DJEN_MAX_PER_CYCLE, queue.length);
    var djenSkipped=0,djen429=0,djen403=0;

    var startLog=ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
    if(startLog) startLog.appendRow([new Date(),0,0,0,0,'V6 CICLO START • lote='+queue.length+' • fila='+candidates.length]);

    for (var i=0;i<queue.length;i++) {
      if (Date.now()-started > LEXIS_MONITOR_V5.MAX_RUNTIME_MS) break;
      var item=queue[i];
      marcarConsultandoV5_(sh,item.rowNumber,'CONSULTANDO DATAJUD');
      setConfigValue_('Estado da varredura','DataJud '+(i+1)+'/'+queue.length+' • linha '+item.rowNumber);
      SpreadsheetApp.flush();

      var dj=consultarDataJudUmV5_(item,apiKey);
      if(dj.refreshedKey) apiKey=String(getConfigValue_('DataJud API Key')||apiKey).trim();
      aplicarPreviewDataJudV5_(sh,item,dj);
      SpreadsheetApp.flush();

      var de={skipped:true,reason:'DJEN reservado para ciclos controlados'};
      var currentCfg=getConfigMap_();
      if (djenBudget>0 && djenPodeRodarV5_(currentCfg)) {
        marcarConsultandoV5_(sh,item.rowNumber,'DATAJUD CONCLUÍDO • CONSULTANDO DJEN');
        SpreadsheetApp.flush();
        de=consultarDjenUmV5_(item,currentCfg);
        djenBudget--;
        if(de&&de.http===429)djen429++;
        if(de&&de.http===403)djen403++;
      } else djenSkipped++;

      var patch=construirPatchLinhaV5_(item,dj,de,new Date());
      if(patch.novidade)novidades++;
      if(dj.ok&&!dj.partial)djOk++;
      if(de&&de.ok)djenOk++;
      aplicarPatchIndividualV5_(ss,sh,patch);
      SpreadsheetApp.flush();
      consulted++;
      Utilities.sleep(120);
    }

    setConfigValue_('Última execução',new Date());
    setConfigValue_('Estado da varredura','LOTE CONCLUÍDO • '+consulted+' processo(s)');
    var log=ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
    var obs=['V6 scanner','aba=Processos','F=Protocolo','lote='+consulted,'fila restante aprox='+(Math.max(0,candidates.length-consulted)),invalid.length?('CNJ inválido='+invalid.length):'',djenSkipped?('DJEN adiado='+djenSkipped):'',djen429?('DJEN 429='+djen429):'',djen403?('DJEN 403='+djen403):''].filter(Boolean).join(' | ');
    if(log)log.appendRow([new Date(),consulted,novidades,djOk,djenOk,obs]);
    return {consulted:consulted,novidades:novidades,datajud:djOk,djen:djenOk};
  } catch(err) {
    setConfigValue_('Último erro DataJud',String(err&&err.message||err));
    setConfigValue_('Estado da varredura','ERRO • '+String(err&&err.message||err));
    var logErr=ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
    if(logErr)logErr.appendRow([new Date(),consulted,novidades,djOk,djenOk,'V5 ERRO: '+String(err&&err.message||err)]);
    if(manual) throw err;
    return {consulted:consulted,error:String(err&&err.message||err)};
  } finally {
    try{lock.releaseLock();}catch(_){}
  }
}

function marcarConsultandoV5_(sh,row,status) {
  sh.getRange(row,LEXIS_MONITOR_V5.COL.STATUS_SYNC).setValue(status);
  sh.getRange(row,LEXIS_MONITOR_V5.COL.ERRO_SYNC).clearContent();
}

function aplicarPreviewDataJudV5_(sh,item,dj) {
  var row=item.rowNumber;
  if(dj&&dj.ok&&dj.found&&dj.latest){
    sh.getRange(row,LEXIS_MONITOR_V5.COL.DATA_MOV,1,2).setValues([[dj.latest.date,dj.latest.name]]);
    sh.getRange(row,LEXIS_MONITOR_V5.COL.DJ_MOV,1,2).setValues([[dj.latest.name,dj.latest.date]]);
    sh.getRange(row,LEXIS_MONITOR_V5.COL.STATUS_SYNC).setValue('DATAJUD OK • DJEN PENDENTE');
  } else if(dj&&dj.ok&&!dj.found){
    sh.getRange(row,LEXIS_MONITOR_V5.COL.STATUS_SYNC).setValue('DATAJUD SEM RETORNO');
    sh.getRange(row,LEXIS_MONITOR_V5.COL.ERRO_SYNC).setValue('DataJud não retornou resultado público para este CNJ nesta consulta.');
  } else {
    sh.getRange(row,LEXIS_MONITOR_V5.COL.STATUS_SYNC).setValue('ERRO DATAJUD');
    sh.getRange(row,LEXIS_MONITOR_V5.COL.ERRO_SYNC).setValue((dj&&dj.error)||'Falha DataJud');
  }
}

function marcarProtocolosInvalidosV5_(sh, rows) {
  if (!rows || !rows.length) return;
  rows.slice(0, 200).forEach(function(row) {
    var status = sh.getRange(row, LEXIS_MONITOR_V5.COL.STATUS_SYNC).getDisplayValue();
    if (!status || status === 'PENDENTE' || status === 'ERRO') {
      sh.getRange(row, LEXIS_MONITOR_V5.COL.STATUS_SYNC).setValue('SEM CNJ');
      sh.getRange(row, LEXIS_MONITOR_V5.COL.ERRO_SYNC).setValue('Protocolo da coluna F não contém um número CNJ válido de 20 dígitos.');
    }
  });
}

function consultarDataJudUmV5_(item, apiKey) {
  var alias = tribunalAlias_(item.cnj, item.r[LEXIS_MONITOR_V5.COL.TRIBUNAL - 1]);
  if (!alias) return {ok:false, error:'Tribunal/alias DataJud não identificado para este CNJ.'};

  var result = fetchDataJudComRetryV5_(item, alias, apiKey);
  if (result.http === 401) {
    try {
      var fresh = ATUALIZAR_CHAVE_DATAJUD();
      result = fetchDataJudComRetryV5_(item, alias, fresh);
      result.refreshedKey = true;
    } catch (e) {
      result.error = 'Falha ao renovar chave pública DataJud: ' + e.message;
    }
  }
  return result;
}

function fetchDataJudComRetryV5_(item, alias, apiKey) {
  var attempts = 0;
  var last = null;
  while (attempts < 3) {
    attempts++;
    var resp;
    try {
      resp = UrlFetchApp.fetch(
        LEXIS_MONITOR_V5.DATAJUD_BASE + 'api_publica_' + alias + '/_search',
        {
          method: 'post',
          muteHttpExceptions: true,
          followRedirects: true,
          contentType: 'application/json',
          headers: {Authorization: 'APIKey ' + apiKey},
          payload: JSON.stringify({
            size: 100,
            _source: ['numeroProcesso','tribunal','grau','orgaoJulgador','movimentos','dataHoraUltimaAtualizacao'],
            query: {match: {numeroProcesso: item.cnj}}
          })
        }
      );
    } catch (e) {
      last = {ok:false, http:0, error:'DataJud fetch: ' + e.message};
      Utilities.sleep(700 * attempts);
      continue;
    }

    last = parseDataJudResponse_(resp, item);
    if (last.http !== 429 && last.http < 500) return last;
    Utilities.sleep(attempts === 1 ? 900 : 1800);
  }
  return last || {ok:false, error:'DataJud sem resposta.'};
}

function djenPodeRodarV5_(cfg) {
  if (String(cfg['DJEN ativo'] || 'SIM').toUpperCase() !== 'SIM') return false;
  var props = PropertiesService.getScriptProperties();
  var blocked = Number(props.getProperty('DJEN_BLOCKED_UNTIL') || 0);
  var rate = Number(props.getProperty('DJEN_RATE_LIMIT_UNTIL') || 0);
  var now = Date.now();
  return (!blocked || now > blocked) && (!rate || now > rate);
}

function consultarDjenUmV5_(item, cfg) {
  var base = String(cfg['DJEN proxy URL (opcional)'] || '').trim();
  var endpoint = base ? base.replace(/\/$/, '') + '/api/v1/comunicacao' : LEXIS_MONITOR_V5.DJEN_BASE;
  var url = endpoint
    + '?numeroProcesso=' + encodeURIComponent(formatCNJ_(item.cnj))
    + '&pagina=1&itensPorPagina=100';

  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {Accept: 'application/json'}
    });
  } catch (e) {
    return {ok:false, http:0, error:'DJEN fetch: ' + e.message};
  }

  var http = resp.getResponseCode();
  var text = resp.getContentText();
  var props = PropertiesService.getScriptProperties();

  if (http === 429) {
    props.setProperty('DJEN_RATE_LIMIT_UNTIL', String(Date.now() + 61000));
    setConfigValue_('Último erro DJEN', 'DJEN HTTP 429: rate limit. Pausa automática de 1 minuto; DataJud continua.');
    return {ok:false, http:http, error:'DJEN HTTP 429: aguardando janela de rate limit.'};
  }
  if (http === 403) {
    props.setProperty('DJEN_BLOCKED_UNTIL', String(Date.now() + LEXIS_MONITOR_V5.DJEN_BLOCK_HOURS * 3600000));
    setConfigValue_('Último erro DJEN', 'DJEN HTTP 403: origem bloqueada. Pausa de ' + LEXIS_MONITOR_V5.DJEN_BLOCK_HOURS + 'h; DataJud continua.');
    return {ok:false, http:http, error:'DJEN HTTP 403: origem bloqueada; último dado válido preservado.'};
  }
  if (http !== 200) return {ok:false, http:http, error:'DJEN HTTP ' + http + ': ' + limita_(text, 350)};

  var data;
  try { data = JSON.parse(text); }
  catch (e) { return {ok:false, http:http, error:'DJEN retornou JSON inválido.'}; }

  var items = Array.isArray(data && data.items) ? data.items : [];
  if (!items.length) return {ok:true, http:http, found:false};

  var latest = null;
  items.forEach(function(x) {
    var dt = parseDate_(x.data_disponibilizacao || x.datadisponibilizacao || x.dataDisponibilizacao);
    if (!latest || (dt && (!latest.date || dt > latest.date))) {
      latest = {
        id: String(x.id || x.hash || ''),
        date: dt,
        hash: String(x.hash || ''),
        type: String(x.tipoComunicacao || x.tipo_comunicacao || ''),
        document: String(x.tipoDocumento || ''),
        orgao: String(x.nomeOrgao || ''),
        tribunal: String(x.siglaTribunal || ''),
        resumo: plainText_(x.texto || x.resumo || ''),
        destinatario: destinatario_(x)
      };
    }
  });

  setConfigValue_('Último erro DJEN', '');
  return {ok:true, http:http, found:true, latest:latest};
}

function construirPatchLinhaV5_(item, dj, de, now) {
  var r = item.r;
  var novidade = false;
  var source = [];
  var errors = [];
  var legacy = null;
  var novoLegacy = null;
  var monitor = r.slice(LEXIS_MONITOR_V5.COL.DJ_MOV - 1, LEXIS_MONITOR_V5.COL.DJEN_DATE);
  var oldDjKey = String(r[LEXIS_MONITOR_V5.COL.DATAJUD_KEY - 1] || '');
  var oldDjenId = String(r[LEXIS_MONITOR_V5.COL.DJEN_ID - 1] || '');
  var datajudNoResult = false;
  var dataLogs = [];
  var djenLogs = [];

  if (dj && dj.ok && dj.found && dj.latest) {
    var x = dj.latest;
    var key = [Utilities.formatDate(x.date, LEXIS_MONITOR_V5.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"), x.code, x.name].join('|');
    var oldLegacyDate = parseDate_(r[LEXIS_MONITOR_V5.COL.DATA_MOV - 1]);
    var oldLegacyName = String(r[LEXIS_MONITOR_V5.COL.ANDAMENTO - 1] || '');
    if (oldDjKey && key !== oldDjKey) novidade = true;
    if (!oldDjKey && oldLegacyDate && (x.date.getTime() > oldLegacyDate.getTime() + 60000 || (oldLegacyName && oldLegacyName !== x.name))) novidade = true;

    legacy = [x.date, x.name];
    novoLegacy = novidade ? 'SIM' : 'NAO';
    monitor[0] = x.name;
    monitor[1] = x.date;
    monitor[10] = key;
    source.push('DataJud');
    if (key !== oldDjKey) dataLogs.push([new Date(), item.cnj, x.date, x.name, x.orgao, key]);
    if (dj.partial) errors.push(dj.error || 'DataJud respondeu parcialmente.');
  } else if (dj && dj.ok && dj.found && !dj.latest) {
    source.push('DataJud');
    errors.push('DataJud localizou o processo, mas não retornou movimentações públicas no payload.');
  } else if (dj && dj.ok && !dj.found) {
    datajudNoResult = true;
    errors.push('DataJud: sem retorno público para este CNJ nesta consulta; isso não prova inexistência do processo.');
  } else {
    errors.push((dj && dj.error) || 'Erro DataJud');
  }

  if (de && de.ok && de.found && de.latest) {
    var y = de.latest;
    var summary = [y.type, y.document, y.orgao, y.resumo].filter(Boolean).join(' — ');
    if (oldDjenId && y.id && y.id !== oldDjenId) novidade = true;
    monitor[2] = limita_(summary, 2000);
    if (y.date) monitor[3] = y.date;
    if (y.id) monitor[11] = y.id;
    if (y.date) monitor[12] = y.date;
    source.push('DJEN');
    if (y.id && y.id !== oldDjenId) djenLogs.push([new Date(), item.cnj, y.date, y.type, y.orgao, y.destinatario, limita_(summary, 2000), y.id]);
  } else if (de && de.skipped) {
    // Pausa do DJEN não contamina um DataJud válido.
  } else if (de && !de.ok) {
    errors.push(de.error || 'Erro DJEN');
  }

  var datajudComplete = Boolean(dj && dj.ok && !dj.partial && !datajudNoResult);
  var status = datajudComplete ? 'OK' : ((dj && dj.ok) ? 'PARCIAL' : 'ERRO');

  monitor[4] = novidade ? 'SIM' : 'NÃO';
  monitor[5] = source.length ? source.join(' + ') : 'Nenhuma';
  monitor[6] = now;
  monitor[7] = proximaSync_(r[LEXIS_MONITOR_V5.COL.SITUACAO_RETORNO - 1], status, now, datajudNoResult);
  monitor[8] = status;
  monitor[9] = errors.join(' | ');

  return {
    row: item.rowNumber,
    novidade: novidade,
    status: status,
    legacy: legacy,
    novoLegacy: novoLegacy,
    monitor: monitor,
    dataLogs: dataLogs,
    djenLogs: djenLogs
  };
}

function aplicarPatchIndividualV5_(ss, sh, p) {
  if (p.legacy) sh.getRange(p.row, LEXIS_MONITOR_V5.COL.DATA_MOV, 1, 2).setValues([p.legacy]);
  if (p.novoLegacy !== null) sh.getRange(p.row, LEXIS_MONITOR_V5.COL.NOVO_ANDAMENTO_LEGACY).setValue(p.novoLegacy);
  sh.getRange(
    p.row,
    LEXIS_MONITOR_V5.COL.DJ_MOV,
    1,
    LEXIS_MONITOR_V5.COL.DJEN_DATE - LEXIS_MONITOR_V5.COL.DJ_MOV + 1
  ).setValues([p.monitor]);

  if (p.dataLogs && p.dataLogs.length) {
    var ds = ss.getSheetByName(LEXIS_MONITOR_V5.DATAJUD_LOG);
    ds.getRange(ds.getLastRow() + 1, 1, p.dataLogs.length, 6).setValues(p.dataLogs);
  }
  if (p.djenLogs && p.djenLogs.length) {
    var es = ss.getSheetByName(LEXIS_MONITOR_V5.DJEN_LOG);
    es.getRange(es.getLastRow() + 1, 1, p.djenLogs.length, 8).setValues(p.djenLogs);
  }
}

function parseDataJudResponse_(resp,item) {
  const http=resp.getResponseCode();
  const text=resp.getContentText();
  if (http!==200) return {ok:false,http,error:'DataJud HTTP '+http+': '+limita_(text,500)};
  let data;
  try { data=JSON.parse(text); } catch(e) { return {ok:false,http,error:'DataJud retornou JSON inválido.'}; }
  const failed=Number(data?._shards?.failed||0);
  const hits=Array.isArray(data?.hits?.hits)?data.hits.hits:[];
  if (!hits.length) return {ok:true,http,found:false,partial:failed>0,error:failed?'DataJud parcial: shards com falha.':''};
  let latest=null;
  hits.forEach(h=> {
    const src=h && h._source || {};
    const moves=Array.isArray(src.movimentos)?src.movimentos:[];
    moves.forEach(m=> {
      const dt=parseDate_(m?.dataHora);
      if (!dt) return;
      const candidate={
        date:dt, name:String(m?.nome||'Movimentação sem descrição'), code:String(m?.codigo||''),
        orgao:String(m?.orgaoJulgador?.nomeOrgao || m?.orgaoJulgador?.nome || src?.orgaoJulgador?.nome || ''),
        tribunal:String(src?.tribunal||''), grau:String(src?.grau||'')
      };
      if (!latest || candidate.date>latest.date) latest=candidate;
    });
  });
  return {ok:true,http,found:true,latest,partial:failed>0,error:failed?'DataJud respondeu parcialmente ('+failed+' shard(s) com falha).':''};
}

function prioridade_(stRet,stSync,lastSync) {
  if (stRet==='VENCIDO') return 0;
  if (stRet==='ATENÇÃO') return 1;
  if (/ERRO|PARCIAL/.test(stSync)) return 2;
  if (!lastSync) return 3;
  if (stRet==='EM DIA') return 4;
  return 5;
}
function proximaSync_(stRet,stSync,now,datajudNoResult) {
  let minutes;
  if (stSync==='ERRO') minutes=30;
  else if (datajudNoResult) minutes=360;
  else if (stSync==='PARCIAL') minutes=90;
  else if (stRet==='VENCIDO' || stRet==='ATENÇÃO') minutes=60;
  else if (stRet==='EM DIA') minutes=360;
  else minutes=720;
  return new Date(now.getTime()+minutes*60000);
}

function tribunalAlias_(cnj,tribunalCell) {
  const t=String(tribunalCell||'').toUpperCase().replace(/[^A-Z0-9-]/g,'');
  if (/^TJ[A-Z]{2}$/.test(t)) return t.toLowerCase();
  if (/^TRF0?[1-6]$/.test(t)) return 'trf'+Number(t.replace(/\D/g,''));
  if (/^TRT0?[1-9]$|^TRT1\d$|^TRT2[0-4]$/.test(t)) return 'trt'+Number(t.replace(/\D/g,''));
  if (/^TRE-?[A-Z]{2,3}$/.test(t)) return 'tre-'+t.replace(/^TRE-?/,'').toLowerCase();
  if (['TST','TSE','STJ','STM'].includes(t)) return t.toLowerCase();
  if (['TJMMG','TJMRS','TJMSP'].includes(t)) return t.toLowerCase();

  if (!cnj || cnj.length!==20) return '';
  const j=cnj.charAt(13), tr=cnj.substr(14,2), n=Number(tr);
  const uf={1:'ac',2:'al',3:'ap',4:'am',5:'ba',6:'ce',7:'dft',8:'es',9:'go',10:'ma',11:'mt',12:'ms',13:'mg',14:'pa',15:'pb',16:'pr',17:'pe',18:'pi',19:'rj',20:'rn',21:'rs',22:'ro',23:'rr',24:'sc',25:'se',26:'sp',27:'to'};
  if (j==='8' && uf[n]) return 'tj'+uf[n];
  if (j==='4' && n>=1 && n<=6) return 'trf'+n;
  if (j==='5') return n===0 ? 'tst' : (n>=1&&n<=24?'trt'+n:'');
  if (j==='6') return n===0 ? 'tse' : (uf[n]?'tre-'+uf[n]:'');
  if (j==='7') return 'stm';
  if (j==='3') return 'stj';
  if (j==='9') return n===13?'tjmmg':n===21?'tjmrs':n===26?'tjmsp':'';
  return '';
}

function formatCNJ_(cnj) {
  var s=String(cnj||'').replace(/\D/g,'');
  if(s.length!==20)return String(cnj||'');
  return s.slice(0,7)+'-'+s.slice(7,9)+'.'+s.slice(9,13)+'.'+s.slice(13,14)+'.'+s.slice(14,16)+'.'+s.slice(16,20);
}
function normalizeCNJ_(v) {
  if (v===null || v===undefined) return '';
  let s=String(v).trim().replace(/[Oo]/g,'0').replace(/\D/g,'');
  return s.length===20 ? s : '';
}
function parseDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));

  var s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    var iso = new Date(s);
    if (!isNaN(iso)) return iso;
  }

  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));

  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));

  var d = new Date(s);
  return isNaN(d) ? null : d;
}
function inicioDia_(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function limita_(s,n){ s=String(s||''); return s.length>n?s.slice(0,n-1)+'…':s; }
function plainText_(html) {
  return limita_(String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/\s+/g,' ').trim(),1200);
}
function destinatario_(x) {
  const ds=Array.isArray(x?.destinatarios)?x.destinatarios:[];
  return ds.map(d=>d?.nome).filter(Boolean).slice(0,3).join(', ');
}

function LIMPAR_LOG_ERROS_ANTIGOS_V5() {
  var ss = getSpreadsheetV5_();
  var log = ss.getSheetByName(LEXIS_MONITOR_V5.RUN_LOG);
  if (!log || log.getLastRow() < 2) return 0;

  var last = log.getLastRow();
  var data = log.getRange(2, 1, last - 1, 6).getValues();
  var keep = [];
  var removed = 0;

  data.forEach(function(r) {
    var obs = String(r[5] || '');
    var antigo =
      obs.indexOf('aba Retorno') >= 0 ||
      obs.indexOf('Coluna CNJ/PROCESSO não encontrada') >= 0 ||
      obs.indexOf('coluna do número do processo/CNJ') >= 0;
    if (antigo) removed++;
    else keep.push(r);
  });

  log.getRange(2, 1, Math.max(1, last - 1), 6).clearContent();
  if (keep.length) log.getRange(2, 1, keep.length, 6).setValues(keep);
  return removed;
}

function TESTAR_LINHA_ATIVA_V5() {
  var ss = getSpreadsheetV5_();
  var sh = getMainSheetV5_(ss);
  var range = sh.getActiveRange();
  var row = range ? range.getRow() : 2;
  if (row < 2) row = 2;

  var lastCol = Math.max(LEXIS_MONITOR_V5.COL.DJEN_DATE, sh.getLastColumn());
  var r = sh.getRange(row, 1, 1, lastCol).getValues()[0];
  var cnj = normalizeCNJ_(r[LEXIS_MONITOR_V5.COL.PROTOCOLO - 1]);
  if (!cnj) throw new Error('A linha ' + row + ' não possui CNJ válido em F (Protocolo).');

  var key = String(getConfigValue_('DataJud API Key') || '').trim() || ATUALIZAR_CHAVE_DATAJUD();
  var item = {rowNumber: row, r: r, cnj: cnj};
  var dj = consultarDataJudUmV5_(item, key);
  var cfg = getConfigMap_();
  var de = djenPodeRodarV5_(cfg) ? consultarDjenUmV5_(item, cfg) : {skipped:true};
  var patch = construirPatchLinhaV5_(item, dj, de, new Date());
  aplicarPatchIndividualV5_(ss, sh, patch);
  SpreadsheetApp.flush();

  var msg = [
    'Linha: ' + row,
    'CNJ: ' + cnj,
    'DataJud: ' + (dj.ok ? (dj.found ? 'OK' : 'sem retorno') : ('ERRO ' + (dj.http || '') + ' ' + (dj.error || ''))),
    'Último movimento: ' + (dj.latest ? (Utilities.formatDate(dj.latest.date, LEXIS_MONITOR_V5.TIMEZONE, 'dd/MM/yyyy HH:mm') + ' — ' + dj.latest.name) : 'não retornado'),
    'DJEN: ' + (de.skipped ? 'pausado' : de.ok ? (de.found ? 'OK' : 'sem publicação') : ('ERRO ' + (de.http || '') + ' ' + (de.error || '')))
  ].join('\n');

  SpreadsheetApp.getUi().alert('Teste V5', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  return {datajud:dj, djen:de};
}

function DIAGNOSTICO_GATILHOS_V5() {
  var list = ScriptApp.getProjectTriggers().map(function(t) {
    return t.getHandlerFunction() + ' / ' + t.getEventType();
  });
  SpreadsheetApp.getUi().alert('Gatilhos instalados', list.length ? list.join('\n') : 'Nenhum gatilho instalado.', SpreadsheetApp.getUi().ButtonSet.OK);
  return list;
}

function DIAGNOSTICO_MONITORAMENTO() {
  const ss=getSpreadsheetV5_();
  const sh=getMainSheetV5_(ss);
  const last=sh.getLastRow();
  const vals=last>1?sh.getRange(2,1,last-1,LEXIS_MONITOR_V5.COL.DJEN_DATE).getValues():[];
  const stats={total:0,cnjValido:0,vencido:0,atencao:0,emDia:0,semData:0,ok:0,parcial:0,erro:0,datajud:0,djen:0};
  vals.forEach(r=>{
    if (r[LEXIS_MONITOR_V5.COL.PROTOCOLO-1]!=='' ) stats.total++;
    if (normalizeCNJ_(r[LEXIS_MONITOR_V5.COL.PROTOCOLO-1])) stats.cnjValido++;
    const s=String(r[LEXIS_MONITOR_V5.COL.SITUACAO_RETORNO-1]||'');
    if(s==='VENCIDO')stats.vencido++; else if(s==='ATENÇÃO')stats.atencao++; else if(s==='EM DIA')stats.emDia++; else stats.semData++;
    const sync=String(r[LEXIS_MONITOR_V5.COL.STATUS_SYNC-1]||'');
    if(sync==='OK')stats.ok++; else if(sync==='PARCIAL')stats.parcial++; else if(sync==='ERRO')stats.erro++;
    if(r[LEXIS_MONITOR_V5.COL.DJ_MOV-1])stats.datajud++;
    if(r[LEXIS_MONITOR_V5.COL.DJEN_RESUMO-1])stats.djen++;
  });
  SpreadsheetApp.getUi().alert('Diagnóstico', JSON.stringify(stats,null,2), SpreadsheetApp.getUi().ButtonSet.OK);
  return stats;
}


/* ===== Compatibilidade com nomes de rotinas antigas ===== */
function RODAR_MONITORAMENTO() { return RODAR_MONITORAMENTO_V5(); }
function SINCRONIZAR_AUTOMATICO() { return RODAR_MONITORAMENTO_V5(); }
function SINCRONIZAR_LOTE_AUTOMATICO() { return RODAR_MONITORAMENTO_V5(); }
function MONITORAR_AUTOMATICO() { return RODAR_MONITORAMENTO_V5(); }
function MONITORAR_PROCESSOS() { return RODAR_MONITORAMENTO_V5(); }
function EXECUCAO_AUTOMATICA() { return RODAR_MONITORAMENTO_V5(); }
function EXECUTAR_MONITORAMENTO() { return RODAR_MONITORAMENTO_V5(); }
function executarCiclo() { return RODAR_MONITORAMENTO_V5(); }
function PROCESSAR_FILA() { return RODAR_MONITORAMENTO_V5(); }
function ATUALIZAR_AUTOMATICO() { return RODAR_MONITORAMENTO_V5(); }
function SINCRONIZAR_PLANILHA() { return RODAR_MONITORAMENTO_V5(); }
function SETUP_PLANILHA_GRATUITA() { return RESET_TOTAL_E_INSTALAR_V5(); }


/* ===== Compatibilidade adicional V4 -> V5 ===== */
function RESET_TOTAL_E_INSTALAR_V4(){ return RESET_TOTAL_E_INSTALAR_V5(); }
function RODAR_MONITORAMENTO_V4(){ return RODAR_MONITORAMENTO_V5(); }
function TESTAR_LINHA_ATIVA_V4(){ return TESTAR_LINHA_ATIVA_V5(); }
function DIAGNOSTICO_GATILHOS_V4(){ return DIAGNOSTICO_GATILHOS_V5(); }
function LIMPAR_LOG_ERROS_ANTIGOS_V4(){ return LIMPAR_LOG_ERROS_ANTIGOS_V5(); }
