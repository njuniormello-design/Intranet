const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, authorizeRoles } = require('./auth');

const uploadDir = path.join(__dirname, '../uploads/infraestrutura');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const INFRA_STATUSES = [
  'aberto',
  'triagem',
  'aguardando_informacoes',
  'aguardando_aprovacao',
  'aguardando_orcamento',
  'aguardando_fornecedor',
  'em_atendimento',
  'pendente_material',
  'pendente_agendamento',
  'resolvido',
  'validado_usuario',
  'finalizado',
  'cancelado',
  'reaberto'
];

const INFRA_STATUS_GROUPS = {
  ativos: ['aberto', 'triagem', 'aguardando_informacoes', 'aguardando_aprovacao', 'aguardando_orcamento', 'aguardando_fornecedor', 'em_atendimento', 'pendente_material', 'pendente_agendamento', 'validado_usuario', 'reaberto_usuario', 'reaberto'],
  aberto: ['aberto', 'triagem', 'reaberto_usuario', 'reaberto'],
  pendente: ['aguardando_informacoes', 'aguardando_aprovacao', 'aguardando_orcamento', 'aguardando_fornecedor', 'pendente_material', 'pendente_agendamento'],
  em_atendimento: ['em_atendimento'],
  resolvido: ['resolvido'],
  fechado: ['finalizado', 'cancelado'],
  todos: INFRA_STATUSES
};

const INFRA_PRIORITIES = ['baixa', 'media', 'alta', 'critica'];
const IMPACTS = ['individual', 'setor', 'empresa'];
const URGENCIES = ['baixa', 'media', 'alta', 'critica'];
const OPENING_CHANNELS = ['telefone', 'whatsapp', 'email', 'presencial', 'sistema'];
const SUPPORT_LEVELS = ['N1', 'N2', 'N3'];
const ATTENDANCE_TYPES = ['presencial', 'externo', 'fornecedor', 'interno', 'misto'];
const USER_VALIDATION_STATUSES = ['nao_enviado', 'pendente', 'aprovado', 'recusado', 'expirado'];
const CLOSED_STATUSES = ['finalizado', 'cancelado'];
const RESOLVED_STATUSES = ['resolvido'];
const FIRST_RESPONSE_STATUSES = ['triagem', 'em_atendimento', 'resolvido', 'finalizado'];
const SERVICE_STARTED_STATUSES = ['em_atendimento', 'resolvido', 'finalizado'];
const SLA_PAUSED_STATUSES = ['aguardando_informacoes', 'aguardando_aprovacao', 'aguardando_orcamento', 'aguardando_fornecedor', 'pendente_material', 'pendente_agendamento'];
const PRIORITY_ORDER = ['critica', 'alta', 'media', 'baixa'];
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;

const ALLOWED_UNITS = ['Sede Administrativa', 'Sede Operacoes', 'Sede OperaÃ§Ãµes', 'Home Office', 'Area Externa', 'TODOS', 'Todos'];
const ALLOWED_DEPARTMENTS = [
  'COPA', 'BANHEIROS', 'AREA COMUM', 'ÃREA COMUM', 'SALA REUNIAO', 'SALA REUNIÃƒO',
  'LICITACOES', 'LICITAÃ‡Ã•ES', 'PROJETOS', 'RH', 'FINANCEIRO', 'CONTABILIDADE',
  'GOVERNANCA', 'GOVERNANÃ‡A', 'DIR. ADM', 'ASESSORIA', 'ASSESSORIA', 'IMPRENSA',
  'JURIDICO', 'JURÃDICO', 'PRESIDENCIA', 'PRESIDÃŠNCIA', 'ESTOQUE', 'TECNOLOGIA',
  'DIR. OPERACOES', 'DIR. OPERAÃ‡Ã•ES', 'OPERACOES', 'OPERAÃ‡Ã•ES', 'ESTAC. COLAB.',
  'ESTAC. FROTA', 'VESTIARIO', 'VESTIÃRIO', 'PESQUISA DE PRECOS', 'PESQUISA DE PREÃ‡OS'
];

