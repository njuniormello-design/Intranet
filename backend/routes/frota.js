const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '../uploads/frota');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const STATUSES = [
  'aberto',
  'triagem',
  'em_atendimento',
  'aguardando_informacoes',
  'aguardando_aprovacao',
  'aguardando_orcamento',
  'aguardando_fornecedor',
  'aguardando_peca',
  'aguardando_agendamento',
  'manutencao_externa',
  'veiculo_indisponivel',
  'resolvido',
  'validado_usuario',
  'finalizado',
  'cancelado',
  'reaberto'
];
const PAUSED_STATUSES = [
  'aguardando_informacoes',
  'aguardando_aprovacao',
  'aguardando_orcamento',
  'aguardando_fornecedor',
  'aguardando_peca',
  'aguardando_agendamento',
  'manutencao_externa'
];
const CLOSED_STATUSES = ['finalizado', 'cancelado'];
const RESOLVED_STATUSES = ['resolvido'];
const FIRST_RESPONSE_STATUSES = ['triagem', 'em_atendimento', 'resolvido', 'validado_usuario', 'finalizado'];
const SERVICE_STARTED_STATUSES = ['em_atendimento', 'resolvido', 'validado_usuario', 'finalizado'];
const PRIORITIES = ['baixa', 'media', 'alta', 'critica'];
const VEHICLE_TYPES = ['carro', 'caminhao', 'caminhonete', 'utilitario', 'moto', 'guindauto_munck', 'cesto_aereo', 'outro'];
const VEHICLE_STATUSES = ['disponivel', 'em_uso', 'indisponivel', 'em_manutencao', 'aguardando_fornecedor', 'aguardando_peca', 'aguardando_orcamento', 'reservado', 'baixado'];
const REQUEST_TYPES = [
  'manutencao_corretiva',
  'manutencao_preventiva',
  'pane_mecanica',
  'pane_eletrica',
  'troca_pneus',
  'alinhamento_balanceamento',
  'freios',
  'suspensao',
  'bateria',
  'troca_oleo',
  'revisao_periodica',
  'lavagem_higienizacao',
  'abastecimento',
  'documentacao',
  'licenciamento',
  'seguro',
  'sinistro_acidente',
  'multa',
  'rastreador_gps',
  'solicitacao_veiculo',
  'devolucao_veiculo',
  'indisponibilidade',
  'guincho',
  'outro'
];
const SLA_BY_PRIORITY = {
  critica: { firstResponseMinutes: 30, resolutionMinutes: 240 },
  alta: { firstResponseMinutes: 120, resolutionMinutes: 600 },
  media: { firstResponseMinutes: 600, resolutionMinutes: 1800 },
  baixa: { firstResponseMinutes: 1200, resolutionMinutes: 3000 }
};
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDir),
  filename: (req, file, callback) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${file.fieldname}-${suffix}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || `${5 * 1024 * 1024}`, 10) },
  fileFilter: (req, file, callback) => {
    const allowed = /(image\/jpeg|image\/jpg|image\/png|image\/gif|image\/webp|application\/pdf)/.test(file.mimetype);
    callback(allowed ? null : new Error('Tipo de arquivo nao permitido'), allowed);
  }
});

function normalizeString(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'sim', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function assertTicketAccess(req, ticket) {
  if (!ticket) {
    const error = new Error('Chamado de frota nao encontrado');
    error.statusCode = 404;
    throw error;
  }
  if (!isAdmin(req.user) && Number(ticket.user_id) !== Number(req.user.id)) {
    const error = new Error('Voce nao tem permissao para acessar este chamado');
    error.statusCode = 403;
    throw error;
  }
}

function requireFrotaModule(req, res, next) {
  if (isAdmin(req.user) || (Array.isArray(req.user?.modules) && req.user.modules.includes('frota'))) return next();
  return res.status(403).json({ error: 'Seu perfil nao possui acesso ao modulo Frota' });
}

function validateRequest(req, res) {
  const validation = validationResult(req);
  if (validation.isEmpty()) return true;
  cleanupFiles(req.files);
  res.status(400).json({ errors: validation.array() });
  return false;
}

function cleanupFiles(files = []) {
  for (const file of files || []) {
    if (!file?.path || !fs.existsSync(file.path)) continue;
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error('Erro ao remover anexo temporario de frota:', error);
    }
  }
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function moveToBusinessStart(date) {
  const next = new Date(date);
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }
  const start = new Date(next);
  start.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  const end = new Date(next);
  end.setHours(BUSINESS_END_HOUR, 0, 0, 0);
  if (next < start) return start;
  if (next >= end) {
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    return moveToBusinessStart(next);
  }
  return next;
}

