const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

const uploadDir = path.join(__dirname, '../uploads/chamados');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const CHAMADO_STATUSES = [
  'triagem',
  'aberto',
  'em_atendimento',
  'aguardando_usuario',
  'aguardando_fornecedor',
  'resolvido',
  'fechado',
  'pendente',
  'em_andamento',
  'pausado',
  'concluido',
  'encerrado',
  'cancelado',
  'reaberto'
];

const CHAMADO_STATUS_GROUPS = {
  ativos: ['triagem', 'aberto', 'em_atendimento', 'aguardando_usuario', 'aguardando_fornecedor', 'reaberto', 'pendente', 'em_andamento', 'pausado'],
  aberto: ['aberto', 'triagem'],
  pendente: ['aguardando_usuario', 'aguardando_fornecedor', 'pendente', 'pausado'],
  em_atendimento: ['em_atendimento', 'em_andamento'],
  resolvido: ['resolvido', 'concluido'],
  fechado: ['fechado', 'concluido', 'encerrado', 'cancelado'],
  todos: CHAMADO_STATUSES
};

const PRIORITIES = ['baixa', 'normal', 'alta', 'urgente'];
const IMPACTS = ['individual', 'setor', 'empresa'];
const URGENCIES = ['baixa', 'media', 'alta', 'critica'];
const OPENING_CHANNELS = ['telefone', 'whatsapp', 'email', 'presencial', 'sistema'];
const SUPPORT_LEVELS = ['N1', 'N2', 'N3'];
const ATTENDANCE_TYPES = ['remoto', 'presencial', 'externo'];
const SOLUTION_TYPES = ['definitiva', 'paliativa'];
const RESOLVED_STATUSES = ['resolvido'];
const CLOSED_STATUSES = ['fechado', 'concluido', 'encerrado', 'cancelado'];
const FIRST_RESPONSE_STATUSES = ['triagem', 'em_atendimento', 'em_andamento', 'resolvido', 'fechado', 'concluido', 'encerrado'];
const SERVICE_STARTED_STATUSES = ['em_atendimento', 'em_andamento', 'resolvido', 'fechado', 'concluido', 'encerrado'];
const SLA_PAUSED_STATUSES = ['aguardando_usuario', 'aguardando_fornecedor', 'pausado'];
const SLA_STOPPED_STATUSES = ['triagem', ...SLA_PAUSED_STATUSES];
const PRIORITY_ORDER = ['urgente', 'alta', 'normal', 'baixa'];
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;
const ALLOWED_UNITS = ['Sede Administrativa', 'Sede Operações', 'Home Office', 'Area Externa', 'TODOS', 'Todos'];
const ALLOWED_DEPARTMENTS = [
  'COPA',
  'BANHEIROS',
  'ÁREA COMUM',
  'SALA REUNIÃO',
  'LICITAÇÕES',
  'PROJETOS',
  'RH',
  'FINANCEIRO',
  'CONTABILIDADE',
  'GOVERNANÇA',
  'DIR. ADM',
  'ASESSORIA',
  'IMPRENSA',
  'JURÍDICO',
  'PRESIDÊNCIA',
  'ESTOQUE',
  'TECNOLOGIA',
  'DIR. OPERAÇÕES',
  'OPERAÇÕES',
  'ESTAC. COLAB.',
  'ESTAC. FROTA',
  'VESTIÁRIO'
];

const SLA_BY_PRIORITY = {
  urgente: { firstResponseMinutes: 30, resolutionMinutes: 240 },
  alta: { firstResponseMinutes: 60, resolutionMinutes: 480 },
  normal: { firstResponseMinutes: 120, resolutionMinutes: 1440 },
  baixa: { firstResponseMinutes: 240, resolutionMinutes: 2880 }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || `${5 * 1024 * 1024}`, 10) },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|mp3|wav|ogg|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /(image\/jpeg|image\/jpg|image\/png|image\/gif|application\/pdf|audio\/mpeg|audio\/wav|audio\/ogg|audio\/webm)/.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Tipo de arquivo nao permitido'));
  }
});

const createValidators = [
  body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Titulo deve ter entre 3 e 120 caracteres'),
  body('description').trim().isLength({ min: 10, max: 3000 }).withMessage('Descricao deve ter entre 10 e 3000 caracteres'),
  body('requester_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Solicitante invalido'),
  body('department').trim().isIn(ALLOWED_DEPARTMENTS).withMessage('Setor invalido'),
  body('unit_name').trim().isIn(ALLOWED_UNITS).withMessage('Unidade/local invalida'),
  body('opening_channel').optional({ checkFalsy: true }).isIn(OPENING_CHANNELS).withMessage('Canal de abertura invalido'),
  body('category').trim().isLength({ min: 2, max: 100 }).withMessage('Categoria invalida'),
  body('subcategory').trim().isLength({ min: 2, max: 100 }).withMessage('Subcategoria invalida'),
  body('priority').isIn(PRIORITIES).withMessage('Prioridade invalida'),
  body('impact').optional({ checkFalsy: true }).isIn(IMPACTS).withMessage('Impacto invalido'),
  body('urgency').optional({ checkFalsy: true }).isIn(URGENCIES).withMessage('Urgencia invalida'),
  body('support_level').optional({ checkFalsy: true }).isIn(SUPPORT_LEVELS).withMessage('Nivel de suporte invalido'),
  body('asset_tag').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Patrimonio invalido'),
  body('serial_number').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Numero de serie invalido'),
  body('hostname').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Hostname invalido'),
  body('ip_address').optional({ checkFalsy: true }).trim().isLength({ max: 45 }).withMessage('IP invalido'),
  body('extension_number').optional({ checkFalsy: true }).trim().isLength({ max: 30 }).withMessage('Ramal invalido'),
  body('affected_system').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Sistema afetado invalido')
];