const INFRA_CATEGORIES = {
  'Infraestrutura predial': ['portas_janelas_fechaduras', 'telhado_goteira', 'piso_forro_parede', 'banheiro_copa', 'sala_ambiente', 'garagem_patio_estacionamento', 'portao_calcada'],
  'Ar-condicionado': ['nao_liga', 'nao_refrigera', 'vazamento_agua', 'ruido', 'controle_remoto', 'limpeza_filtro', 'manutencao_preventiva', 'instalacao', 'remanejamento', 'desinstalacao', 'mau_cheiro'],
  Eletrica: ['tomada_sem_energia', 'lampada_queimada', 'disjuntor_desarmando', 'curto_circuito', 'instalacao_tomada_luminaria', 'quadro_energia', 'falta_energia', 'adequacao_eletrica'],
  Hidraulica: ['vazamento', 'torneira_defeito', 'descarga', 'entupimento', 'ralo', 'caixa_dagua', 'infiltracao', 'registro', 'bebedouro', 'esgoto'],
  Pintura: ['pintura_interna', 'pintura_externa', 'retoque', 'sinalizacao_solo', 'faixa_estacionamento', 'identificacao_visual', 'pintura_pos_obra'],
  'Obras e reformas': ['adequacao_sala', 'construcao_reforma', 'divisorias', 'alteracao_layout', 'ampliacao', 'reparo_estrutural', 'pequenas_obras', 'acompanhamento_obra'],
  Mobiliario: ['mesa', 'cadeira', 'armario', 'gaveteiro', 'estante', 'balcao', 'prateleira', 'manutencao', 'novo_mobiliario', 'remanejamento', 'montagem_desmontagem'],
  'Limpeza e conservacao': ['limpeza_emergencial', 'salas', 'banheiros', 'coleta_residuos', 'organizacao', 'dedetizacao', 'controle_pragas', 'jardinagem', 'capina', 'conservacao_externa'],
  'Mudanca de layout/setor': ['mudanca_mesa', 'mudanca_sala', 'transferencia_setor', 'reorganizacao', 'remanejamento_moveis', 'apoio_evento_reuniao'],
  'Seguranca patrimonial': ['portoes', 'fechaduras', 'controle_acesso', 'areas_externas', 'protecao_fisica'],
  Outros: ['demanda_nao_classificada']
};

const SLA_BY_PRIORITY = {
  critica: { firstResponseMinutes: 30, resolutionMinutes: 240 },
  alta: { firstResponseMinutes: 120, resolutionMinutes: 600 },
  media: { firstResponseMinutes: 600, resolutionMinutes: 1800 },
  baixa: { firstResponseMinutes: 1200, resolutionMinutes: 3000 }
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
    const allowedTypes = /jpeg|jpg|png|gif|pdf|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /(image\/jpeg|image\/jpg|image\/png|image\/gif|image\/webp|application\/pdf)/.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Tipo de arquivo nao permitido'));
  }
});