function addBusinessMinutes(date, minutes) {
  let current = moveToBusinessStart(date);
  let remaining = Math.max(0, Number(minutes) || 0);
  while (remaining > 0) {
    const end = new Date(current);
    end.setHours(BUSINESS_END_HOUR, 0, 0, 0);
    const available = Math.max(0, Math.floor((end.getTime() - current.getTime()) / 60000));
    if (remaining <= available) return new Date(current.getTime() + remaining * 60000);
    remaining -= available;
    current = moveToBusinessStart(new Date(end.getTime() + 60000));
  }
  return current;
}

function calculateSla(priority, openedAt) {
  const config = SLA_BY_PRIORITY[priority] || SLA_BY_PRIORITY.media;
  return {
    firstResponseDueAt: addBusinessMinutes(openedAt, config.firstResponseMinutes),
    resolutionDueAt: addBusinessMinutes(openedAt, config.resolutionMinutes)
  };
}

function toSqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function secondsBetween(startDate, endDate = new Date()) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

function totalPausedSeconds(chamado, referenceDate = new Date()) {
  const saved = Math.max(0, Number(chamado?.paused_seconds) || 0);
  if (!chamado?.sla_paused_at || !PAUSED_STATUSES.includes(chamado.status)) return saved;
  return saved + secondsBetween(chamado.sla_paused_at, referenceDate);
}

function slaFlag(referenceDate, dueDate, chamado = null) {
  if (!referenceDate || !dueDate) return null;
  const adjustedDue = new Date(dueDate).getTime() + totalPausedSeconds(chamado, referenceDate) * 1000;
  return new Date(referenceDate).getTime() <= adjustedDue ? 1 : 0;
}

function slaState(chamado) {
  if (chamado.sla_resolution_met === 1) return 'dentro_sla';
  if (chamado.sla_resolution_met === 0) return 'fora_sla';
  if (PAUSED_STATUSES.includes(chamado.status)) return 'pausado';
  if (!chamado.resolution_due_at) return 'em_andamento';
  const adjustedDue = new Date(chamado.resolution_due_at).getTime() + totalPausedSeconds(chamado) * 1000;
  return Date.now() <= adjustedDue ? 'dentro_sla' : 'fora_sla';
}

function suggestedPriority(body) {
  if (normalizeBoolean(body.safety_risk)) return 'critica';
  if (normalizeBoolean(body.needs_tow)) return 'critica';
  if (!normalizeBoolean(body.vehicle_in_operation) || normalizeBoolean(body.activity_interrupted)) return 'alta';
  if (body.request_type === 'manutencao_preventiva') return ['baixa', 'media'].includes(body.priority) ? body.priority : 'media';
  return PRIORITIES.includes(body.priority) ? body.priority : 'media';
}

