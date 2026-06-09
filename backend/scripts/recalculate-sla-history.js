const crypto = require('crypto');
const pool = require('../config/database');

const APPLY = process.argv.includes('--apply');
const requestedModule = process.argv.find(argument => argument.startsWith('--module='))
  ?.split('=')[1]
  ?.toLowerCase();

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;

const MODULES = {
  ti: {
    table: 'chamados',
    historyTable: 'chamado_historico',
    defaultPriority: 'normal',
    slaByPriority: {
      urgente: { firstResponseMinutes: 30, resolutionMinutes: 240 },
      alta: { firstResponseMinutes: 60, resolutionMinutes: 480 },
      normal: { firstResponseMinutes: 120, resolutionMinutes: 1440 },
      baixa: { firstResponseMinutes: 240, resolutionMinutes: 2880 }
    },
    pausedStatuses: new Set(['triagem', 'aguardando_usuario', 'aguardando_fornecedor', 'pausado']),
    userWaitingStatuses: new Set(['aguardando_usuario']),
    vendorWaitingStatuses: new Set(['aguardando_fornecedor', 'pausado'])
  },
  infra: {
    table: 'infra_chamados',
    historyTable: 'infra_historico',
    defaultPriority: 'media',
    slaByPriority: {
      critica: { firstResponseMinutes: 30, resolutionMinutes: 240 },
      alta: { firstResponseMinutes: 120, resolutionMinutes: 600 },
      media: { firstResponseMinutes: 600, resolutionMinutes: 1800 },
      baixa: { firstResponseMinutes: 1200, resolutionMinutes: 3000 }
    },
    pausedStatuses: new Set([
      'aguardando_informacoes',
      'aguardando_aprovacao',
      'aguardando_orcamento',
      'aguardando_fornecedor',
      'pendente_material',
      'pendente_agendamento'
    ]),
    userWaitingStatuses: new Set(['aguardando_informacoes', 'aguardando_aprovacao']),
    vendorWaitingStatuses: new Set([
      'aguardando_orcamento',
      'aguardando_fornecedor',
      'pendente_material',
      'pendente_agendamento'
    ])
  }
};

function isBusinessDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function startOfBusinessDay(date) {
  const value = new Date(date);
  value.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  return value;
}

function endOfBusinessDay(date) {
  const value = new Date(date);
  value.setHours(BUSINESS_END_HOUR, 0, 0, 0);
  return value;
}

function moveToNextBusinessStart(date) {
  const next = new Date(date);
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }

  const dayStart = startOfBusinessDay(next);
  const dayEnd = endOfBusinessDay(next);
  if (next < dayStart) return dayStart;
  if (next >= dayEnd) {
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    return moveToNextBusinessStart(next);
  }
  return next;
}

function addBusinessMinutes(date, minutes) {
  let current = moveToNextBusinessStart(date);
  let remaining = Math.max(0, Number(minutes) || 0);
  while (remaining > 0) {
    const businessEnd = endOfBusinessDay(current);
    const available = Math.max(0, Math.floor((businessEnd.getTime() - current.getTime()) / 60000));
    if (remaining <= available) return new Date(current.getTime() + remaining * 60000);
    remaining -= available;
    current = moveToNextBusinessStart(new Date(businessEnd.getTime() + 60000));
  }
  return current;
}