function normalizeString(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y'].includes(normalized);
}

function isPrivileged(user) {
  return ['admin', 'creator'].includes(String(user?.role || '').toLowerCase());
}

function isAdminUser(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function parseChamadoDate(value, isEndOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${isEndOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function startOfBusinessDay(date) {
  const next = new Date(date);
  next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  return next;
}

function endOfBusinessDay(date) {
  const next = new Date(date);
  next.setHours(BUSINESS_END_HOUR, 0, 0, 0);
  return next;
}

function moveToNextBusinessStart(date) {
  const next = new Date(date);

  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }

  const dayStart = startOfBusinessDay(next);
  const dayEnd = endOfBusinessDay(next);

  if (next < dayStart) {
    return dayStart;
  }

  if (next >= dayEnd) {
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    return moveToNextBusinessStart(next);
  }

  return next;
}

function addBusinessMinutes(date, minutes) {
  let current = moveToNextBusinessStart(date);
  let remainingMinutes = Math.max(0, Number(minutes) || 0);

  while (remainingMinutes > 0) {
    const businessEnd = endOfBusinessDay(current);
    const availableToday = Math.max(0, Math.floor((businessEnd.getTime() - current.getTime()) / 60000));

    if (remainingMinutes <= availableToday) {
      current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
      break;
    }

    remainingMinutes -= availableToday;
    current = new Date(businessEnd.getTime() + 60 * 1000);
    current = moveToNextBusinessStart(current);
  }

  return current;
}

function toSqlDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(':');
}

function calculateSla(priority, openedAt = new Date()) {
  const config = SLA_BY_PRIORITY[priority] || SLA_BY_PRIORITY.normal;
  const businessStart = moveToNextBusinessStart(openedAt);
  return {
    firstResponseDueAt: addBusinessMinutes(businessStart, config.firstResponseMinutes),
    resolutionDueAt: addBusinessMinutes(businessStart, config.resolutionMinutes)
  };
}

function getSlaFlag(referenceDate, dueDate) {
  if (!referenceDate || !dueDate) return null;
  return new Date(referenceDate).getTime() <= new Date(dueDate).getTime() ? 1 : 0;
}

function secondsBetween(startDate, endDate = new Date()) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

function getTotalPausedSeconds(chamado, referenceDate = new Date()) {
  const savedPause = Math.max(0, Number(chamado?.paused_seconds) || 0);
  if (!chamado?.sla_paused_at || !SLA_STOPPED_STATUSES.includes(chamado.status)) {
    return savedPause;
  }
  return savedPause + secondsBetween(chamado.sla_paused_at, referenceDate);
}

function getSlaFlagWithPause(referenceDate, dueDate, chamado = null) {
  if (!referenceDate || !dueDate) return null;
  const pausedSeconds = getTotalPausedSeconds(chamado, referenceDate);
  const adjustedDueDate = new Date(new Date(dueDate).getTime() + pausedSeconds * 1000);
  return getSlaFlag(referenceDate, adjustedDueDate);
}

function getFinalSlaState(chamado) {
  if (chamado.sla_resolution_met === 1) return 'dentro_sla';
  if (chamado.sla_resolution_met === 0) return 'fora_sla';
  return 'em_andamento';
}

function addStatusTimingUpdates({ chamado, nextStatus, updateFields, updateValues, now, userId, pauseReason }) {
  const wasPaused = SLA_STOPPED_STATUSES.includes(chamado.status);
  const willPause = SLA_STOPPED_STATUSES.includes(nextStatus);
  const statusChanged = chamado.status !== nextStatus;
  const shouldCloseCurrentPause = wasPaused && (!willPause || statusChanged);
  const pauseSeconds = shouldCloseCurrentPause ? secondsBetween(chamado.sla_paused_at, now) : 0;

  if (pauseSeconds > 0) {
    updateFields.push('paused_seconds = COALESCE(paused_seconds, 0) + ?');
    updateValues.push(pauseSeconds);

    if (chamado.status === 'aguardando_usuario') {
      updateFields.push('waiting_user_seconds = COALESCE(waiting_user_seconds, 0) + ?');
      updateValues.push(pauseSeconds);
    }

    if (chamado.status === 'aguardando_fornecedor' || chamado.status === 'pausado') {
      updateFields.push('waiting_vendor_seconds = COALESCE(waiting_vendor_seconds, 0) + ?');
      updateValues.push(pauseSeconds);
    }
  }

  if (willPause) {
    if (!chamado.sla_paused_at || statusChanged) {
      updateFields.push('sla_paused_at = ?');
      updateValues.push(toSqlDateTime(now));
    }
    updateFields.push('sla_pause_reason = ?');
    updateValues.push(pauseReason || null);
  } else if (wasPaused || chamado.sla_paused_at) {
    updateFields.push('sla_paused_at = NULL');
    updateFields.push('sla_pause_reason = NULL');
  }

  if (!chamado.first_response_at && FIRST_RESPONSE_STATUSES.includes(nextStatus)) {
    updateFields.push('first_response_at = ?');
    updateValues.push(toSqlDateTime(now));
    updateFields.push('sla_first_response_met = ?');
    updateValues.push(getSlaFlagWithPause(now, chamado.first_response_due_at, chamado));
  }

  if (!chamado.service_started_at && SERVICE_STARTED_STATUSES.includes(nextStatus)) {
    updateFields.push('service_started_at = ?');
    updateValues.push(toSqlDateTime(now));
  }

  if (!chamado.resolved_at && RESOLVED_STATUSES.includes(nextStatus)) {
    updateFields.push('resolved_at = ?');
    updateValues.push(toSqlDateTime(now));
    updateFields.push('resolved_by = ?');
    updateValues.push(userId);
    updateFields.push('sla_resolution_met = ?');
    updateValues.push(getSlaFlagWithPause(now, chamado.resolution_due_at, chamado));
  }

  if (CLOSED_STATUSES.includes(nextStatus)) {
    if (!chamado.resolved_at) {
      updateFields.push('resolved_at = ?');
      updateValues.push(toSqlDateTime(now));
      updateFields.push('sla_resolution_met = ?');
      updateValues.push(getSlaFlagWithPause(now, chamado.resolution_due_at, chamado));
    }
    updateFields.push('closed_at = ?');
    updateValues.push(toSqlDateTime(now));
    updateFields.push('final_status = ?');
    updateValues.push(nextStatus);
    updateFields.push('resolved_by = ?');
    updateValues.push(userId);
  }
}

function buildTicketNumber(insertId) {
  return `CH-${new Date().getFullYear()}-${String(insertId).padStart(5, '0')}`;
}

function cleanupUploadedFiles(files = []) {
  for (const file of files) {
    if (file?.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error('Erro ao remover arquivo temporario:', error);
      }
    }
  }
}