async function recordHistory(connection, chamadoId, userId, actionType, payload = {}) {
  await connection.query(
    `INSERT INTO frota_historico
       (chamado_id, changed_by, action_type, field_name, old_value, new_value, from_status, to_status, observation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      chamadoId,
      userId || null,
      actionType,
      payload.fieldName || null,
      payload.oldValue || null,
      payload.newValue || null,
      payload.fromStatus || null,
      payload.toStatus || null,
      payload.observation || null
    ]
  );
}

async function fetchTicket(connection, id) {
  const [rows] = await connection.query(
    `SELECT c.*, v.placa, v.prefixo, v.marca, v.modelo, v.tipo_veiculo, v.status_operacional,
            requester.name AS user_name, assignee.name AS assigned_to_name
       FROM frota_chamados c
       JOIN frota_veiculos v ON v.id = c.vehicle_id
       JOIN users requester ON requester.id = c.user_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_to
      WHERE c.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const ticket = rows[0];
  const [attachments] = await connection.query('SELECT * FROM frota_attachments WHERE chamado_id = ? ORDER BY created_at', [id]);
  const [history] = await connection.query(
    `SELECT h.*, u.name AS changed_by_name
       FROM frota_historico h
  LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.chamado_id = ?
   ORDER BY h.created_at DESC, h.id DESC`,
    [id]
  );
  return { ...ticket, attachments, history, sla_state: slaState(ticket) };
}

function buildFilters(req) {
  const where = [];
  const params = [];
  const statusGroup = normalizeString(req.query.statusGroup) || 'ativos';
  if (statusGroup === 'ativos') {
    where.push(`c.status NOT IN ('finalizado', 'cancelado')`);
  } else if (statusGroup === 'fechados') {
    where.push(`c.status IN ('finalizado', 'cancelado')`);
  } else if (statusGroup !== 'todos' && STATUSES.includes(statusGroup)) {
    where.push('c.status = ?');
    params.push(statusGroup);
  }
  for (const [query, column] of [['priority', 'priority'], ['request_type', 'request_type'], ['department', 'department'], ['unit_name', 'unit_name'], ['vehicle_id', 'vehicle_id'], ['assigned_to', 'assigned_to']]) {
    const value = normalizeString(req.query[query]);
    if (!value) continue;
    where.push(`c.${column} = ?`);
    params.push(value);
  }
  if (req.query.from) {
    where.push('c.opened_at >= ?');
    params.push(`${req.query.from} 00:00:00`);
  }
  if (req.query.to) {
    where.push('c.opened_at <= ?');
    params.push(`${req.query.to} 23:59:59`);
  }
  const search = normalizeString(req.query.search, 120);
  if (search) {
    where.push('(c.ticket_number LIKE ? OR c.title LIKE ? OR v.placa LIKE ? OR v.modelo LIKE ? OR c.driver_name LIKE ? OR c.supplier_name LIKE ?)');
    params.push(...Array(6).fill(`%${search}%`));
  }
  return { where, params };
}

async function listTickets(connection, req, includeAll = false) {
  const { where, params } = buildFilters(req);
  const sql = [
    `SELECT c.*, v.placa, v.prefixo, v.marca, v.modelo, v.tipo_veiculo, v.status_operacional,
            requester.name AS user_name, assignee.name AS assigned_to_name
       FROM frota_chamados c
       JOIN frota_veiculos v ON v.id = c.vehicle_id
       JOIN users requester ON requester.id = c.user_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_to`
  ];
  if (!includeAll || !isAdmin(req.user)) {
    where.unshift('c.user_id = ?');
    params.unshift(req.user.id);
  }
  if (where.length) sql.push(`WHERE ${where.join(' AND ')}`);
  sql.push("ORDER BY FIELD(c.priority, 'critica', 'alta', 'media', 'baixa'), c.opened_at DESC, c.id DESC");
  const [rows] = await connection.query(sql.join(' '), params);
  const tickets = rows.map(row => ({ ...row, sla_state: slaState(row) }));
  const requestedSla = normalizeString(req.query.sla_status);
  return requestedSla ? tickets.filter(ticket => ticket.sla_state === requestedSla) : tickets;
}

function applyStatusTiming(chamado, nextStatus, updates, values, now, userId, pauseReason) {
  const wasPaused = PAUSED_STATUSES.includes(chamado.status);
  const willPause = PAUSED_STATUSES.includes(nextStatus);
  const changed = chamado.status !== nextStatus;
  const pauseSeconds = wasPaused && (!willPause || changed) ? secondsBetween(chamado.sla_paused_at, now) : 0;
  if (pauseSeconds > 0) {
    updates.push('paused_seconds = COALESCE(paused_seconds, 0) + ?');
    values.push(pauseSeconds);
  }
  if (willPause) {
    if (!chamado.sla_paused_at || changed) {
      updates.push('sla_paused_at = ?');
      values.push(toSqlDateTime(now));
    }
    updates.push('sla_pause_reason = ?');
    values.push(pauseReason);
  } else if (wasPaused || chamado.sla_paused_at) {
    updates.push('sla_paused_at = NULL', 'sla_pause_reason = NULL');
  }
  if (!chamado.first_response_at && FIRST_RESPONSE_STATUSES.includes(nextStatus)) {
    updates.push('first_response_at = ?', 'sla_first_response_met = ?');
    values.push(toSqlDateTime(now), slaFlag(now, chamado.first_response_due_at, chamado));
  }
  if (!chamado.service_started_at && SERVICE_STARTED_STATUSES.includes(nextStatus)) {
    updates.push('service_started_at = ?');
    values.push(toSqlDateTime(now));
  }
  if (!chamado.resolved_at && (RESOLVED_STATUSES.includes(nextStatus) || CLOSED_STATUSES.includes(nextStatus))) {
    updates.push('resolved_at = ?', 'resolved_by = ?', 'sla_resolution_met = ?');
    values.push(toSqlDateTime(now), userId, slaFlag(now, chamado.resolution_due_at, chamado));
  }
  if (RESOLVED_STATUSES.includes(nextStatus)) {
    updates.push("user_validation_status = 'pendente'", 'user_validation_comment = NULL', 'user_validated_at = NULL');
  }
  if (CLOSED_STATUSES.includes(nextStatus)) {
    updates.push('closed_at = ?', 'final_status = ?');
    values.push(toSqlDateTime(now), nextStatus);
    updates.push("user_validation_status = IF(user_validation_status = 'pendente', 'aprovado', user_validation_status)");
    updates.push('user_validated_at = COALESCE(user_validated_at, ?)');
    values.push(toSqlDateTime(now));
  } else if (nextStatus === 'reaberto') {
    updates.push(
      'closed_at = NULL',
      'resolved_at = NULL',
      'resolved_by = NULL',
      'sla_resolution_met = NULL',
      'final_status = NULL',
      "user_validation_status = 'nao_enviado'",
      'user_validation_comment = NULL',
      'user_validated_at = NULL'
    );
    if (changed) {
      updates.push('reopen_count = COALESCE(reopen_count, 0) + 1', 'last_reopen_reason = ?');
      values.push(pauseReason);
    }
  } else {
    updates.push('closed_at = NULL');
  }
}

async function refreshVehicleAvailability(connection, vehicleId) {
  const [[openPeriods]] = await connection.query(
    'SELECT COUNT(*) AS total FROM frota_indisponibilidades WHERE vehicle_id = ? AND data_fim IS NULL',
    [vehicleId]
  );
  await connection.query(
    'UPDATE frota_veiculos SET status_operacional = ?, updated_at = NOW() WHERE id = ?',
    [Number(openPeriods.total) > 0 ? 'indisponivel' : 'disponivel', vehicleId]
  );
}

router.use(authenticateToken, requireFrotaModule);

router.get('/metadata', (req, res) => {
  res.json({ statuses: STATUSES, priorities: PRIORITIES, vehicleTypes: VEHICLE_TYPES, vehicleStatuses: VEHICLE_STATUSES, requestTypes: REQUEST_TYPES });
});

router.get('/vehicles/options', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT id, placa, prefixo, marca, modelo, tipo_veiculo, status_operacional, quilometragem_atual, motorista_responsavel
         FROM frota_veiculos
        WHERE ativo = 1
     ORDER BY placa, modelo`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar veiculos' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/vehicles', authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT * FROM frota_veiculos ORDER BY ativo DESC, placa, modelo');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar veiculos' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/vehicles', authorizeRoles('admin'), [
  body('placa').trim().isLength({ min: 7, max: 10 }).withMessage('Placa invalida'),
  body('marca').trim().isLength({ min: 2, max: 100 }).withMessage('Marca invalida'),
  body('modelo').trim().isLength({ min: 2, max: 100 }).withMessage('Modelo invalido'),
  body('tipo_veiculo').isIn(VEHICLE_TYPES).withMessage('Tipo de veiculo invalido')
], async (req, res) => {
  if (!validateRequest(req, res)) return;
  let connection;
  try {
    connection = await pool.getConnection();
    const [result] = await connection.query(
      `INSERT INTO frota_veiculos
       (placa, prefixo, marca, modelo, ano_fabricacao, ano_modelo, tipo_veiculo, categoria, renavam, chassi, cor,
        combustivel, setor_responsavel, motorista_responsavel, unidade, status_operacional,
        quilometragem_atual, data_ultima_revisao, km_ultima_revisao, data_proxima_revisao,
        km_proxima_revisao, vencimento_licenciamento, vencimento_seguro, vencimento_extintor, observacoes, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizeString(req.body.placa, 10).toUpperCase(),
        normalizeString(req.body.prefixo, 50),
        normalizeString(req.body.marca, 100),
        normalizeString(req.body.modelo, 100),
        Number(req.body.ano_fabricacao) || null,
        Number(req.body.ano_modelo) || null,
        req.body.tipo_veiculo,
        normalizeString(req.body.categoria, 100),
        normalizeString(req.body.renavam, 50),
        normalizeString(req.body.chassi, 100),
        normalizeString(req.body.cor, 50),
        normalizeString(req.body.combustivel, 50),
        normalizeString(req.body.setor_responsavel, 100),
        normalizeString(req.body.motorista_responsavel, 120),
        normalizeString(req.body.unidade, 100),
        VEHICLE_STATUSES.includes(req.body.status_operacional) ? req.body.status_operacional : 'disponivel',
        Math.max(0, Number(req.body.quilometragem_atual) || 0),
        req.body.data_ultima_revisao || null,
        Number(req.body.km_ultima_revisao) || null,
        req.body.data_proxima_revisao || null,
        Number(req.body.km_proxima_revisao) || null,
        req.body.vencimento_licenciamento || null,
        req.body.vencimento_seguro || null,
        req.body.vencimento_extintor || null,
        normalizeString(req.body.observacoes, 2000),
        normalizeBoolean(req.body.ativo ?? true) ? 1 : 0
      ]
    );
    res.status(201).json({ message: 'Veiculo cadastrado com sucesso', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: error.code === 'ER_DUP_ENTRY' ? 'Placa ja cadastrada' : 'Erro ao cadastrar veiculo' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/vehicles/:id', authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  const allowed = {
    placa: normalizeString(req.body.placa, 10)?.toUpperCase(),
    prefixo: normalizeString(req.body.prefixo, 50),
    marca: normalizeString(req.body.marca, 100),
    modelo: normalizeString(req.body.modelo, 100),
    ano_fabricacao: req.body.ano_fabricacao === '' || req.body.ano_fabricacao === undefined ? null : Number(req.body.ano_fabricacao),
    ano_modelo: req.body.ano_modelo === '' || req.body.ano_modelo === undefined ? null : Number(req.body.ano_modelo),
    tipo_veiculo: VEHICLE_TYPES.includes(req.body.tipo_veiculo) ? req.body.tipo_veiculo : null,
    categoria: normalizeString(req.body.categoria, 100),
    renavam: normalizeString(req.body.renavam, 50),
    chassi: normalizeString(req.body.chassi, 100),
    cor: normalizeString(req.body.cor, 50),
    combustivel: normalizeString(req.body.combustivel, 50),
    setor_responsavel: normalizeString(req.body.setor_responsavel, 100),
    motorista_responsavel: normalizeString(req.body.motorista_responsavel, 120),
    unidade: normalizeString(req.body.unidade, 100),
    status_operacional: VEHICLE_STATUSES.includes(req.body.status_operacional) ? req.body.status_operacional : null,
    quilometragem_atual: req.body.quilometragem_atual === undefined ? null : Math.max(0, Number(req.body.quilometragem_atual) || 0),
    data_ultima_revisao: req.body.data_ultima_revisao || null,
    km_ultima_revisao: req.body.km_ultima_revisao === undefined ? null : Number(req.body.km_ultima_revisao) || null,
    data_proxima_revisao: req.body.data_proxima_revisao || null,
    km_proxima_revisao: req.body.km_proxima_revisao === undefined ? null : Number(req.body.km_proxima_revisao) || null,
    vencimento_licenciamento: req.body.vencimento_licenciamento || null,
    vencimento_seguro: req.body.vencimento_seguro || null,
    vencimento_extintor: req.body.vencimento_extintor || null,
    observacoes: normalizeString(req.body.observacoes, 2000),
    ativo: req.body.ativo === undefined ? null : (normalizeBoolean(req.body.ativo) ? 1 : 0)
  };
  const entries = Object.entries(allowed).filter(([, value]) => value !== null);
  if (!entries.length) return res.status(400).json({ error: 'Informe ao menos um campo' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(`UPDATE frota_veiculos SET ${entries.map(([field]) => `${field} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`, [...entries.map(([, value]) => value), id]);
    res.json({ message: 'Veiculo atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar veiculo' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/create', upload.array('attachments', 8), [
  body('title').trim().isLength({ min: 3, max: 150 }).withMessage('Titulo invalido'),
  body('description').trim().isLength({ min: 10, max: 3000 }).withMessage('Descricao invalida'),
  body('vehicle_id').isInt({ min: 1 }).withMessage('Selecione o veiculo'),
  body('request_type').isIn(REQUEST_TYPES).withMessage('Tipo de solicitacao invalido'),
  body('department').trim().isLength({ min: 2, max: 100 }).withMessage('Setor invalido'),
  body('unit_name').trim().isLength({ min: 2, max: 100 }).withMessage('Local invalido')
], async (req, res) => {
  if (!validateRequest(req, res)) return;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const vehicleId = Number(req.body.vehicle_id);
    const [vehicles] = await connection.query('SELECT * FROM frota_veiculos WHERE id = ? AND ativo = 1 FOR UPDATE', [vehicleId]);
    if (!vehicles.length) {
      await connection.rollback();
      cleanupFiles(req.files);
      return res.status(400).json({ error: 'Veiculo nao encontrado ou inativo' });
    }
    const vehicle = vehicles[0];
    const openedAt = new Date();
    const priority = suggestedPriority(req.body);
    const { firstResponseDueAt, resolutionDueAt } = calculateSla(priority, openedAt);
    const mileage = Math.max(Number(vehicle.quilometragem_atual || 0), Number(req.body.current_mileage || 0));
    const [result] = await connection.query(
      `INSERT INTO frota_chamados
       (user_id, requester_name, department, unit_name, title, description, vehicle_id, request_type,
        priority, status, current_mileage, driver_name, vehicle_location, vehicle_in_operation,
        safety_risk, needs_tow, activity_interrupted, opened_at, first_response_due_at,
        resolution_due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        req.user.id,
        normalizeString(req.body.requester_name, 100) || req.user.name || req.user.username,
        normalizeString(req.body.department, 100),
        normalizeString(req.body.unit_name, 100),
        normalizeString(req.body.title, 150),
        normalizeString(req.body.description, 3000),
        vehicleId,
        req.body.request_type,
        priority,
        mileage,
        normalizeString(req.body.driver_name, 120) || vehicle.motorista_responsavel,
        normalizeString(req.body.vehicle_location, 255),
        normalizeBoolean(req.body.vehicle_in_operation) ? 1 : 0,
        normalizeBoolean(req.body.safety_risk) ? 1 : 0,
        normalizeBoolean(req.body.needs_tow) ? 1 : 0,
        normalizeBoolean(req.body.activity_interrupted) ? 1 : 0,
        toSqlDateTime(openedAt),
        toSqlDateTime(firstResponseDueAt),
        toSqlDateTime(resolutionDueAt)
      ]
    );
    const id = result.insertId;
    const ticketNumber = `FRO-${openedAt.getFullYear()}-${String(id).padStart(5, '0')}`;
    await connection.query('UPDATE frota_chamados SET ticket_number = ? WHERE id = ?', [ticketNumber, id]);
    if (mileage > Number(vehicle.quilometragem_atual || 0)) {
      await connection.query('UPDATE frota_veiculos SET quilometragem_atual = ?, updated_at = NOW() WHERE id = ?', [mileage, vehicleId]);
    }
    for (const file of req.files || []) {
      await connection.query(
        `INSERT INTO frota_attachments (chamado_id, file_name, file_path, file_type, file_size, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [id, file.originalname, file.path, file.mimetype, file.size]
      );
    }
    await recordHistory(connection, id, req.user.id, 'abertura', { toStatus: 'aberto', observation: 'Chamado de frota criado' });
    await connection.commit();
    res.status(201).json({ message: 'Chamado de frota criado com sucesso', chamadoId: id, ticketNumber });
  } catch (error) {
    if (connection) await connection.rollback();
    cleanupFiles(req.files);
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar chamado de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/summary', authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tickets = await listTickets(connection, req, true);
    const [vehicleTotals] = await connection.query(
      `SELECT COUNT(*) AS total,
              SUM(status_operacional = 'disponivel') AS available,
              SUM(status_operacional IN ('indisponivel', 'em_manutencao', 'aguardando_fornecedor', 'aguardando_peca')) AS unavailable
         FROM frota_veiculos WHERE ativo = 1`
    );
    const measured = tickets.filter(ticket => ticket.status !== 'cancelado' && ['dentro_sla', 'fora_sla'].includes(ticket.sla_state));
    const within = measured.filter(ticket => ticket.sla_state === 'dentro_sla').length;
    res.json({
      totals: {
        tickets: tickets.length,
        critical: tickets.filter(ticket => ticket.priority === 'critica').length,
        awaitingSupplier: tickets.filter(ticket => ticket.status === 'aguardando_fornecedor').length,
        vehicles: Number(vehicleTotals[0].total || 0),
        available: Number(vehicleTotals[0].available || 0),
        unavailable: Number(vehicleTotals[0].unavailable || 0)
      },
      costs: {
        estimated: tickets.reduce((sum, ticket) => sum + Number(ticket.estimated_cost || 0), 0),
        actual: tickets.reduce((sum, ticket) => sum + Number(ticket.actual_cost || 0), 0)
      },
      sla: { measured: measured.length, within, breached: measured.length - within, withinPercentage: measured.length ? Number((within / measured.length * 100).toFixed(2)) : 0 }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar resumo de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/all', authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    res.json(await listTickets(connection, req, true));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar chamados de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/my-chamados', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    res.json(await listTickets(connection, req, false));
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao listar seus chamados de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id', async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
    connection = await pool.getConnection();
    const ticket = await fetchTicket(connection, id);
    assertTicketAccess(req, ticket);
    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar chamado de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const ticket = await fetchTicket(connection, id);
    assertTicketAccess({ user: { ...req.user, role: 'admin' } }, ticket);
    const nextStatus = normalizeString(req.body.status, 50) || ticket.status;
    if (!STATUSES.includes(nextStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Status invalido' });
    }
    const pauseReason = normalizeString(req.body.sla_pause_reason, 500) || normalizeString(req.body.observation, 500);
    if (PAUSED_STATUSES.includes(nextStatus) && !pauseReason) {
      await connection.rollback();
      return res.status(400).json({ error: 'Informe o motivo da pausa do SLA' });
    }
    if (nextStatus === 'aguardando_fornecedor') {
      if (!normalizeString(req.body.supplier_name, 120) || !req.body.supplier_contacted_at || !req.body.expected_return_at) {
        await connection.rollback();
        return res.status(400).json({ error: 'Aguardando fornecedor exige fornecedor, data de acionamento e previsao de retorno' });
      }
    }
    const submittedSolution = normalizeString(req.body.solution, 3000);
    if ((RESOLVED_STATUSES.includes(nextStatus) || nextStatus === 'finalizado') && !submittedSolution && !ticket.solution) {
      await connection.rollback();
      return res.status(400).json({ error: 'Informe a solucao aplicada antes de resolver ou finalizar o chamado' });
    }
    if (nextStatus === 'finalizado' && ticket.user_validation_status === 'pendente') {
      await connection.rollback();
      return res.status(400).json({ error: 'Aguarde a validacao do solicitante antes de finalizar o chamado' });
    }
    const assignedTo = req.body.assigned_to === '' || req.body.assigned_to === null
      ? null
      : Number(req.body.assigned_to);
    if (req.body.assigned_to !== undefined && assignedTo !== null && (!Number.isInteger(assignedTo) || assignedTo <= 0)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Responsavel invalido' });
    }
    const supplierContactedAt = req.body.supplier_contacted_at ? toSqlDateTime(req.body.supplier_contacted_at) : null;
    const expectedReturnAt = req.body.expected_return_at ? toSqlDateTime(req.body.expected_return_at) : null;
    const returnDate = req.body.return_date ? toSqlDateTime(req.body.return_date) : null;
    if ((req.body.supplier_contacted_at && !supplierContactedAt)
      || (req.body.expected_return_at && !expectedReturnAt)
      || (req.body.return_date && !returnDate)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Uma das datas informadas e invalida' });
    }
    const updates = ['status = ?'];
    const values = [nextStatus];
    const fields = {
      priority: PRIORITIES.includes(req.body.priority) ? req.body.priority : null,
      supplier_name: normalizeString(req.body.supplier_name, 120),
      supplier_contacted_at: supplierContactedAt,
      expected_return_at: expectedReturnAt,
      estimated_cost: req.body.estimated_cost === undefined ? null : Number(req.body.estimated_cost) || 0,
      approved_cost: req.body.approved_cost === undefined ? null : Number(req.body.approved_cost) || 0,
      actual_cost: req.body.actual_cost === undefined ? null : Number(req.body.actual_cost) || 0,
      quote_number: normalizeString(req.body.quote_number, 80),
      invoice_number: normalizeString(req.body.invoice_number, 80),
      diagnosis: normalizeString(req.body.diagnosis, 2000),
      action_taken: normalizeString(req.body.action_taken, 3000),
      parts_used: normalizeString(req.body.parts_used, 2000),
      service_performed: normalizeString(req.body.service_performed, 3000),
      solution: submittedSolution,
      internal_notes: normalizeString(req.body.internal_notes, 2000),
      return_date: returnDate,
      current_mileage: req.body.current_mileage === undefined ? null : Math.max(0, Number(req.body.current_mileage) || 0),
      vehicle_unavailable: req.body.vehicle_unavailable === undefined ? null : (normalizeBoolean(req.body.vehicle_unavailable) ? 1 : 0)
    };
    if (req.body.assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      values.push(assignedTo);
    }
    for (const [field, value] of Object.entries(fields)) {
      if (value === null) continue;
      updates.push(`${field} = ?`);
      values.push(value);
    }
    const now = new Date();
    applyStatusTiming(ticket, nextStatus, updates, values, now, req.user.id, pauseReason);
    updates.push('updated_at = NOW()');
    values.push(id);
    await connection.query(`UPDATE frota_chamados SET ${updates.join(', ')} WHERE id = ?`, values);

    const unavailable = normalizeBoolean(req.body.vehicle_unavailable)
      || ['veiculo_indisponivel', 'manutencao_externa'].includes(nextStatus);
    if (unavailable) {
      await connection.query("UPDATE frota_veiculos SET status_operacional = 'indisponivel', updated_at = NOW() WHERE id = ?", [ticket.vehicle_id]);
      const [openPeriods] = await connection.query('SELECT id FROM frota_indisponibilidades WHERE chamado_id = ? AND data_fim IS NULL', [id]);
      if (!openPeriods.length) {
        await connection.query(
          `INSERT INTO frota_indisponibilidades (vehicle_id, chamado_id, data_inicio, motivo, status, responsavel)
           VALUES (?, ?, NOW(), ?, 'aberta', ?)`,
          [ticket.vehicle_id, id, pauseReason || normalizeString(req.body.observation, 500) || 'Veiculo indisponivel', req.user.id]
        );
      }
    } else if (req.body.vehicle_unavailable !== undefined || RESOLVED_STATUSES.includes(nextStatus) || CLOSED_STATUSES.includes(nextStatus)) {
      await connection.query("UPDATE frota_indisponibilidades SET data_fim = NOW(), status = 'encerrada' WHERE chamado_id = ? AND data_fim IS NULL", [id]);
      await refreshVehicleAvailability(connection, ticket.vehicle_id);
    }
    if (fields.current_mileage !== null) {
      await connection.query('UPDATE frota_veiculos SET quilometragem_atual = GREATEST(quilometragem_atual, ?), updated_at = NOW() WHERE id = ?', [fields.current_mileage, ticket.vehicle_id]);
    }
    await recordHistory(connection, id, req.user.id, nextStatus !== ticket.status ? 'mudanca_status' : 'atualizacao', {
      fromStatus: ticket.status,
      toStatus: nextStatus,
      observation: normalizeString(req.body.observation, 500)
    });
    await connection.commit();
    res.json({ message: 'Chamado de frota atualizado com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar chamado de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/validation', [
  body('approved').isBoolean().withMessage('Informe se a solucao foi aprovada'),
  body('comment').optional({ checkFalsy: true }).trim().isLength({ min: 5, max: 500 }).withMessage('O comentario deve ter entre 5 e 500 caracteres')
], async (req, res) => {
  if (!validateRequest(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const ticket = await fetchTicket(connection, id);
    assertTicketAccess(req, ticket);
    if (Number(ticket.user_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ error: 'Somente o solicitante pode validar a solucao' });
    }
    if (ticket.status !== 'resolvido' || ticket.user_validation_status !== 'pendente') {
      await connection.rollback();
      return res.status(400).json({ error: 'Este chamado nao esta pendente de validacao' });
    }
    const approved = normalizeBoolean(req.body.approved);
    const comment = normalizeString(req.body.comment, 500);
    if (!approved && !comment) {
      await connection.rollback();
      return res.status(400).json({ error: 'Descreva o que ainda nao foi resolvido' });
    }
    if (approved) {
      await connection.query(
        `UPDATE frota_chamados
            SET status = 'validado_usuario',
                user_validation_status = 'aprovado',
                user_validation_comment = ?,
                user_validated_at = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [comment, id]
      );
      await recordHistory(connection, id, req.user.id, 'validacao_usuario', {
        fromStatus: ticket.status,
        toStatus: 'validado_usuario',
        observation: comment || 'Solucao aprovada pelo solicitante'
      });
    } else {
      await connection.query(
        `UPDATE frota_chamados
            SET status = 'reaberto',
                resolved_at = NULL,
                resolved_by = NULL,
                closed_at = NULL,
                final_status = NULL,
                sla_resolution_met = NULL,
                user_validation_status = 'recusado',
                user_validation_comment = ?,
                user_validated_at = NOW(),
                last_reopen_reason = ?,
                reopen_count = COALESCE(reopen_count, 0) + 1,
                updated_at = NOW()
          WHERE id = ?`,
        [comment, comment, id]
      );
      await recordHistory(connection, id, req.user.id, 'validacao_usuario_recusada', {
        fromStatus: ticket.status,
        toStatus: 'reaberto',
        observation: comment
      });
    }
    await connection.commit();
    res.json({ message: approved ? 'Solucao aprovada. Chamado aguardando finalizacao' : 'Chamado reaberto para nova tratativa' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao validar solucao do chamado de frota' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/attachments', authorizeRoles('admin'), upload.array('attachments', 8), async (req, res) => {
  const id = Number(req.params.id);
  if (!req.files?.length) return res.status(400).json({ error: 'Selecione ao menos um arquivo' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const ticket = await fetchTicket(connection, id);
    if (!ticket) {
      cleanupFiles(req.files);
      await connection.rollback();
      return res.status(404).json({ error: 'Chamado nao encontrado' });
    }
    for (const file of req.files) {
      await connection.query(
        `INSERT INTO frota_attachments (chamado_id, file_name, file_path, file_type, file_size, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [id, file.originalname, file.path, file.mimetype, file.size]
      );
    }
    await recordHistory(connection, id, req.user.id, 'anexo_adicional', { observation: `${req.files.length} arquivo(s) adicionado(s)` });
    await connection.commit();
    res.json({ message: 'Anexos adicionados com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    cleanupFiles(req.files);
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar anexos' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/download/:attachmentId', async (req, res) => {
  let connection;
  try {
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) return res.status(400).json({ error: 'ID invalido' });
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT a.*, c.user_id
         FROM frota_attachments a
         JOIN frota_chamados c ON c.id = a.chamado_id
        WHERE a.id = ?`,
      [attachmentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Anexo nao encontrado' });
    if (!isAdmin(req.user) && Number(rows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Sem permissao para baixar este anexo' });
    }
    res.download(rows[0].file_path, rows[0].file_name);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao baixar anexo' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