function secondsBetween(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

function toSqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function calculateDueDates(config, ticket) {
  const priorityConfig = config.slaByPriority[ticket.priority]
    || config.slaByPriority[config.defaultPriority];
  const start = moveToNextBusinessStart(ticket.opened_at);
  return {
    firstResponseDueAt: addBusinessMinutes(start, priorityConfig.firstResponseMinutes),
    resolutionDueAt: addBusinessMinutes(start, priorityConfig.resolutionMinutes)
  };
}

function getInitialStatus(ticket, events) {
  const firstEvent = events[0];
  return firstEvent?.from_status || firstEvent?.to_status || ticket.status;
}

function reconstructTiming(config, ticket, history, referenceDate) {
  const reference = new Date(referenceDate);
  const openedAt = new Date(ticket.opened_at);
  const events = history
    .filter(item => item.to_status && new Date(item.created_at) <= reference)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);

  let currentStatus = getInitialStatus(ticket, events);
  let cursor = openedAt;
  let pausedSeconds = 0;
  let waitingUserSeconds = 0;
  let waitingVendorSeconds = 0;
  let activePauseStartedAt = null;

  const addSegment = (status, start, end, isFinalSegment = false) => {
    const seconds = secondsBetween(start, end);
    if (!config.pausedStatuses.has(status) || seconds <= 0) return;
    if (isFinalSegment && !ticket.resolved_at && status === ticket.status) {
      activePauseStartedAt = start;
      return;
    }
    pausedSeconds += seconds;
    if (config.userWaitingStatuses.has(status)) waitingUserSeconds += seconds;
    if (config.vendorWaitingStatuses.has(status)) waitingVendorSeconds += seconds;
  };

  for (const event of events) {
    const eventDate = new Date(event.created_at);
    if (eventDate < openedAt) continue;
    addSegment(currentStatus, cursor, eventDate);
    currentStatus = event.to_status || currentStatus;
    cursor = eventDate > cursor ? eventDate : cursor;
  }

  addSegment(currentStatus, cursor, reference, true);
  return { pausedSeconds, waitingUserSeconds, waitingVendorSeconds, activePauseStartedAt };
}

function getSlaFlag(referenceDate, dueDate, pausedSeconds) {
  if (!referenceDate || !dueDate) return null;
  const adjustedDue = new Date(dueDate).getTime() + pausedSeconds * 1000;
  return new Date(referenceDate).getTime() <= adjustedDue ? 1 : 0;
}

function hasChanges(ticket, values) {
  const comparable = {
    paused_seconds: values.pausedSeconds,
    waiting_user_seconds: values.waitingUserSeconds,
    waiting_vendor_seconds: values.waitingVendorSeconds,
    sla_paused_at: toSqlDateTime(values.activePauseStartedAt),
    first_response_due_at: toSqlDateTime(values.firstResponseDueAt),
    resolution_due_at: toSqlDateTime(values.resolutionDueAt),
    sla_first_response_met: values.firstResponseMet,
    sla_resolution_met: values.resolutionMet
  };

  return Object.entries(comparable).some(([field, value]) => {
    if (field.endsWith('_at')) return toSqlDateTime(ticket[field]) !== value;
    return Number(ticket[field] ?? -1) !== Number(value ?? -1);
  });
}

async function loadModuleData(connection, config) {
  const [tickets] = await connection.query(`SELECT * FROM ${config.table} ORDER BY id`);
  const [history] = await connection.query(
    `SELECT id, chamado_id, action_type, from_status, to_status, created_at
       FROM ${config.historyTable}
      WHERE from_status IS NOT NULL OR to_status IS NOT NULL
      ORDER BY chamado_id, created_at, id`
  );
  const historyByTicket = new Map();
  for (const item of history) {
    if (!historyByTicket.has(item.chamado_id)) historyByTicket.set(item.chamado_id, []);
    historyByTicket.get(item.chamado_id).push(item);
  }
  return { tickets, historyByTicket };
}