const createValidators = [
  body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Titulo deve ter entre 3 e 120 caracteres'),
  body('description').trim().isLength({ min: 10, max: 3000 }).withMessage('Descricao deve ter entre 10 e 3000 caracteres'),
  body('requester_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Solicitante invalido'),
  body('department').trim().isLength({ min: 2, max: 100 }).withMessage('Setor invalido'),
  body('unit_name').trim().isLength({ min: 2, max: 100 }).withMessage('Unidade/local invalida'),
  body('category').trim().isIn(Object.keys(INFRA_CATEGORIES)).withMessage('Categoria invalida'),
  body('subcategory').trim().isLength({ min: 2, max: 100 }).withMessage('Subcategoria invalida'),
  body('priority').isIn(INFRA_PRIORITIES).withMessage('Prioridade invalida'),
  body('impact').optional({ checkFalsy: true }).isIn(IMPACTS).withMessage('Impacto invalido'),
  body('urgency').optional({ checkFalsy: true }).isIn(URGENCIES).withMessage('Urgencia invalida')
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
  return ['1', 'true', 'sim', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function isAdminUser(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function isPrivileged(user) {
  return isAdminUser(user);
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function moveToNextBusinessStart(date) {
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
    return moveToNextBusinessStart(next);
  }
  return next;
}

function addBusinessMinutes(date, minutes) {
  let current = moveToNextBusinessStart(date);
  let remaining = Math.max(0, Number(minutes) || 0);
  while (remaining > 0) {
    const end = new Date(current);
    end.setHours(BUSINESS_END_HOUR, 0, 0, 0);
    const available = Math.max(0, Math.floor((end.getTime() - current.getTime()) / 60000));
    if (remaining <= available) return new Date(current.getTime() + remaining * 60000);
    remaining -= available;
    current = new Date(end.getTime() + 60000);
    current = moveToNextBusinessStart(current);
  }
  return current;
}

function toSqlDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDate(value, isEndOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${isEndOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateSla(priority, openedAt = new Date()) {
  const config = SLA_BY_PRIORITY[priority] || SLA_BY_PRIORITY.media;
  const start = moveToNextBusinessStart(openedAt);
  return {
    firstResponseDueAt: addBusinessMinutes(start, config.firstResponseMinutes),
    resolutionDueAt: addBusinessMinutes(start, config.resolutionMinutes)
  };
}

function getSlaFlag(referenceDate, dueDate) {
  if (!referenceDate || !dueDate) return null;
  return new Date(referenceDate).getTime() <= new Date(dueDate).getTime() ? 1 : 0;
}

function getFinalSlaState(chamado) {
  if (chamado.sla_resolution_met === 1) return 'dentro_sla';
  if (chamado.sla_resolution_met === 0) return 'fora_sla';
  return 'em_andamento';
}

function buildTicketNumber(insertId) {
  return `INF-${new Date().getFullYear()}-${String(insertId).padStart(5, '0')}`;
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

function validateRequest(errors, req, res) {
  const validation = validationResult(req);
  if (!validation.isEmpty()) {
    cleanupUploadedFiles(req.files);
    res.status(400).json({ errors: validation.array() });
    return false;
  }
  if (errors.length) {
    cleanupUploadedFiles(req.files);
    res.status(400).json({ errors: errors.map(message => ({ msg: message })) });
    return false;
  }
  return true;
}

async function recordHistory(connection, chamadoId, userId, actionType, payload = {}) {
  await connection.query(
    `INSERT INTO infra_historico
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

async function fetchInfraChamadoById(connection, chamadoId) {
  const [rows] = await connection.query(
    `SELECT c.*,
            requester.name AS user_name,
            requester.department AS user_department,
            assignee.name AS assigned_to_name,
            resolver.name AS resolved_by_name
       FROM infra_chamados c
       JOIN users requester ON requester.id = c.user_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_to
  LEFT JOIN users resolver ON resolver.id = c.resolved_by
      WHERE c.id = ?`,
    [chamadoId]
  );
  if (!rows.length) return null;
  const chamado = rows[0];
  const [attachments] = await connection.query('SELECT * FROM infra_attachments WHERE chamado_id = ? ORDER BY created_at ASC', [chamadoId]);
  const [history] = await connection.query(
    `SELECT h.*, u.name AS changed_by_name
       FROM infra_historico h
  LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.chamado_id = ?
   ORDER BY h.created_at DESC, h.id DESC`,
    [chamadoId]
  );
  return { ...chamado, attachments, history, sla_state: getFinalSlaState(chamado) };
}

function assertAccess(req, chamado) {
  if (!chamado) {
    const error = new Error('Chamado de infraestrutura nao encontrado');
    error.statusCode = 404;
    throw error;
  }
  if (!isPrivileged(req.user) && chamado.user_id !== req.user.id) {
    const error = new Error('Voce nao tem permissao para acessar este chamado');
    error.statusCode = 403;
    throw error;
  }
}

function buildFilters(req, tableAlias = 'c') {
  const alias = tableAlias ? `${tableAlias}.` : '';
  const where = [];
  const params = [];
  const statusGroup = normalizeString(req.query.statusGroup)?.toLowerCase() || 'ativos';
  const statuses = INFRA_STATUS_GROUPS[statusGroup] || INFRA_STATUS_GROUPS.ativos;
  if (statusGroup !== 'todos') {
    if (statusGroup === 'ativos') {
      where.push(`(${alias}status IN (${statuses.map(() => '?').join(', ')}) OR (${alias}status = ? AND ${alias}user_validation_status = ?))`);
      params.push(...statuses, 'resolvido', 'pendente');
    } else {
      where.push(`${alias}status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
  }

  const fromDate = parseDate(req.query.from, false);
  const toDate = parseDate(req.query.to, true);
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

  [
    { query: 'department', column: 'department' },
    { query: 'assigned_to', column: 'assigned_to', numeric: true },
    { query: 'category', column: 'category' },
    { query: 'subcategory', column: 'subcategory' },
    { query: 'priority', column: 'priority' },
    { query: 'status', column: 'status' },
    { query: 'unit_name', column: 'unit_name' }
  ].forEach(filter => {
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

  const slaStatus = normalizeString(req.query.sla_status)?.toLowerCase();
  if (slaStatus === 'dentro_sla') where.push(`${alias}sla_resolution_met = 1`);
  if (slaStatus === 'fora_sla') where.push(`${alias}sla_resolution_met = 0`);
  if (slaStatus === 'em_andamento') where.push(`${alias}sla_resolution_met IS NULL`);

  const search = normalizeString(req.query.search, 120);
  if (search) {
    where.push(`(${alias}ticket_number LIKE ? OR ${alias}title LIKE ? OR ${alias}description LIKE ? OR ${alias}requester_name LIKE ? OR ${alias}environment LIKE ? OR ${alias}asset_identifier LIKE ? OR ${alias}supplier_name LIKE ?)`);
    const searchLike = `%${search}%`;
    params.push(searchLike, searchLike, searchLike, searchLike, searchLike, searchLike, searchLike);
  }

  return { where, params };
}

async function listInfraChamados(connection, req, includeAll = false) {
  const { where, params } = buildFilters(req, 'c');
  const queryParts = [
    `SELECT c.*,
            requester.name AS user_name,
            requester.department AS user_department,
            assignee.name AS assigned_to_name,
            resolver.name AS resolved_by_name
       FROM infra_chamados c
       JOIN users requester ON requester.id = c.user_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_to
  LEFT JOIN users resolver ON resolver.id = c.resolved_by`
  ];
  if (!includeAll || !isPrivileged(req.user)) {
    where.unshift('c.user_id = ?');
    params.unshift(req.user.id);
  }
  if (where.length) queryParts.push(`WHERE ${where.join(' AND ')}`);
  queryParts.push(`ORDER BY FIELD(c.priority, ${PRIORITY_ORDER.map(() => '?').join(', ')}), c.opened_at DESC, c.id DESC`);
  const [rows] = await connection.query(queryParts.join(' '), [...params, ...PRIORITY_ORDER]);
  for (const chamado of rows) {
    const [attachments] = await connection.query('SELECT * FROM infra_attachments WHERE chamado_id = ? ORDER BY created_at ASC', [chamado.id]);
    chamado.attachments = attachments;
    chamado.sla_state = getFinalSlaState(chamado);
  }
  return rows;
}

function getSuggestedPriority(req) {
  const requestedPriority = normalizeString(req.body.priority, 20) || 'media';
  const risk = normalizeBoolean(req.body.safety_risk);
  const interrupted = normalizeBoolean(req.body.activity_interrupted);
  const category = normalizeString(req.body.category, 100);
  const subcategory = normalizeString(req.body.subcategory, 100);
  if (risk || subcategory === 'curto_circuito') return 'critica';
  if (interrupted || ['Eletrica', 'Hidraulica'].includes(category)) return requestedPriority === 'critica' ? 'critica' : 'alta';
  return requestedPriority;
}

function addStatusUpdates({ chamado, nextStatus, updateFields, updateValues, now, userId }) {
  if (!chamado.first_response_at && FIRST_RESPONSE_STATUSES.includes(nextStatus)) {
    updateFields.push('first_response_at = ?');
    updateValues.push(toSqlDateTime(now));
    updateFields.push('sla_first_response_met = ?');
    updateValues.push(getSlaFlag(now, chamado.first_response_due_at));
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
    updateValues.push(getSlaFlag(now, chamado.resolution_due_at));
  }
  if (RESOLVED_STATUSES.includes(nextStatus)) {
    updateFields.push("user_validation_status = 'pendente'");
    updateFields.push('user_validation_comment = NULL');
    updateFields.push('user_validated_at = NULL');
  }
  if (CLOSED_STATUSES.includes(nextStatus)) {
    if (!chamado.resolved_at) {
      updateFields.push('resolved_at = ?');
      updateValues.push(toSqlDateTime(now));
      updateFields.push('sla_resolution_met = ?');
      updateValues.push(getSlaFlag(now, chamado.resolution_due_at));
    }
    updateFields.push('closed_at = ?');
    updateValues.push(toSqlDateTime(now));
    updateFields.push('final_status = ?');
    updateValues.push(nextStatus);
    updateFields.push('resolved_by = ?');
    updateValues.push(userId);
    updateFields.push("user_validation_status = IF(user_validation_status = 'pendente', 'aprovado', user_validation_status)");
    updateFields.push('user_validated_at = COALESCE(user_validated_at, ?)');
    updateValues.push(toSqlDateTime(now));
  } else {
    updateFields.push('closed_at = NULL');
  }
}

router.get('/metadata', authenticateToken, (req, res) => {
  res.json({
    statuses: INFRA_STATUSES,
    priorities: INFRA_PRIORITIES,
    impacts: IMPACTS,
    urgencies: URGENCIES,
    openingChannels: OPENING_CHANNELS,
    attendanceTypes: ATTENDANCE_TYPES,
    supportLevels: SUPPORT_LEVELS,
    userValidationStatuses: USER_VALIDATION_STATUSES,
    categories: INFRA_CATEGORIES
  });
});

router.post('/create', authenticateToken, upload.array('attachments', 8), createValidators, async (req, res) => {
  const assignedTo = req.body.assigned_to ? Number(req.body.assigned_to) : null;
  const customErrors = [];
  if (req.body.assigned_to && (!Number.isInteger(assignedTo) || assignedTo <= 0)) {
    customErrors.push('Responsavel invalido');
  }
  if (!INFRA_CATEGORIES[req.body.category]?.includes(req.body.subcategory)) {
    customErrors.push('Subcategoria invalida para a categoria selecionada');
  }
  if (!validateRequest(customErrors, req, res)) return;

  let connection;
  try {
    const isAdminRequest = isAdminUser(req.user);
    const openedAt = new Date();
    const priority = getSuggestedPriority(req);
    const { firstResponseDueAt, resolutionDueAt } = calculateSla(priority, openedAt);
    const sanitizedAssignedTo = isAdminRequest ? assignedTo : null;
    const requesterName = normalizeString(req.body.requester_name, 100) || req.user.name || req.user.username;
    const department = normalizeString(req.body.department, 100) || normalizeString(req.user.department, 100) || 'Nao informado';
    const needsApproval = normalizeBoolean(req.body.needs_approval) || ['Obras e reformas', 'Mobiliario', 'Mudanca de layout/setor'].includes(req.body.category);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO infra_chamados (
         user_id, requester_name, department, unit_name, opening_channel, title, description,
         priority, impact, urgency, support_level, category, subcategory, assigned_to, status, opened_at,
         first_response_due_at, resolution_due_at, environment, asset_identifier, safety_risk,
         activity_interrupted, needs_approval, requires_vendor, material_needed,
         estimated_cost, supplier_name, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        req.user.id,
        requesterName,
        department,
        normalizeString(req.body.unit_name, 100),
        isAdminRequest ? (normalizeString(req.body.opening_channel, 30) || 'sistema') : 'sistema',
        normalizeString(req.body.title, 120),
        normalizeString(req.body.description, 3000),
        priority,
        normalizeString(req.body.impact, 50) || 'individual',
        normalizeString(req.body.urgency, 50) || 'media',
        normalizeString(req.body.support_level, 10) || 'N1',
        normalizeString(req.body.category, 100),
        normalizeString(req.body.subcategory, 100),
        sanitizedAssignedTo,
        needsApproval ? 'aguardando_aprovacao' : (sanitizedAssignedTo ? 'em_atendimento' : 'aberto'),
        toSqlDateTime(firstResponseDueAt),
        toSqlDateTime(resolutionDueAt),
        normalizeString(req.body.environment, 120),
        normalizeString(req.body.asset_identifier, 120),
        normalizeBoolean(req.body.safety_risk) ? 1 : 0,
        normalizeBoolean(req.body.activity_interrupted) ? 1 : 0,
        needsApproval ? 1 : 0,
        normalizeBoolean(req.body.requires_vendor) ? 1 : 0,
        normalizeBoolean(req.body.material_needed) ? 1 : 0,
        isAdminRequest ? Number(req.body.estimated_cost || 0) || null : null,
        isAdminRequest ? normalizeString(req.body.supplier_name, 120) : null
      ]
    );

    const chamadoId = result.insertId;
    const ticketNumber = buildTicketNumber(chamadoId);
    const firstResponseAt = sanitizedAssignedTo ? openedAt : null;
    await connection.query(
      `UPDATE infra_chamados
          SET ticket_number = ?,
              first_response_at = ?,
              service_started_at = ?,
              sla_first_response_met = ?
        WHERE id = ?`,
      [ticketNumber, toSqlDateTime(firstResponseAt), toSqlDateTime(firstResponseAt), firstResponseAt ? getSlaFlag(openedAt, firstResponseDueAt) : null, chamadoId]
    );

    if (req.files?.length) {
      for (const file of req.files) {
        await connection.query(
          `INSERT INTO infra_attachments (chamado_id, file_name, file_path, file_type, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [chamadoId, file.originalname, file.path, file.mimetype, file.size]
        );
      }
    }

    await recordHistory(connection, chamadoId, req.user.id, 'abertura', { toStatus: needsApproval ? 'aguardando_aprovacao' : 'aberto', observation: 'Chamado de infraestrutura criado' });
    await connection.commit();
    res.status(201).json({ message: 'Chamado de infraestrutura criado com sucesso', chamadoId, ticketNumber });
  } catch (error) {
    if (connection) await connection.rollback();
    cleanupUploadedFiles(req.files);
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar chamado de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/summary', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const chamados = await listInfraChamados(connection, req, true);
    const closed = chamados.filter(chamado => CLOSED_STATUSES.includes(chamado.status));
    const slaMeasured = chamados.filter(chamado => chamado.sla_resolution_met !== null);
    const slaWithin = slaMeasured.filter(chamado => chamado.sla_resolution_met === 1).length;
    res.json({
      totals: {
        opened: chamados.length,
        closed: closed.length,
        pending: chamados.length - closed.length,
        awaitingApproval: chamados.filter(chamado => chamado.status === 'aguardando_aprovacao').length,
        critical: chamados.filter(chamado => chamado.priority === 'critica').length
      },
      sla: {
        measured: slaMeasured.length,
        within: slaWithin,
        breached: slaMeasured.length - slaWithin,
        withinPercentage: slaMeasured.length ? Number(((slaWithin / slaMeasured.length) * 100).toFixed(2)) : 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao gerar resumo de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/my-chamados', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    res.json(await listInfraChamados(connection, req, false));
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar chamados de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/all', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    res.json(await listInfraChamados(connection, req, true));
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar chamados de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) return res.status(400).json({ error: 'ID invalido' });
    connection = await pool.getConnection();
    const chamado = await fetchInfraChamadoById(connection, chamadoId);
    assertAccess(req, chamado);
    res.json(chamado);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao buscar chamado de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/download/:attachmentId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) return res.status(400).json({ error: 'ID invalido' });
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT a.*, c.user_id
         FROM infra_attachments a
         JOIN infra_chamados c ON c.id = a.chamado_id
        WHERE a.id = ?`,
      [attachmentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Anexo nao encontrado' });
    const attachment = rows[0];
    if (!isPrivileged(req.user) && attachment.user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissao para baixar este anexo' });
    res.download(attachment.file_path, attachment.file_name);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao baixar anexo' });
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

    const chamado = await fetchInfraChamadoById(connection, chamadoId);
    assertAccess({ user: { ...req.user, role: 'admin' } }, chamado);

    for (const file of req.files) {
      await connection.query(
        `INSERT INTO infra_attachments
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
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao adicionar imagens ao chamado de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  let connection;
  try {
    const chamadoId = Number(req.params.id);
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) return res.status(400).json({ error: 'ID invalido' });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const chamado = await fetchInfraChamadoById(connection, chamadoId);
    assertAccess({ user: { ...req.user, role: 'admin' } }, chamado);

    const nextStatus = normalizeString(req.body.status, 50);
    if (nextStatus && !INFRA_STATUSES.includes(nextStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Status invalido' });
    }
    if (nextStatus && SLA_PAUSED_STATUSES.includes(nextStatus) && !normalizeString(req.body.sla_pause_reason, 500) && !normalizeString(req.body.observation, 500)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Informe uma observacao para status pendente/aguardando' });
    }

    const fields = {
      category: normalizeString(req.body.category, 100),
      subcategory: normalizeString(req.body.subcategory, 100),
      priority: normalizeString(req.body.priority, 20),
      impact: normalizeString(req.body.impact, 50),
      urgency: normalizeString(req.body.urgency, 50),
      support_level: normalizeString(req.body.support_level, 10),
      attendance_type: normalizeString(req.body.attendance_type, 30),
      environment: normalizeString(req.body.environment, 120),
      asset_identifier: normalizeString(req.body.asset_identifier, 120),
      root_cause: normalizeString(req.body.root_cause, 500),
      action_taken: normalizeString(req.body.action_taken, 1000),
      solution_applied: normalizeString(req.body.solution_applied, 1000),
      material_description: normalizeString(req.body.material_description, 500),
      supplier_name: normalizeString(req.body.supplier_name, 120),
      sla_pause_reason: normalizeString(req.body.sla_pause_reason, 500),
      final_status: normalizeString(req.body.final_status, 50),
      closure_notes: normalizeString(req.body.closure_notes, 1000)
    };

    const updates = [];
    const params = [];
    const historyEntries = [];
    Object.entries(fields).forEach(([column, value]) => {
      if (value === null) return;
      if (column === 'priority' && !INFRA_PRIORITIES.includes(value)) return;
      if (column === 'impact' && !IMPACTS.includes(value)) return;
      if (column === 'urgency' && !URGENCIES.includes(value)) return;
      if (column === 'support_level' && !SUPPORT_LEVELS.includes(value)) return;
      if (column === 'attendance_type' && !ATTENDANCE_TYPES.includes(value)) return;
      updates.push(`${column} = ?`);
      params.push(value);
      if (String(chamado[column] || '') !== String(value || '')) {
        historyEntries.push({ actionType: 'atualizacao_campo', fieldName: column, oldValue: chamado[column] == null ? null : String(chamado[column]), newValue: value });
      }
    });

    ['safety_risk', 'activity_interrupted', 'needs_approval', 'approval_granted', 'requires_vendor', 'material_needed', 'recurrence_flag'].forEach(column => {
      if (req.body[column] === undefined) return;
      updates.push(`${column} = ?`);
      params.push(normalizeBoolean(req.body[column]) ? 1 : 0);
    });

    if (req.body.recurrence_type !== undefined) {
      updates.push('recurrence_type = ?');
      params.push(normalizeString(req.body.recurrence_type, 100));
    }

    ['waiting_user_seconds', 'waiting_vendor_seconds', 'paused_seconds'].forEach(column => {
      if (req.body[column] === undefined) return;
      updates.push(`${column} = ?`);
      params.push(Math.max(0, Number(req.body[column]) || 0));
    });

    ['estimated_cost', 'actual_cost'].forEach(column => {
      if (req.body[column] === undefined) return;
      updates.push(`${column} = ?`);
      params.push(Number(req.body[column] || 0) || null);
    });

    if (req.body.assigned_to !== undefined) {
      const assignedTo = req.body.assigned_to === '' || req.body.assigned_to === null ? null : Number(req.body.assigned_to);
      if (assignedTo !== null && (!Number.isInteger(assignedTo) || assignedTo <= 0)) {
        await connection.rollback();
        return res.status(400).json({ error: 'Responsavel invalido' });
      }
      updates.push(assignedTo ? 'assigned_to = ?' : 'assigned_to = NULL');
      if (assignedTo) params.push(assignedTo);
    }

    const now = new Date();
    if (nextStatus) {
      updates.push('status = ?');
      params.push(nextStatus);
      if (nextStatus !== chamado.status) {
        historyEntries.push({ actionType: 'mudanca_status', fromStatus: chamado.status, toStatus: nextStatus, observation: normalizeString(req.body.observation, 500) });
      }
      if (RESOLVED_STATUSES.includes(nextStatus) || CLOSED_STATUSES.includes(nextStatus)) {
        const missing = [];
        if (!(fields.category || chamado.category)) missing.push('categoria');
        if (!(fields.subcategory || chamado.subcategory)) missing.push('subcategoria');
        if (!(fields.attendance_type || chamado.attendance_type)) missing.push('tipo de atendimento');
        if (!(fields.root_cause || chamado.root_cause)) missing.push('causa');
        if (!(fields.action_taken || chamado.action_taken)) missing.push('acao executada');
        if (!(fields.solution_applied || chamado.solution_applied)) missing.push('solucao aplicada');
        if (missing.length) {
          await connection.rollback();
          return res.status(400).json({ error: `Para resolver o chamado, preencha: ${missing.join(', ')}` });
        }
      }
      addStatusUpdates({ chamado, nextStatus, updateFields: updates, updateValues: params, now, userId: req.user.id });
    }

    const observation = normalizeString(req.body.observation, 500);
    if (observation) historyEntries.push({ actionType: 'observacao', observation });
    if (!updates.length && !historyEntries.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Informe ao menos um campo para atualizar' });
    }

    if (updates.length) {
      updates.push('updated_at = NOW()');
      params.push(chamadoId);
      await connection.query(`UPDATE infra_chamados SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    for (const entry of historyEntries) {
      await recordHistory(connection, chamadoId, req.user.id, entry.actionType, entry);
    }
    await connection.commit();
    res.json({ message: 'Chamado de infraestrutura atualizado com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao atualizar chamado de infraestrutura' });
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
    if (!Number.isInteger(chamadoId) || chamadoId <= 0) return res.status(400).json({ error: 'ID invalido' });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const chamado = await fetchInfraChamadoById(connection, chamadoId);
    assertAccess({ user: { ...req.user, role: 'admin' } }, chamado);
    await connection.query(
      `UPDATE infra_chamados
          SET status = 'reaberto',
              closed_at = NULL,
              resolved_at = NULL,
              resolved_by = NULL,
              final_status = NULL,
              user_validation_status = 'nao_enviado',
              user_validation_comment = NULL,
              user_validated_at = NULL,
              last_reopen_reason = ?,
              reopen_count = COALESCE(reopen_count, 0) + 1,
              updated_at = NOW()
        WHERE id = ?`,
      [normalizeString(req.body.reason, 500), chamadoId]
    );
    await recordHistory(connection, chamadoId, req.user.id, 'reabertura', { fromStatus: chamado.status, toStatus: 'reaberto', observation: normalizeString(req.body.reason, 500) });
    await connection.commit();
    res.json({ message: 'Chamado reaberto com sucesso' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao reabrir chamado' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/:id/validation', authenticateToken, [
  body('approved').isBoolean().withMessage('Informe se a solucao foi aprovada'),
  body('comment').optional({ checkFalsy: true }).trim().isLength({ min: 5, max: 500 }).withMessage('A situacao descrita deve ter entre 5 e 500 caracteres')
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

    const chamado = await fetchInfraChamadoById(connection, chamadoId);
    assertAccess(req, chamado);

    if (chamado.user_id !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({ error: 'Somente o solicitante pode validar a solucao' });
    }

    if (chamado.status !== 'resolvido' || chamado.user_validation_status !== 'pendente') {
      await connection.rollback();
      return res.status(400).json({ error: 'Este chamado nao esta pendente de validacao do usuario' });
    }

    const approved = normalizeBoolean(req.body.approved);
    const comment = normalizeString(req.body.comment, 500);
    if (!approved && !comment) {
      await connection.rollback();
      return res.status(400).json({ error: 'Descreva o que ainda nao foi resolvido' });
    }

    if (approved) {
      await connection.query(
        `UPDATE infra_chamados
            SET status = 'validado_usuario',
                user_validation_status = 'aprovado',
                user_validation_comment = ?,
                user_validated_at = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [comment, chamadoId]
      );

      await recordHistory(connection, chamadoId, req.user.id, 'validacao_usuario', {
        fromStatus: chamado.status,
        toStatus: 'validado_usuario',
        observation: comment || 'Solucao aprovada pelo solicitante. Aguardando fechamento pelo administrador'
      });
    } else {
      await connection.query(
        `UPDATE infra_chamados
            SET status = 'reaberto',
                closed_at = NULL,
                final_status = NULL,
                user_validation_status = 'recusado',
                user_validation_comment = ?,
                user_validated_at = NOW(),
                last_reopen_reason = ?,
                reopen_count = COALESCE(reopen_count, 0) + 1,
                updated_at = NOW()
          WHERE id = ?`,
        [comment, comment, chamadoId]
      );

      await recordHistory(connection, chamadoId, req.user.id, 'validacao_usuario_recusada', {
        fromStatus: chamado.status,
        toStatus: 'reaberto',
        observation: comment
      });
    }

    await connection.commit();
    res.json({ message: approved ? 'Solucao aprovada. O chamado aguardara fechamento pelo administrador' : 'Chamado reaberto para nova tratativa' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao validar solucao do chamado de infraestrutura' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