async function recordHistory(connection, chamadoId, userId, actionType, payload = {}) {
  await connection.query(
    `INSERT INTO chamado_historico
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

async function fetchChamadoById(connection, chamadoId) {
  const [rows] = await connection.query(
    `SELECT c.*,
            requester.name AS user_name,
            requester.department AS user_department,
            assignee.name AS assigned_to_name,
            resolver.name AS resolved_by_name
       FROM chamados c
       JOIN users requester ON requester.id = c.user_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_to
  LEFT JOIN users resolver ON resolver.id = c.resolved_by
      WHERE c.id = ?`,
    [chamadoId]
  );

  if (!rows.length) return null;
  const chamado = rows[0];

  const [attachments] = await connection.query(
    'SELECT * FROM chamado_attachments WHERE chamado_id = ? ORDER BY created_at ASC',
    [chamadoId]
  );

  const [history] = await connection.query(
    `SELECT h.*, u.name AS changed_by_name
       FROM chamado_historico h
  LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.chamado_id = ?
   ORDER BY h.created_at DESC, h.id DESC`,
    [chamadoId]
  );

  return {
    ...chamado,
    attachments,
    history,
    sla_state: getFinalSlaState(chamado)
  };
}

function assertChamadoAccess(req, chamado) {
  if (!chamado) {
    const error = new Error('Chamado nao encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (!isPrivileged(req.user) && chamado.user_id !== req.user.id) {
    const error = new Error('Voce nao tem permissao para acessar este chamado');
    error.statusCode = 403;
    throw error;
  }
}

function buildChamadoFilters(req, tableAlias = 'c') {
  const alias = tableAlias ? `${tableAlias}.` : '';
  const where = [];
  const params = [];
  const statusGroup = normalizeString(req.query.statusGroup)?.toLowerCase() || 'ativos';
  const statuses = CHAMADO_STATUS_GROUPS[statusGroup] || CHAMADO_STATUS_GROUPS.ativos;
  const fromDate = parseChamadoDate(req.query.from, false);
  const toDate = parseChamadoDate(req.query.to, true);

  if (statusGroup !== 'todos') {
    where.push(`${alias}status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  if (fromDate && toDate && fromDate > toDate) {
    const error = new Error('A data inicial nao pode ser maior que a data final');
    error.statusCode = 400;
    throw error;
  }

  if (fromDate) {
    where.push(`${alias}opened_at >= ?`);
    params.push(toSqlDateTime(fromDate));
  }

  if (toDate) {
    where.push(`${alias}opened_at <= ?`);
    params.push(toSqlDateTime(toDate));
  }

  const optionalFilters = [
    { query: 'department', column: 'department' },
    { query: 'assigned_to', column: 'assigned_to', numeric: true },
    { query: 'category', column: 'category' },
    { query: 'subcategory', column: 'subcategory' },
    { query: 'priority', column: 'priority' },
    { query: 'status', column: 'status' },
    { query: 'opening_channel', column: 'opening_channel' },
    { query: 'unit_name', column: 'unit_name' }
  ];

  optionalFilters.forEach(filter => {
    const rawValue = req.query[filter.query];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    if (filter.numeric) {
      const numericValue = Number(rawValue);
      if (!Number.isInteger(numericValue) || numericValue <= 0) return;
      where.push(`${alias}${filter.column} = ?`);
      params.push(numericValue);
      return;
    }

    const value = normalizeString(rawValue, 100);
    if (!value) return;
    where.push(`${alias}${filter.column} = ?`);
    params.push(value);
  });

  const recurrence = normalizeString(req.query.recurrence)?.toLowerCase();
  if (recurrence === 'sim') {
    where.push(`${alias}recurrence_flag = 1`);
  } else if (recurrence === 'nao') {
    where.push(`(${alias}recurrence_flag = 0 OR ${alias}recurrence_flag IS NULL)`);
  }

  const slaStatus = normalizeString(req.query.sla_status)?.toLowerCase();
  if (slaStatus === 'dentro_sla') {
    where.push(`${alias}sla_resolution_met = 1`);
  } else if (slaStatus === 'fora_sla') {
    where.push(`${alias}sla_resolution_met = 0`);
  } else if (slaStatus === 'em_andamento') {
    where.push(`${alias}sla_resolution_met IS NULL`);
  }

  const search = normalizeString(req.query.search, 120);
  if (search) {
    where.push(`(${alias}ticket_number LIKE ? OR ${alias}title LIKE ? OR ${alias}description LIKE ? OR ${alias}requester_name LIKE ? OR ${alias}asset_tag LIKE ? OR ${alias}affected_system LIKE ?)`);
    const searchLike = `%${search}%`;
    params.push(searchLike, searchLike, searchLike, searchLike, searchLike, searchLike);
  }

  return { where, params };
}

function buildChamadoOrderClause(tableAlias = 'c') {
  const alias = tableAlias ? `${tableAlias}.` : '';
  const priorityOrder = PRIORITY_ORDER.map(() => '?').join(', ');
  return {
    clause: `ORDER BY FIELD(${alias}priority, ${priorityOrder}), ${alias}opened_at DESC, ${alias}id DESC`,
    params: [...PRIORITY_ORDER]
  };
}

async function listChamados(connection, req, includeAll = false) {
  const { where, params } = buildChamadoFilters(req, 'c');
  const orderClause = buildChamadoOrderClause('c');
  const queryParts = [
    `SELECT c.*,
            requester.name AS user_name,
            requester.department AS user_department,
            assignee.name AS assigned_to_name,
            resolver.name AS resolved_by_name
       FROM chamados c
       JOIN users requester ON requester.id = c.user_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_to
  LEFT JOIN users resolver ON resolver.id = c.resolved_by`
  ];
  const queryParams = [];

  if (!includeAll || !isPrivileged(req.user)) {
    where.unshift('c.user_id = ?');
    params.unshift(req.user.id);
  }

  if (where.length) {
    queryParts.push(`WHERE ${where.join(' AND ')}`);
    queryParams.push(...params);
  }

  queryParts.push(orderClause.clause);

  const [rows] = await connection.query(queryParts.join(' '), [...queryParams, ...orderClause.params]);

  for (const chamado of rows) {
    const [attachments] = await connection.query(
      'SELECT * FROM chamado_attachments WHERE chamado_id = ? ORDER BY created_at ASC',
      [chamado.id]
    );
    chamado.attachments = attachments;
    chamado.sla_state = getFinalSlaState(chamado);
  }

  return rows;
}

function validateRequest(errors, req, res) {
  const validation = validationResult(req);
  if (!validation.isEmpty()) {
    res.status(400).json({ errors: validation.array() });
    return false;
  }
  if (errors.length) {
    res.status(400).json({ errors: errors.map(message => ({ msg: message })) });
    return false;
  }
  return true;
}

router.get('/metadata', authenticateToken, (req, res) => {
  res.json({
    statuses: CHAMADO_STATUSES,
    priorities: PRIORITIES,
    impacts: IMPACTS,
    urgencies: URGENCIES,
    openingChannels: OPENING_CHANNELS,
    supportLevels: SUPPORT_LEVELS,
    attendanceTypes: ATTENDANCE_TYPES,
    solutionTypes: SOLUTION_TYPES,
    categories: {
      Hardware: ['computador_nao_liga', 'lentidao', 'superaquecimento', 'monitor', 'impressora'],
      Software: ['erro_no_sistema', 'instalacao', 'atualizacao', 'licenca'],
      Rede: ['sem_internet', 'wifi', 'rede_local', 'vpn'],
      Usuario: ['senha', 'permissao', 'email', 'orientacao'],
      Telefonia: ['ramal', 'voip', 'aparelho']
    }
  });
});

router.post('/create', authenticateToken, upload.array('attachments', 8), createValidators, async (req, res) => {
  const customErrors = [];
  const assignedTo = req.body.assigned_to ? Number(req.body.assigned_to) : null;
  if (req.body.assigned_to && (!Number.isInteger(assignedTo) || assignedTo <= 0)) {
    customErrors.push('Tecnico responsavel invalido');
  }

  if (!validateRequest(customErrors, req, res)) {
    return;
  }

  let connection;
  try {
    const isAdminRequest = isAdminUser(req.user);
    const openedAt = new Date();
    const priority = normalizeString(req.body.priority, 50) || 'normal';
    const impact = normalizeString(req.body.impact, 50) || 'individual';
    const urgency = normalizeString(req.body.urgency, 50) || 'media';
    const openingChannel = isAdminRequest ? (normalizeString(req.body.opening_channel, 30) || 'sistema') : 'sistema';
    const supportLevel = isAdminRequest ? (normalizeString(req.body.support_level, 10) || 'N1') : 'N1';
    const requesterName = normalizeString(req.body.requester_name, 100) || req.user.name || req.user.username;
    const department = normalizeString(req.body.department, 100) || normalizeString(req.user.department, 100) || 'Nao informado';
    const { firstResponseDueAt, resolutionDueAt } = calculateSla(priority, openedAt);
    const sanitizedAssignedTo = isAdminRequest ? assignedTo : null;
    const recurrenceFlag = isAdminRequest ? (normalizeBoolean(req.body.recurrence_flag) ? 1 : 0) : 0;
    const recurrenceType = isAdminRequest ? normalizeString(req.body.recurrence_type, 100) : null;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO chamados (
         user_id, requester_name, department, unit_name, opening_channel, title, description,
         priority, impact, urgency, support_level, category, subcategory, assigned_to, status, opened_at,
         first_response_due_at, resolution_due_at, recurrence_flag, recurrence_type,
         asset_tag, serial_number, hostname, ip_address, extension_number, affected_system,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        req.user.id,
        requesterName,
        department,
        normalizeString(req.body.unit_name, 100),
        openingChannel,
        normalizeString(req.body.title, 120),
        normalizeString(req.body.description, 3000),
        priority,
        impact,
        urgency,
        supportLevel,
        normalizeString(req.body.category, 100),
        normalizeString(req.body.subcategory, 100),
        sanitizedAssignedTo,
        sanitizedAssignedTo ? 'em_atendimento' : 'aberto',
        toSqlDateTime(firstResponseDueAt),
        toSqlDateTime(resolutionDueAt),
        recurrenceFlag,
        recurrenceType,
        isAdminRequest ? normalizeString(req.body.asset_tag, 100) : null,
        isAdminRequest ? normalizeString(req.body.serial_number, 100) : null,
        isAdminRequest ? normalizeString(req.body.hostname, 100) : null,
        isAdminRequest ? normalizeString(req.body.ip_address, 45) : null,
        normalizeString(req.body.extension_number, 30),
        normalizeString(req.body.affected_system, 100)
      ]
    );

    const chamadoId = result.insertId;
    const ticketNumber = buildTicketNumber(chamadoId);
    const firstResponseAt = sanitizedAssignedTo ? openedAt : null;
    const firstResponseMet = sanitizedAssignedTo ? getSlaFlag(openedAt, firstResponseDueAt) : null;

    await connection.query(
      `UPDATE chamados
          SET ticket_number = ?,
              first_response_at = ?,
              service_started_at = ?,
              sla_first_response_met = ?
        WHERE id = ?`,
      [ticketNumber, toSqlDateTime(firstResponseAt), toSqlDateTime(firstResponseAt), firstResponseMet, chamadoId]
    );

    if (req.files?.length) {
      for (const file of req.files) {
        await connection.query(
          `INSERT INTO chamado_attachments
             (chamado_id, file_name, file_path, file_type, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [chamadoId, file.originalname, file.path, file.mimetype, file.size]
        );
      }
    }

    await recordHistory(connection, chamadoId, req.user.id, 'abertura', {
      toStatus: sanitizedAssignedTo ? 'em_atendimento' : 'aberto',
      observation: 'Chamado criado'
    });

    if (sanitizedAssignedTo) {
      await recordHistory(connection, chamadoId, req.user.id, 'atribuicao', {
        fieldName: 'assigned_to',
        newValue: String(sanitizedAssignedTo),
        observation: 'Chamado criado ja atribuido'
      });
    }

    await connection.commit();
    res.status(201).json({ message: 'Chamado criado com sucesso', chamadoId, ticketNumber });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar chamado' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const chamados = await listChamados(connection, req, true);
    const totalOpened = chamados.length;
    const totalClosed = chamados.filter(chamado => CLOSED_STATUSES.includes(chamado.status)).length;
    const pending = chamados.filter(chamado => !CLOSED_STATUSES.includes(chamado.status)).length;

    const firstResponseValues = chamados
      .filter(chamado => chamado.first_response_at && chamado.opened_at)
      .map(chamado => (new Date(chamado.first_response_at).getTime() - new Date(chamado.opened_at).getTime()) / 60000);

    const resolutionValues = chamados
      .filter(chamado => (chamado.resolved_at || chamado.closed_at) && chamado.opened_at)
      .map(chamado => (new Date(chamado.resolved_at || chamado.closed_at).getTime() - new Date(chamado.opened_at).getTime()) / 60000);

    const slaMeasured = chamados.filter(chamado => chamado.sla_resolution_met !== null);
    const slaWithin = slaMeasured.filter(chamado => chamado.sla_resolution_met === 1).length;

    const byField = (fieldName) => chamados.reduce((acc, chamado) => {
      const key = chamado[fieldName] || 'Nao informado';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totals: {
        opened: totalOpened,
        closed: totalClosed,
        pending,
        reopened: chamados.filter(chamado => Number(chamado.reopen_count || 0) > 0).length,
        recurring: chamados.filter(chamado => Number(chamado.recurrence_flag || 0) === 1).length
      },
      averages: {
        firstResponseMinutes: firstResponseValues.length ? Number((firstResponseValues.reduce((sum, value) => sum + value, 0) / firstResponseValues.length).toFixed(2)) : 0,
        resolutionMinutes: resolutionValues.length ? Number((resolutionValues.reduce((sum, value) => sum + value, 0) / resolutionValues.length).toFixed(2)) : 0
      },
      sla: {
        measured: slaMeasured.length,
        within: slaWithin,
        breached: slaMeasured.length - slaWithin,
        withinPercentage: slaMeasured.length ? Number(((slaWithin / slaMeasured.length) * 100).toFixed(2)) : 0
      },
      breakdowns: {
        byDepartment: byField('department'),
        byCategory: byField('category'),
        byPriority: byField('priority'),
        byTechnician: byField('assigned_to_name'),
        byChannel: byField('opening_channel'),
        byUnit: byField('unit_name'),
        byCause: byField('root_cause'),
        bySolution: byField('solution_applied'),
        byAsset: byField('asset_tag')
      }
    });
  } catch (error) {
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao gerar resumo de chamados' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/my-chamados', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const chamados = await listChamados(connection, req, false);
    res.json(chamados);
  } catch (error) {
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao buscar chamados' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/all', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const chamados = await listChamados(connection, req, true);
    res.json(chamados);
  } catch (error) {
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao buscar chamados' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    connection = await pool.getConnection();
    const chamado = await fetchChamadoById(connection, chamadoId);
    assertChamadoAccess(req, chamado);
    res.json(chamado);
  } catch (error) {
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao buscar chamado' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/download/:attachmentId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    connection = await pool.getConnection();
    const [attachments] = await connection.query(
      `SELECT a.*, c.user_id
         FROM chamado_attachments a
         JOIN chamados c ON c.id = a.chamado_id
        WHERE a.id = ?`,
      [attachmentId]
    );

    if (!attachments.length) {
      return res.status(404).json({ error: 'Anexo nao encontrado' });
    }

    const attachment = attachments[0];
    if (!isPrivileged(req.user) && attachment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Voce nao tem permissao para acessar este anexo' });
    }

    const filePath = path.normalize(attachment.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo nao encontrado no servidor' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao fazer download do anexo' });
    }
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/attachments', authenticateToken, authorizeRoles('admin'), upload.array('attachments', 8), async (req, res) => {
  let connection;
  try {
    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error: 'ID invalido' });
    }

    if (!req.files?.length) {
      return res.status(400).json({ error: 'Selecione ao menos uma imagem' });
    }

    const nonImageFiles = req.files.filter(file => !String(file.mimetype || '').startsWith('image/'));
    if (nonImageFiles.length) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error: 'A inclusao complementar aceita somente imagens' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const chamado = await fetchChamadoById(connection, chamadoId);
    assertChamadoAccess({ user: { ...req.user, role: 'admin' } }, chamado);

    for (const file of req.files) {
      await connection.query(
        `INSERT INTO chamado_attachments
           (chamado_id, file_name, file_path, file_type, file_size, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [chamadoId, file.originalname, file.path, file.mimetype, file.size]
      );
    }

    await recordHistory(connection, chamadoId, req.user.id, 'anexo_adicional', {
      observation: `${req.files.length} imagem(ns) adicionada(s) pelo administrador`
    });

    await connection.commit();
    res.json({ message: 'Imagens adicionadas com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    cleanupUploadedFiles(req.files);
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao adicionar imagens ao chamado' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/:id/status', authenticateToken, authorizeRoles('admin'), [
  body('status').isIn(CHAMADO_STATUSES).withMessage('Status invalido'),
  body('observation').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Observacao invalida'),
  body('sla_pause_reason').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Motivo de pausa invalido')
], async (req, res) => {
  let connection;
  try {
    if (!validateRequest([], req, res)) return;

    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const chamado = await fetchChamadoById(connection, chamadoId);
    assertChamadoAccess({ user: { ...req.user, role: 'admin' } }, chamado);

    const nextStatus = normalizeString(req.body.status, 50);
    const updateFields = ['status = ?', 'updated_at = NOW()'];
    const updateValues = [nextStatus];
    const now = new Date();
    const pauseReason = normalizeString(req.body.sla_pause_reason, 500) || normalizeString(req.body.observation, 500);
    if (SLA_PAUSED_STATUSES.includes(nextStatus) && !pauseReason) {
      await connection.rollback();
      return res.status(400).json({ error: 'Informe o motivo de pausa do SLA' });
    }

    addStatusTimingUpdates({ chamado, nextStatus, updateFields, updateValues, now, userId: req.user.id, pauseReason });

    updateValues.push(chamadoId);

    await connection.query(`UPDATE chamados SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    await recordHistory(connection, chamadoId, req.user.id, 'mudanca_status', {
      fromStatus: chamado.status,
      toStatus: nextStatus,
      observation: normalizeString(req.body.observation, 500)
    });

    await connection.commit();
    res.json({ message: 'Status atualizado com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao atualizar status do chamado' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/reopen', authenticateToken, authorizeRoles('admin'), [
  body('reason').trim().isLength({ min: 5, max: 500 }).withMessage('Motivo da reabertura deve ter entre 5 e 500 caracteres')
], async (req, res) => {
  let connection;
  try {
    if (!validateRequest([], req, res)) return;

    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const chamado = await fetchChamadoById(connection, chamadoId);
    assertChamadoAccess({ user: { ...req.user, role: 'admin' } }, chamado);

    await connection.query(
      `UPDATE chamados
          SET status = 'reaberto',
              closed_at = NULL,
              resolved_at = NULL,
              resolved_by = NULL,
              final_status = NULL,
              sla_paused_at = NULL,
              sla_pause_reason = NULL,
              last_reopen_reason = ?,
              reopen_count = COALESCE(reopen_count, 0) + 1,
              updated_at = NOW()
        WHERE id = ?`,
      [normalizeString(req.body.reason, 500), chamadoId]
    );

    await recordHistory(connection, chamadoId, req.user.id, 'reabertura', {
      fromStatus: chamado.status,
      toStatus: 'reaberto',
      observation: normalizeString(req.body.reason, 500)
    });

    await connection.commit();
    res.json({ message: 'Chamado reaberto com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao reabrir chamado' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin', 'creator'), async (req, res) => {
  let connection;
  try {
    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const chamado = await fetchChamadoById(connection, chamadoId);
    assertChamadoAccess({ user: { ...req.user, role: 'admin' } }, chamado);

    const fields = {
      title: normalizeString(req.body.title, 120),
      description: normalizeString(req.body.description, 3000),
      department: normalizeString(req.body.department, 100),
      unit_name: normalizeString(req.body.unit_name, 100),
      opening_channel: normalizeString(req.body.opening_channel, 30),
      category: normalizeString(req.body.category, 100),
      subcategory: normalizeString(req.body.subcategory, 100),
      priority: normalizeString(req.body.priority, 50),
      impact: normalizeString(req.body.impact, 50),
      urgency: normalizeString(req.body.urgency, 50),
      support_level: normalizeString(req.body.support_level, 10),
      attendance_type: normalizeString(req.body.attendance_type, 30),
      root_cause: normalizeString(req.body.root_cause, 500),
      action_taken: normalizeString(req.body.action_taken, 1000),
      solution_applied: normalizeString(req.body.solution_applied, 1000),
      solution_type: normalizeString(req.body.solution_type, 30),
      closure_notes: normalizeString(req.body.closure_notes, 1000),
      recurrence_type: normalizeString(req.body.recurrence_type, 100),
      asset_tag: normalizeString(req.body.asset_tag, 100),
      serial_number: normalizeString(req.body.serial_number, 100),
      hostname: normalizeString(req.body.hostname, 100),
      ip_address: normalizeString(req.body.ip_address, 45),
      extension_number: normalizeString(req.body.extension_number, 30),
      affected_system: normalizeString(req.body.affected_system, 100),
      final_status: normalizeString(req.body.final_status, 50)
    };

    const assignedTo = req.body.assigned_to === '' || req.body.assigned_to === null || req.body.assigned_to === undefined
      ? undefined
      : Number(req.body.assigned_to);
    const status = normalizeString(req.body.status, 50);
    const updates = [];
    const params = [];
    const historyEntries = [];
    const now = new Date();
    const adminOnlyRequested = ['opening_channel', 'impact', 'support_level', 'asset_tag', 'serial_number', 'hostname', 'ip_address', 'status', 'assigned_to', 'recurrence_flag', 'recurrence_type']
      .some(field => req.body[field] !== undefined);

    if (!isAdminUser(req.user) && adminOnlyRequested) {
      await connection.rollback();
      return res.status(403).json({ error: 'Esses campos de tratativa sao permitidos somente para administradores' });
    }

    Object.entries(fields).forEach(([column, value]) => {
      if (value === null) return;
      if (column === 'priority' && !PRIORITIES.includes(value)) return;
      if (column === 'impact' && !IMPACTS.includes(value)) return;
      if (column === 'urgency' && !URGENCIES.includes(value)) return;
      if (column === 'opening_channel' && !OPENING_CHANNELS.includes(value)) return;
      if (column === 'support_level' && !SUPPORT_LEVELS.includes(value)) return;
      if (column === 'attendance_type' && !ATTENDANCE_TYPES.includes(value)) return;
      if (column === 'solution_type' && !SOLUTION_TYPES.includes(value)) return;
      updates.push(`${column} = ?`);
      params.push(value);
      if (String(chamado[column] || '') !== String(value || '')) {
        historyEntries.push({
          actionType: 'atualizacao_campo',
          fieldName: column,
          oldValue: chamado[column] == null ? null : String(chamado[column]),
          newValue: value == null ? null : String(value)
        });
      }
    });

    if (req.body.recurrence_flag !== undefined) {
      const recurrenceFlag = normalizeBoolean(req.body.recurrence_flag) ? 1 : 0;
      updates.push('recurrence_flag = ?');
      params.push(recurrenceFlag);
      if (Number(chamado.recurrence_flag || 0) !== recurrenceFlag) {
        historyEntries.push({
          actionType: 'atualizacao_campo',
          fieldName: 'recurrence_flag',
          oldValue: String(Number(chamado.recurrence_flag || 0)),
          newValue: String(recurrenceFlag)
        });
      }
    }

    if (req.body.needs_return !== undefined) {
      updates.push('needs_return = ?');
      params.push(normalizeBoolean(req.body.needs_return) ? 1 : 0);
    }

    if (req.body.part_replaced !== undefined) {
      updates.push('part_replaced = ?');
      params.push(normalizeBoolean(req.body.part_replaced) ? 1 : 0);
    }

    if (req.body.external_service !== undefined) {
      updates.push('external_service = ?');
      params.push(normalizeBoolean(req.body.external_service) ? 1 : 0);
    }

    if (req.body.waiting_user_seconds !== undefined) {
      updates.push('waiting_user_seconds = ?');
      params.push(Math.max(0, Number(req.body.waiting_user_seconds) || 0));
    }

    if (req.body.waiting_vendor_seconds !== undefined) {
      updates.push('waiting_vendor_seconds = ?');
      params.push(Math.max(0, Number(req.body.waiting_vendor_seconds) || 0));
    }

    if (req.body.paused_seconds !== undefined) {
      updates.push('paused_seconds = ?');
      params.push(Math.max(0, Number(req.body.paused_seconds) || 0));
    }

    if (assignedTo !== undefined) {
      if (Number.isInteger(assignedTo) && assignedTo > 0) {
        updates.push('assigned_to = ?');
        params.push(assignedTo);
        if (String(chamado.assigned_to || '') !== String(assignedTo)) {
          historyEntries.push({
            actionType: 'atribuicao',
            fieldName: 'assigned_to',
            oldValue: chamado.assigned_to == null ? null : String(chamado.assigned_to),
            newValue: String(assignedTo)
          });
        }

        if (!chamado.first_response_at) {
          updates.push('first_response_at = ?');
          params.push(toSqlDateTime(now));
          updates.push('sla_first_response_met = ?');
          params.push(getSlaFlagWithPause(now, chamado.first_response_due_at, chamado));
          chamado.first_response_at = now;
        }
      } else {
        updates.push('assigned_to = NULL');
      }
    }

    if (status && CHAMADO_STATUSES.includes(status)) {
      const pauseReason = normalizeString(req.body.sla_pause_reason, 500) || normalizeString(req.body.observation, 500);
      if (SLA_PAUSED_STATUSES.includes(status) && !pauseReason) {
        await connection.rollback();
        return res.status(400).json({ error: 'Informe o motivo de pausa do SLA' });
      }

      updates.push('status = ?');
      params.push(status);
      if (status !== chamado.status) {
        historyEntries.push({
          actionType: 'mudanca_status',
          fromStatus: chamado.status,
          toStatus: status,
          observation: normalizeString(req.body.observation, 500)
        });
      }

      addStatusTimingUpdates({
        chamado,
        nextStatus: status,
        updateFields: updates,
        updateValues: params,
        now,
        userId: req.user.id,
        pauseReason
      });

      if (RESOLVED_STATUSES.includes(status) || CLOSED_STATUSES.includes(status)) {
        const category = fields.category || chamado.category;
        const subcategory = fields.subcategory || chamado.subcategory;
        const rootCause = fields.root_cause || chamado.root_cause;
        const solutionApplied = fields.solution_applied || chamado.solution_applied;
        const attendanceType = fields.attendance_type || chamado.attendance_type;

        if (!category || !subcategory || !rootCause || !solutionApplied || !attendanceType) {
          await connection.rollback();
          return res.status(400).json({
            error: 'Para fechar o chamado, informe categoria, subcategoria, causa, solucao aplicada e tipo de atendimento'
          });
        }
      } else {
        updates.push('closed_at = NULL');
      }
    }

    const observation = normalizeString(req.body.observation, 500);
    if (observation) {
      historyEntries.push({
        actionType: 'observacao',
        observation
      });
    }

    if (!updates.length && !historyEntries.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Informe ao menos um campo para atualizar' });
    }

    if (updates.length) {
      updates.push('updated_at = NOW()');
      params.push(chamadoId);
      await connection.query(`UPDATE chamados SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    for (const entry of historyEntries) {
      await recordHistory(connection, chamadoId, req.user.id, entry.actionType, entry);
    }

    await connection.commit();
    res.json({ message: 'Chamado atualizado com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao atualizar chamado' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