async function ensureBackupTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS sla_recalculation_backup (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      run_id VARCHAR(50) NOT NULL,
      module_name VARCHAR(20) NOT NULL,
      chamado_id INT NOT NULL,
      previous_values TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sla_backup_run_id (run_id),
      INDEX idx_sla_backup_ticket (module_name, chamado_id)
    )
  `);
}

async function applyUpdate(connection, config, moduleName, runId, ticket, values) {
  const previousValues = {
    paused_seconds: ticket.paused_seconds,
    waiting_user_seconds: ticket.waiting_user_seconds,
    waiting_vendor_seconds: ticket.waiting_vendor_seconds,
    sla_paused_at: ticket.sla_paused_at,
    first_response_due_at: ticket.first_response_due_at,
    resolution_due_at: ticket.resolution_due_at,
    sla_first_response_met: ticket.sla_first_response_met,
    sla_resolution_met: ticket.sla_resolution_met
  };

  await connection.query(
    `INSERT INTO sla_recalculation_backup
       (run_id, module_name, chamado_id, previous_values)
     VALUES (?, ?, ?, ?)`,
    [runId, moduleName, ticket.id, JSON.stringify(previousValues)]
  );
  await connection.query(
    `UPDATE ${config.table}
        SET paused_seconds = ?,
            waiting_user_seconds = ?,
            waiting_vendor_seconds = ?,
            sla_paused_at = ?,
            first_response_due_at = ?,
            resolution_due_at = ?,
            sla_first_response_met = ?,
            sla_resolution_met = ?
      WHERE id = ?`,
    [
      values.pausedSeconds,
      values.waitingUserSeconds,
      values.waitingVendorSeconds,
      toSqlDateTime(values.activePauseStartedAt),
      toSqlDateTime(values.firstResponseDueAt),
      toSqlDateTime(values.resolutionDueAt),
      values.firstResponseMet,
      values.resolutionMet,
      ticket.id
    ]
  );
}

async function processModule(connection, moduleName, config, runId) {
  const { tickets, historyByTicket } = await loadModuleData(connection, config);
  const changes = [];
  const skipped = [];

  for (const ticket of tickets) {
    if (!ticket.opened_at) {
      skipped.push({ id: ticket.id, ticket: ticket.ticket_number, reason: 'sem data de abertura' });
      continue;
    }

    const history = historyByTicket.get(ticket.id) || [];
    const referenceDate = ticket.resolved_at || new Date();
    const timing = reconstructTiming(config, ticket, history, referenceDate);
    const firstResponseTiming = ticket.first_response_at
      ? reconstructTiming(config, ticket, history, ticket.first_response_at)
      : null;
    const dueDates = calculateDueDates(config, ticket);
    const values = {
      ...timing,
      ...dueDates,
      firstResponseMet: ticket.first_response_at
        ? getSlaFlag(
          ticket.first_response_at,
          dueDates.firstResponseDueAt,
          firstResponseTiming.pausedSeconds
        )
        : null,
      resolutionMet: ticket.resolved_at
        ? getSlaFlag(ticket.resolved_at, dueDates.resolutionDueAt, timing.pausedSeconds)
        : null
    };

    if (!hasChanges(ticket, values)) continue;
    changes.push({
      id: ticket.id,
      ticket: ticket.ticket_number || `#${ticket.id}`,
      status: ticket.status,
      oldPause: Number(ticket.paused_seconds || 0),
      newPause: values.pausedSeconds,
      oldSla: ticket.sla_resolution_met,
      newSla: values.resolutionMet
    });
    if (APPLY) await applyUpdate(connection, config, moduleName, runId, ticket, values);
  }

  console.log(`\n${moduleName.toUpperCase()}: ${changes.length} chamado(s) com alteracao.`);
  console.table(changes);
  if (skipped.length) {
    console.log(`${moduleName.toUpperCase()}: ${skipped.length} chamado(s) ignorado(s).`);
    console.table(skipped);
  }
  return changes.length;
}

async function main() {
  if (requestedModule && !MODULES[requestedModule]) {
    throw new Error('Modulo invalido. Use --module=ti ou --module=infra.');
  }

  const connection = await pool.getConnection();
  const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
  let changed = 0;
  try {
    if (APPLY) {
      await ensureBackupTable(connection);
      await connection.beginTransaction();
    }
    for (const [moduleName, config] of Object.entries(MODULES)) {
      if (requestedModule && requestedModule !== moduleName) continue;
      changed += await processModule(connection, moduleName, config, runId);
    }
    if (APPLY) await connection.commit();
    console.log(`\nModo: ${APPLY ? 'APLICADO' : 'PREVIA'}`);
    console.log(`Total de chamados afetados: ${changed}`);
    if (APPLY) console.log(`Backup da execucao: ${runId}`);
    else console.log('Nenhuma alteracao foi gravada. Execute novamente com --apply para confirmar.');
  } catch (error) {
    if (APPLY) await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Erro ao recalcular SLA:', error);
  process.exit(1);
});
