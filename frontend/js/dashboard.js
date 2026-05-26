const API_URL =
  window.location.protocol === 'file:'
    ? 'http://localhost:5000/api'
    : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000/api'
      : '/api';
const API_ORIGIN = API_URL.replace(/\/api$/, '');
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null') || {};
let sessionRedirecting = false;

function getTokenPayload(jwtToken) {
  try {
    const payload = String(jwtToken || '').split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded));
  } catch (error) {
    return null;
  }
}

function isStoredTokenExpired(jwtToken) {
  const payload = getTokenPayload(jwtToken);
  return Boolean(payload?.exp && Date.now() >= payload.exp * 1000);
}

function redirectToLogin(message = 'Sua sessão expirou. Faça login novamente.') {
  if (sessionRedirecting) return;
  sessionRedirecting = true;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.setItem('sessionMessage', message);
  window.location.href = 'index.html';
}

async function handleAuthErrorResponse(response) {
  if (![401, 403].includes(response.status)) return response;

  let payload = null;
  try {
    payload = await response.clone().json();
  } catch (error) {
    return response;
  }

  const code = String(payload?.code || '');
  const error = String(payload?.error || '').toLowerCase();
  const isAuthError = ['TOKEN_MISSING', 'TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(code)
    || error.includes('token')
    || error.includes('sessão expirada');

  if (isAuthError) {
    redirectToLogin(payload?.error || 'Sua sessão expirou. Faça login novamente.');
  }

  return response;
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  return handleAuthErrorResponse(response);
};

const ROLE_LABELS = {
  admin: 'Administrador',
  creator: 'Criador',
  viewer: 'Visualizador',
  user: 'Visualizador'
};

const HOMOLOGATION_ENABLED_PAGES = ['chamados', 'infraestrutura', 'funcionarios', 'usuarios'];
const ALL_PAGES = ['dashboard', 'chamados', 'infraestrutura', 'comunicados', 'documentos', 'funcionarios', 'ideias', 'usuarios'];

const RECENT_ANNOUNCEMENTS_LIMIT = 10;
const DEFAULT_CHAMADO_METADATA = {
  categories: {
    Hardware: ['computador_nao_liga', 'lentidao', 'superaquecimento', 'monitor', 'impressora'],
    Software: ['erro_no_sistema', 'instalacao', 'atualizacao', 'licenca'],
    Rede: ['sem_internet', 'wifi', 'rede_local', 'vpn'],
    Usuario: ['senha', 'permissao', 'email', 'orientacao'],
    Telefonia: ['ramal', 'voip', 'aparelho']
  }
};
const DEFAULT_INFRA_METADATA = {
  categories: {
    'Infraestrutura predial': ['portas_janelas_fechaduras', 'telhado_goteira', 'piso_forro_parede'],
    'Ar-condicionado': ['nao_liga', 'nao_refrigera', 'vazamento_agua', 'limpeza_filtro'],
    Eletrica: ['tomada_sem_energia', 'lampada_queimada', 'disjuntor_desarmando', 'curto_circuito'],
    Hidraulica: ['vazamento', 'torneira_defeito', 'descarga', 'entupimento'],
    Pintura: ['pintura_interna', 'pintura_externa', 'retoque'],
    'Obras e reformas': ['adequacao_sala', 'construcao_reforma', 'divisorias'],
    Mobiliario: ['mesa', 'cadeira', 'armario', 'remanejamento'],
    'Limpeza e conservacao': ['limpeza_emergencial', 'banheiros', 'jardinagem'],
    'Mudanca de layout/setor': ['mudanca_mesa', 'mudanca_sala', 'remanejamento_moveis'],
    'Seguranca patrimonial': ['portoes', 'fechaduras', 'controle_acesso'],
    Outros: ['demanda_nao_classificada']
  }
};
let chamadosCache = [];
let infraChamadosCache = [];
let comunicadosCache = [];
let documentosCache = [];
let funcionariosCache = [];
let ideiasCache = [];
let chamadosMetadata = DEFAULT_CHAMADO_METADATA;
let infraMetadata = DEFAULT_INFRA_METADATA;
let usuariosCache = [];
let editingChamadoId = null;
let editingChamadoData = null;
let editingInfraChamadoData = null;
let editingComunicadoId = null;
let editingFuncionarioId = null;
let editingUsuarioId = null;

function normalizeRole(role) {
  if (!role) return 'viewer';
  const value = String(role).toLowerCase();
  if (value === 'user') return 'viewer';
  if (value === 'moderator') return 'creator';
  return ROLE_LABELS[value] ? value : 'viewer';
}

function getCurrentRole() {
  return normalizeRole(currentUser.role);
}

function canAccessUsers() {
  return isAdmin();
}

function getAllowedUserRoles() {
  return isAdmin() ? ['viewer', 'creator', 'admin'] : [];
}

function canManageCatalogs() {
  return ['admin', 'creator'].includes(getCurrentRole());
}

function canManageFuncionarios() {
  return ['admin', 'creator'].includes(getCurrentRole());
}

function isAdmin() {
  return getCurrentRole() === 'admin';
}

function getFuncionariosTitle() {
  return isAdmin() ? 'Gerenciamento de Funcionários' : 'Relação de empregados e contatos';
}

function canViewIdeasInbox() {
  return isAdmin();
}

function syncAdminOnlyTicketFields() {
  document.querySelectorAll('.ticket-admin-only').forEach(section => {
    section.style.display = isAdmin() ? '' : 'none';
    section.querySelectorAll('input, select, textarea, button').forEach(field => {
      field.disabled = !isAdmin();
    });
  });
}

function isPageEnabled(page) {
  return HOMOLOGATION_ENABLED_PAGES.includes(page);
}

function getChamadosEndpoint(filters = {}) {
  const baseUrl = isAdmin() ? `${API_URL}/chamados/all` : `${API_URL}/chamados/my-chamados`;
  const params = new URLSearchParams();

  if (filters.statusGroup) params.set('statusGroup', filters.statusGroup);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.department) params.set('department', filters.department);
  if (filters.category) params.set('category', filters.category);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.opening_channel) params.set('opening_channel', filters.opening_channel);
  if (filters.sla_status) params.set('sla_status', filters.sla_status);
  if (filters.recurrence) params.set('recurrence', filters.recurrence);
  if (filters.unit_name) params.set('unit_name', filters.unit_name);
  if (filters.assigned_to) params.set('assigned_to', filters.assigned_to);
  if (filters.search) params.set('search', filters.search);

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function getInfraEndpoint(filters = {}) {
  const baseUrl = isAdmin() ? `${API_URL}/infraestrutura/all` : `${API_URL}/infraestrutura/my-chamados`;
  const params = new URLSearchParams();

  if (filters.statusGroup) params.set('statusGroup', filters.statusGroup);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.department) params.set('department', filters.department);
  if (filters.category) params.set('category', filters.category);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.sla_status) params.set('sla_status', filters.sla_status);
  if (filters.unit_name) params.set('unit_name', filters.unit_name);
  if (filters.assigned_to) params.set('assigned_to', filters.assigned_to);
  if (filters.search) params.set('search', filters.search);

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function getChamadoUserName(chamado) {
  if (chamado?.user_name) return chamado.user_name;
  if (chamado?.name) return chamado.name;
  return currentUser.name || currentUser.username || 'Usuário';
}

function getUserValidationLabel(status) {
  const labels = {
    nao_enviado: 'Não enviado para validação',
    pendente: 'Aguardando validação do usuário',
    aprovado: 'Aprovado pelo usuário',
    recusado: 'Recusado pelo usuário',
    expirado: 'Fechado automaticamente por prazo'
  };
  return labels[status] || humanizeOptionLabel(status || 'nao_enviado');
}

function canValidateChamadoSolution(chamado) {
  return Number(chamado?.user_id) === Number(currentUser?.id)
    && chamado?.status === 'resolvido'
    && chamado?.user_validation_status === 'pendente';
}

function canValidateInfraSolution(chamado) {
  return Number(chamado?.user_id) === Number(currentUser?.id)
    && chamado?.status === 'resolvido'
    && chamado?.user_validation_status === 'pendente';
}

function getChamadoPriorityRank(priority) {
  const normalized = normalizeSearchText(priority);
  if (normalized === 'urgente') return 0;
  if (normalized === 'alta') return 1;
  if (normalized === 'normal') return 2;
  if (normalized === 'baixa') return 3;
  return 4;
}

function getInfraPriorityRank(priority) {
  const normalized = normalizeSearchText(priority);
  if (normalized === 'critica') return 0;
  if (normalized === 'alta') return 1;
  if (normalized === 'media') return 2;
  if (normalized === 'baixa') return 3;
  return 4;
}

function sortChamados(chamados) {
  return [...(Array.isArray(chamados) ? chamados : [])].sort((a, b) => {
    const priorityDiff = getChamadoPriorityRank(a?.priority) - getChamadoPriorityRank(b?.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = new Date(a?.opened_at || a?.created_at || 0).getTime();
    const dateB = new Date(b?.opened_at || b?.created_at || 0).getTime();
    return dateB - dateA;
  });
}

function sortInfraChamados(chamados) {
  return [...(Array.isArray(chamados) ? chamados : [])].sort((a, b) => {
    const priorityDiff = getInfraPriorityRank(a?.priority) - getInfraPriorityRank(b?.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = new Date(a?.opened_at || a?.created_at || 0).getTime();
    const dateB = new Date(b?.opened_at || b?.created_at || 0).getTime();
    return dateB - dateA;
  });
}

function getChamadosFilterState() {
  const statusGroup = document.getElementById('chamadoStatusFilter')?.value || 'todos';
  const from = document.getElementById('chamadoDateFrom')?.value || '';
  const to = document.getElementById('chamadoDateTo')?.value || '';
  const department = getFieldValue('chamadoFilterDepartment');
  const category = document.getElementById('chamadoFilterCategory')?.value || '';
  const priority = document.getElementById('chamadoFilterPriority')?.value || '';
  const opening_channel = document.getElementById('chamadoFilterChannel')?.value || '';
  const sla_status = document.getElementById('chamadoFilterSla')?.value || '';
  const recurrence = document.getElementById('chamadoFilterRecurrence')?.value || '';
  const unit_name = getFieldValue('chamadoFilterUnit');
  const assigned_to = document.getElementById('chamadoFilterAssignedTo')?.value || '';
  const search = getFieldValue('chamadoFilterSearch');
  return { statusGroup, from, to, department, category, priority, opening_channel, sla_status, recurrence, unit_name, assigned_to, search };
}

function getInfraFilterState() {
  return {
    statusGroup: document.getElementById('infraStatusFilter')?.value || 'ativos',
    from: document.getElementById('infraDateFrom')?.value || '',
    to: document.getElementById('infraDateTo')?.value || '',
    department: getFieldValue('infraFilterDepartment'),
    category: document.getElementById('infraFilterCategory')?.value || '',
    priority: document.getElementById('infraFilterPriority')?.value || '',
    sla_status: document.getElementById('infraFilterSla')?.value || '',
    unit_name: getFieldValue('infraFilterUnit'),
    assigned_to: document.getElementById('infraFilterAssignedTo')?.value || '',
    search: getFieldValue('infraFilterSearch')
  };
}

function validateChamadosDateRange(from, to) {
  if (!from || !to) return true;

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    alert('Selecione datas válidas.');
    return false;
  }

  if (start > end) {
    alert('A data inicial não pode ser maior que a data final.');
    return false;
  }

  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 30) {
    alert('O intervalo de datas deve ter no máximo 30 dias.');
    return false;
  }

  return true;
}

function syncChamadoDateInputs() {
  const today = new Date();
  const maxDate = today.toISOString().slice(0, 10);

  ['chamadoDateFrom', 'chamadoDateTo', 'infraDateFrom', 'infraDateTo'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.max = maxDate;
  });
}

function getFieldValue(id) {
  const field = document.getElementById(id);
  return field ? String(field.value || '').trim() : '';
}

function showValidationAlert(errors) {
  if (!errors.length) return false;
  alert(`Corrija os campos abaixo:\n\n- ${errors.join('\n- ')}`);
  return true;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getDocumentoSearchText(documento) {
  return [
    documento?.name,
    documento?.category,
    documento?.description,
    documento?.uploader_name,
    documento?.file_name
  ]
    .filter(Boolean)
    .join(' ');
}

function renderDocumentosList(filterValue = '') {
  const tableBody = document.getElementById('documentosTableBody');
  if (!tableBody) return;

  const normalizedFilter = normalizeSearchText(filterValue);
  const filteredDocumentos = normalizedFilter
    ? documentosCache.filter(documento => normalizeSearchText(getDocumentoSearchText(documento)).includes(normalizedFilter))
    : documentosCache;

  if (documentosCache.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum documento disponível</td></tr>';
    return;
  }

  if (filteredDocumentos.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum documento encontrado para a busca</td></tr>';
    return;
  }

  tableBody.innerHTML = filteredDocumentos.map(d => `
    <tr>
      <td>${d.name}</td>
      <td>${d.category || '-'}</td>
      <td>${(d.file_size / 1024 / 1024).toFixed(2)} MB</td>
      <td>${d.uploader_name}</td>
      <td>${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
      <td>
        <button onclick="downloadDocument(${d.id}, '${d.file_name}')" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">Download</button>
        ${(canManageCatalogs() || currentUser.id === d.user_id) ? `<button onclick="deleteDocument(${d.id})" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function syncUsuarioRoleOptions() {
  const select = document.getElementById('usuarioPerfil');
  if (!select) return;

  const allowedRoles = getAllowedUserRoles();
  const currentValue = select.value;
  const options = {
    viewer: 'Visualizador',
    creator: 'Criador',
    admin: 'Administrador'
  };

  select.innerHTML = allowedRoles
    .map(role => `<option value="${role}">${options[role]}</option>`)
    .join('');

  if (allowedRoles.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = allowedRoles[0] || 'viewer';
  }
}

function setUsuarioFormMode(mode) {
  const title = document.querySelector('#newUsuarioForm h3');
  const submitButton = document.querySelector('#formNewUsuario button[type="submit"]');
  const passwordInput = document.getElementById('usuarioSenha');
  const passwordLabel = document.querySelector('label[for="usuarioSenha"]');

  if (title) {
    title.textContent = mode === 'edit' ? 'Editar Usuario' : 'Cadastrar Novo Usuario';
  }
  if (submitButton) {
    submitButton.textContent = mode === 'edit' ? 'Salvar Alteracoes' : 'Cadastrar';
  }
  if (passwordInput) {
    passwordInput.required = mode !== 'edit';
    passwordInput.placeholder = mode === 'edit' ? 'Deixe em branco para manter a senha atual' : '';
  }
  if (passwordLabel) {
    passwordLabel.textContent = mode === 'edit' ? 'Nova senha:' : 'Senha:';
  }
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    return {
      error: `Rota da API não encontrada (${response.status}). Reinicie o backend para carregar as rotas mais recentes.`
    };
  }
  return {
    error: text ? text.slice(0, 300) : 'Resposta inválida da API'
  };
}

function validateEmailFormat(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateNumberString(value) {
  return /^[0-9]+$/.test(String(value || '').trim());
}

function validatePhoneLike(value) {
  return /^[0-9()+\-\s]{3,20}$/.test(String(value || '').trim());
}

function validateLength(value, min, max) {
  const length = String(value || '').trim().length;
  return length >= min && length <= max;
}

function formatDateToPtBr(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function isFutureDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.getTime()) && date > today;
}

function setFuncionarioFormMode(mode) {
  const title = document.querySelector('#newFuncionarioForm h3');
  const submitButton = document.querySelector('#formNewFuncionario button[type="submit"]');
  if (title) {
    title.textContent = mode === 'edit' ? 'Editar Funcionário' : 'Cadastrar Novo Funcionário';
  }
  if (submitButton) {
    submitButton.textContent = mode === 'edit' ? 'Salvar Alterações' : 'Cadastrar';
  }
}

function setComunicadoFormMode(mode) {
  const title = document.querySelector('#newComunicadoForm h3');
  const submitButton = document.querySelector('#formNewComunicado button[type="submit"]');
  if (title) {
    title.textContent = mode === 'edit' ? 'Editar Comunicado' : 'Novo Comunicado';
  }
  if (submitButton) {
    submitButton.textContent = mode === 'edit' ? 'Salvar Alterações' : 'Publicar';
  }
}

// Verificar autenticação
if (!token) {
  window.location.href = 'index.html';
} else if (isStoredTokenExpired(token)) {
  redirectToLogin('Sua sessão expirou. Faça login novamente.');
}

// Carregar dados do usuário
window.addEventListener('load', async () => {
  organizeChamadoFormFields();
  await hydrateCurrentUser();
  renderCurrentUser();
  await loadCurrentUserAvatar();
  await loadChamadosMetadata();
  await loadInfraMetadata();
  await loadChamadoUsers();
  applyRolePermissions();
  loadPage('chamados');
});

function organizeChamadoFormFields() {
  const titleGroup = document.getElementById('chamadoTitle')?.closest('.form-group');
  const requesterGroup = document.getElementById('chamadoRequester')?.closest('.form-group');
  const categoryGroup = document.getElementById('chamadoCategory')?.closest('.form-group');
  const subcategoryGroup = document.getElementById('chamadoSubcategory')?.closest('.form-group');

  if (titleGroup && requesterGroup && titleGroup.parentElement !== requesterGroup.parentElement) {
    titleGroup.parentElement.appendChild(requesterGroup);
  }

  if (categoryGroup && subcategoryGroup && categoryGroup.nextElementSibling !== subcategoryGroup) {
    subcategoryGroup.parentElement.insertBefore(categoryGroup, subcategoryGroup);
  }
}

async function hydrateCurrentUser() {
  try {
    const response = await fetch(`${API_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    if (data?.user) {
      currentUser = {
        ...currentUser,
        ...data.user,
        role: normalizeRole(data.user.role)
      };
      localStorage.setItem('user', JSON.stringify(currentUser));
    }
  } catch (error) {
    console.error('Erro ao validar usuário:', error);
  }
}

function renderCurrentUser() {
  const userNameEl = document.getElementById('userName');
  if (userNameEl) {
    userNameEl.textContent = currentUser.name || currentUser.username || 'Usuário';
  }

  const userRoleEl = document.getElementById('userRole');
  if (userRoleEl) {
    userRoleEl.textContent = ROLE_LABELS[getCurrentRole()] || 'Visualizador';
  }
}

async function loadCurrentUserAvatar() {
  const avatarEl = document.getElementById('userAvatar');
  if (!avatarEl) return;

  try {
    const response = await fetch(`${API_URL}/funcionarios/me/foto`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) return;

    const funcionario = await response.json();
    if (funcionario?.foto_path) {
      avatarEl.onerror = () => {
        avatarEl.onerror = null;
        avatarEl.src = 'https://via.placeholder.com/40';
      };
      avatarEl.src = `${API_ORIGIN}${funcionario.foto_path}`;
      avatarEl.alt = funcionario.nome || currentUser.name || 'Avatar';
    }
  } catch (error) {
    console.error('Erro ao carregar avatar do usuário:', error);
  }
}

function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
}

function closeUserMenu() {
  const menu = document.getElementById('userMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

function openChangePasswordModal() {
  closeUserMenu();
  const modal = document.getElementById('changePasswordModal');
  const form = document.getElementById('formChangePassword');
  if (form) {
    form.reset();
  }
  if (modal) {
    modal.style.display = 'flex';
  }
  document.getElementById('newPassword')?.focus();
}

function closeChangePasswordModal() {
  const modal = document.getElementById('changePasswordModal');
  if (modal) {
    modal.style.display = 'none';
  }
  const form = document.getElementById('formChangePassword');
  if (form) {
    form.reset();
  }
}

function applyRolePermissions() {
  syncAdminOnlyTicketFields();

  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    const page = link.dataset.page;
    link.style.display = isPageEnabled(page) ? '' : 'none';
  });

  ALL_PAGES.forEach(page => {
    const pageEl = document.getElementById(page);
    if (!pageEl) return;
    if (!isPageEnabled(page)) {
      pageEl.style.display = 'none';
    }
  });

  const usuariosNav = document.getElementById('navUsuarios');
  if (usuariosNav) {
    usuariosNav.style.display = isPageEnabled('usuarios') && canAccessUsers() ? '' : 'none';
  }

  const usuariosPage = document.getElementById('usuarios');
  if (usuariosPage && !canAccessUsers()) {
    usuariosPage.style.display = 'none';
  }

  const btnNovoFuncionario = document.getElementById('btnNovoFuncionario');
  if (btnNovoFuncionario) {
    btnNovoFuncionario.style.display = canManageFuncionarios() ? '' : 'none';
  }

  const newFuncionarioForm = document.getElementById('newFuncionarioForm');
  if (newFuncionarioForm && !canManageFuncionarios()) {
    newFuncionarioForm.style.display = 'none';
  }

  const btnUploadDocumento = document.getElementById('btnUploadDocumento');
  if (btnUploadDocumento) {
    btnUploadDocumento.style.display = canManageCatalogs() ? '' : 'none';
  }

  const btnNovoComunicado = document.getElementById('btnNovoComunicado');
  if (btnNovoComunicado) {
    btnNovoComunicado.style.display = canManageCatalogs() ? '' : 'none';
  }

  const newComunicadoForm = document.getElementById('newComunicadoForm');
  if (newComunicadoForm && !canManageCatalogs()) {
    newComunicadoForm.style.display = 'none';
  }

  const ideiasAdminSection = document.getElementById('ideiasAdminSection');
  if (ideiasAdminSection) {
    ideiasAdminSection.style.display = canViewIdeasInbox() ? '' : 'none';
  }

  const ideiasViewerNotice = document.getElementById('ideiasViewerNotice');
  if (ideiasViewerNotice) {
    ideiasViewerNotice.style.display = canViewIdeasInbox() ? 'none' : '';
  }

  const chamadoReportSection = document.getElementById('chamadoReportSection');
  if (chamadoReportSection) {
    chamadoReportSection.style.display = isAdmin() ? '' : 'none';
  }

  const infraReportSection = document.getElementById('infraReportSection');
  if (infraReportSection) {
    infraReportSection.style.display = isAdmin() ? '' : 'none';
  }
}

// Carregar página
function loadPage(page, evt) {
  if (!isPageEnabled(page)) {
    alert('Esta funcionalidade está temporariamente desabilitada para a homologação.');
    return;
  }
  if (page === 'usuarios' && !canAccessUsers()) {
    alert('Seu perfil não tem acesso a essa área.');
    return;
  }

  ALL_PAGES.forEach(p => {
    const pageEl = document.getElementById(p);
    if (pageEl) {
      pageEl.style.display = p === page ? 'block' : 'none';
    }
  });

  // Atualizar nav ativa
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const navLink = evt?.target?.closest('.nav-link') || document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navLink) {
    navLink.classList.add('active');
  }

  // Atualizar título
  const titles = {
    dashboard: 'Dashboard',
    chamados: 'Chamados de TI',
    infraestrutura: 'Infraestrutura',
    comunicados: 'Comunicados',
    documentos: 'Repositório de Documentos',
    funcionarios: getFuncionariosTitle(),
    ideias: 'Banco de Ideias',
    usuarios: 'Cadastro de Usuários'
  };
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = titles[page] || 'Dashboard';
  }
  const funcionariosPageHeading = document.getElementById('funcionariosPageHeading');
  if (funcionariosPageHeading) {
    funcionariosPageHeading.textContent = getFuncionariosTitle();
  }

  // Carregar dados da página
  if (page === 'chamados') {
    loadChamados();
  } else if (page === 'infraestrutura') {
    loadInfraChamados();
  } else if (page === 'comunicados') {
    loadComunicados();
  } else if (page === 'documentos') {
    loadDocumentos();
  } else if (page === 'funcionarios') {
    loadFuncionarios();
  } else if (page === 'ideias') {
    loadIdeias();
  } else if (page === 'usuarios') {
    loadUsuarios();
  }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Carregar chamados
    const chamadosRes = await fetch(getChamadosEndpoint({ statusGroup: 'todos' }), { headers });
    const chamados = await chamadosRes.json();
    chamadosCache = Array.isArray(chamados) ? chamados : [];
    const openTickets = chamadosCache.filter(c => c.status === 'aberto').length;
    document.getElementById('openTickets').textContent = openTickets;
    document.getElementById('myTickets').textContent = chamadosCache.length;

    // Carregar comunicados
    const comunicadosRes = await fetch(`${API_URL}/comunicados/list?limit=${RECENT_ANNOUNCEMENTS_LIMIT}`, { headers });
    const comunicados = await comunicadosRes.json();
    const totalAnnouncements = Number(comunicadosRes.headers.get('X-Total-Count')) || comunicados.length;
    document.getElementById('totalAnnouncements').textContent = totalAnnouncements;
    displayRecentAnnouncements(comunicados.slice(0, RECENT_ANNOUNCEMENTS_LIMIT));

    // Carregar documentos
    const documentosRes = await fetch(`${API_URL}/documentos/list`, { headers });
    const documentos = await documentosRes.json();
    document.getElementById('totalDocuments').textContent = documentos.length;
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
  }
}

function displayRecentAnnouncements(comunicados) {
  const container = document.getElementById('recentAnnouncements');
  if (comunicados.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #64748b;">Nenhum comunicado disponível</p>';
    return;
  }

  container.innerHTML = comunicados.map(c => `
    <div class="announcement-item">
      <div class="announcement-header">
        <h4>${c.title}</h4>
        <span class="announcement-badge ${c.priority}">${c.announcement_type === 'birthday' ? 'aniversario' : c.priority}</span>
      </div>
      <p class="announcement-content">${c.content.substring(0, 150)}...</p>
      <p class="announcement-meta">Por ${c.author_name} em ${new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
    </div>
  `).join('');
}

// ==================== CHAMADOS ====================
function showNewChamadoForm() {
  document.getElementById('newChamadoForm').style.display = 'block';
  const requesterField = document.getElementById('chamadoRequester');
  const departmentField = document.getElementById('chamadoDepartment');
  if (requesterField && !requesterField.value) {
    requesterField.value = currentUser.name || currentUser.username || '';
  }
  if (departmentField && currentUser.department && [...departmentField.options].some(option => option.value === currentUser.department)) {
    departmentField.value = currentUser.department || '';
  }
  syncChamadoSubcategoryOptions(document.getElementById('chamadoCategory')?.value || '');
}

function hideChamadoForm() {
  document.getElementById('newChamadoForm').style.display = 'none';
  document.getElementById('formNewChamado').reset();
  syncChamadoSubcategoryOptions();
}

document.getElementById('formNewChamado')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = getFieldValue('chamadoTitle');
  const requesterName = getFieldValue('chamadoRequester');
  const department = getFieldValue('chamadoDepartment');
  const unitName = getFieldValue('chamadoUnit');
  const openingChannel = isAdmin() ? (document.getElementById('chamadoChannel')?.value || 'sistema') : 'sistema';
  const description = getFieldValue('chamadoDescription');
  const category = getFieldValue('chamadoCategory');
  const subcategory = document.getElementById('chamadoSubcategory')?.value || '';
  const priority = getFieldValue('chamadoPriority');
  const urgency = getFieldValue('chamadoUrgency') || 'media';
  const impact = document.getElementById('chamadoImpact')?.value || 'individual';
  const supportLevel = isAdmin() ? (document.getElementById('chamadoSupportLevel')?.value || 'N1') : 'N1';
  const validationErrors = [];

  if (!validateLength(title, 3, 120)) {
    validationErrors.push('Título do chamado deve ter entre 3 e 120 caracteres');
  }
  if (!validateLength(requesterName, 2, 100)) {
    validationErrors.push('Solicitante deve ter entre 2 e 100 caracteres');
  }
  if (!validateLength(department, 2, 100)) {
    validationErrors.push('Setor deve ter entre 2 e 100 caracteres');
  }
  if (!validateLength(unitName, 2, 100)) {
    validationErrors.push('Unidade/local deve ter entre 2 e 100 caracteres');
  }
  if (!validateLength(description, 10, 3000)) {
    validationErrors.push('Descrição do chamado deve ter entre 10 e 3000 caracteres');
  }
  if (!category) {
    validationErrors.push('Selecione uma categoria');
  }
  if (!subcategory) {
    validationErrors.push('Selecione uma subcategoria');
  }
  if (!['baixa', 'normal', 'alta', 'urgente'].includes(priority)) {
    validationErrors.push('Selecione uma prioridade válida');
  }
  if (!['baixa', 'media', 'alta', 'critica'].includes(urgency)) {
    validationErrors.push('Selecione uma urgência válida');
  }

  if (showValidationAlert(validationErrors)) {
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('requester_name', requesterName);
  formData.append('department', department);
  formData.append('unit_name', unitName);
  formData.append('opening_channel', openingChannel);
  formData.append('description', description);
  formData.append('category', category);
  formData.append('subcategory', subcategory);
  formData.append('priority', priority);
  formData.append('urgency', urgency);
  formData.append('impact', impact);
  formData.append('support_level', supportLevel);
  formData.append('assigned_to', isAdmin() ? (document.getElementById('chamadoAssignedTo')?.value || '') : '');
  formData.append('asset_tag', isAdmin() ? getFieldValue('chamadoAssetTag') : '');
  formData.append('serial_number', isAdmin() ? getFieldValue('chamadoSerial') : '');
  formData.append('hostname', isAdmin() ? getFieldValue('chamadoHostname') : '');
  formData.append('extension_number', getFieldValue('chamadoExtension'));
  formData.append('affected_system', getFieldValue('chamadoSystem'));
  formData.append('recurrence_flag', isAdmin() ? (document.getElementById('chamadoRecurrence')?.value || '0') : '0');
  formData.append('recurrence_type', isAdmin() ? getFieldValue('chamadoRecurrenceType') : '');

  const files = document.getElementById('chamadoAttachments').files;
  for (let i = 0; i < files.length; i++) {
    formData.append('attachments', files[i]);
  }

  try {
    const response = await fetch(`${API_URL}/chamados/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await readApiResponse(response);
    if (response.ok) {
      alert(`Chamado criado com sucesso! ${data?.ticketNumber ? `Número: ${data.ticketNumber}` : ''}`.trim());
      hideChamadoForm();
      loadChamados();
    } else {
      const apiMessage = data?.error || (Array.isArray(data?.errors) ? data.errors.map(err => err.msg).join(' | ') : 'Erro ao criar chamado');
      alert(apiMessage);
    }
  } catch (error) {
    alert('Erro ao criar chamado: ' + error.message);
  }
});

document.getElementById('chamadoStatusFilter')?.addEventListener('change', () => {
  loadChamados();
});

document.getElementById('chamadoDateFrom')?.addEventListener('change', () => {
  loadChamados();
});

document.getElementById('chamadoDateTo')?.addEventListener('change', () => {
  loadChamados();
});

document.getElementById('chamadoCategory')?.addEventListener('change', (event) => {
  syncChamadoSubcategoryOptions(event.target.value);
});

['chamadoFilterDepartment', 'chamadoFilterCategory', 'chamadoFilterPriority', 'chamadoFilterChannel', 'chamadoFilterSla', 'chamadoFilterRecurrence', 'chamadoFilterUnit', 'chamadoFilterAssignedTo']
  .forEach(id => document.getElementById(id)?.addEventListener('change', () => loadChamados()));

['chamadoFilterSearch']
  .forEach(id => document.getElementById(id)?.addEventListener('input', () => loadChamados()));

syncChamadoDateInputs();

async function loadChamados() {
  try {
    const filters = getChamadosFilterState();
    if (!validateChamadosDateRange(filters.from, filters.to)) {
      return;
    }

    const response = await fetch(getChamadosEndpoint(filters), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const chamados = await response.json();
    if (!response.ok) {
      throw new Error(chamados?.error || 'Erro ao carregar chamados');
    }

    chamadosCache = sortChamados(Array.isArray(chamados) ? chamados : []);
    const tableBody = document.getElementById('chamadosTableBody');

    if (chamadosCache.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 20px;">Nenhum chamado encontrado</td></tr>';
      await loadChamadosSummary();
      return;
    }

    tableBody.innerHTML = chamadosCache.map(c => `
      <tr>
        <td>${c.ticket_number || `#${c.id}`}</td>
        <td>${c.requester_name || getChamadoUserName(c)}</td>
        <td>${c.department || '-'}</td>
        <td>${c.title}</td>
        <td>${c.category || '-'}</td>
        <td><span class="priority-badge ${c.priority}">${humanizeOptionLabel(c.priority)}</span></td>
        <td><span class="status-badge ${c.status}">${getChamadoStatusLabel(c.status)}</span></td>
        <td>${c.assigned_to_name || '-'}</td>
        <td>${getChamadoSlaLabel(c)}</td>
        <td>${new Date(c.opened_at || c.created_at).toLocaleDateString('pt-BR')}</td>
        <td>
          <button onclick="showChamadoDetails(${c.id})" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">Ver</button>
        </td>
      </tr>
    `).join('');
    await loadChamadosSummary();
  } catch (error) {
    console.error('Erro ao carregar chamados:', error);
  }
}

async function showChamadoDetails(chamadoId) {
  try {
    let chamado = chamadosCache.find(c => c.id === chamadoId);
    if (!chamado && isAdmin()) {
      await loadChamados();
      chamado = chamadosCache.find(c => c.id === chamadoId);
    }

    if (!chamado) {
      alert('Chamado não encontrado.');
      return;
    }

    editingChamadoData = { ...chamado };

    const modal = document.getElementById('chamadoModal');
    const details = document.getElementById('chamadoDetails');

    let attachmentsHTML = '';
    if (chamado.attachments && chamado.attachments.length > 0) {
      attachmentsHTML = `
        <p><strong>Anexos:</strong></p>
        <div style="margin-bottom: 15px;">
          ${chamado.attachments.map(att => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f5f5f5; border-radius: 5px; margin-bottom: 8px;">
              <span style="flex: 1;">📎 ${att.file_name}</span>
              <button onclick="downloadChamadoAttachment(${att.id}, '${att.file_name}')" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px; white-space: nowrap;">⬇️ Download</button>
            </div>
          `).join('')}
        </div>
      `;
    }

    const editSection = isAdmin() ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff;">
        <h3 style="margin-bottom: 12px;">Editar Chamado</h3>
        <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div class="form-group" style="flex: 1; min-width: 180px;">
            <label for="editChamadoPriority">Prioridade</label>
            <select id="editChamadoPriority" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="baixa" ${chamado.priority === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="normal" ${chamado.priority === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="alta" ${chamado.priority === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="urgente" ${chamado.priority === 'urgente' ? 'selected' : ''}>Urgente</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1; min-width: 180px;">
            <label for="editChamadoStatus">Status</label>
            <select id="editChamadoStatus" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              ${['triagem', 'aberto', 'em_atendimento', 'aguardando_usuario', 'aguardando_fornecedor', 'resolvido', 'validado_usuario', 'fechado', 'cancelado', 'reaberto'].map(status => `<option value="${status}" ${chamado.status === status ? 'selected' : ''}>${getChamadoStatusLabel(status)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
          <button class="btn btn-primary" onclick="salvarEdicaoChamado(${chamado.id})">Salvar Alterações</button>
        </div>
      </div>
    ` : '';

    details.innerHTML = `
      <p><strong>ID:</strong> #${chamado.id}</p>
      <p><strong>Título:</strong> ${chamado.title}</p>
      <p><strong>Descrição:</strong> ${chamado.description}</p>
      <p><strong>Categoria:</strong> ${chamado.category || '-'}</p>
      <p><strong>Prioridade:</strong> <span class="priority-badge ${chamado.priority}">${chamado.priority}</span></p>
      <p><strong>Status:</strong> <span class="status-badge ${chamado.status}">${chamado.status}</span></p>
      <p><strong>Data de Criação:</strong> ${new Date(chamado.created_at).toLocaleDateString('pt-BR')}</p>
      ${attachmentsHTML}
      ${editSection}
    `;

    modal.style.display = 'flex';
  } catch (error) {
    console.error('Erro ao buscar detalhes:', error);
  }
}

async function salvarEdicaoChamado(chamadoId) {
  if (!isAdmin()) {
    alert('Seu perfil não tem permissão para editar chamados.');
    return;
  }

  const priority = document.getElementById('editChamadoPriority')?.value;
  const status = document.getElementById('editChamadoStatus')?.value;
  const originalPriority = editingChamadoData?.priority;
  const originalStatus = editingChamadoData?.status;
  const validationErrors = [];

  if (!['baixa', 'normal', 'alta', 'urgente'].includes(priority)) {
    validationErrors.push('Selecione uma prioridade válida');
  }
      if (!['triagem', 'aberto', 'em_atendimento', 'aguardando_usuario', 'aguardando_fornecedor', 'resolvido', 'validado_usuario', 'fechado', 'cancelado', 'reaberto'].includes(status)) {
    validationErrors.push('Selecione um status válido');
  }

  if (showValidationAlert(validationErrors)) {
    return;
  }

  try {
    const priorityChanged = priority !== originalPriority;
    const statusChanged = status !== originalStatus;

    if (!priorityChanged && !statusChanged) {
      alert('Nenhuma alteração detectada.');
      return;
    }

    if (statusChanged) {
      const statusResponse = await fetch(`${API_URL}/chamados/${chamadoId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      const statusData = await readApiResponse(statusResponse);
      const statusMessage = statusData?.error || statusData?.message || (Array.isArray(statusData?.errors) && statusData.errors.length > 0
        ? statusData.errors.map(err => err.msg).join(' | ')
        : null);

      if (!statusResponse.ok) {
        alert(statusMessage || 'Erro ao atualizar status do chamado');
        return;
      }
    }

    if (priorityChanged) {
      const priorityResponse = await fetch(`${API_URL}/chamados/${chamadoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ priority })
      });

      const priorityData = await readApiResponse(priorityResponse);
      const priorityMessage = priorityData?.error || priorityData?.message || (Array.isArray(priorityData?.errors) && priorityData.errors.length > 0
        ? priorityData.errors.map(err => err.msg).join(' | ')
        : null);

      if (!priorityResponse.ok) {
        alert(priorityResponse.status === 404
          ? 'Prioridade não pôde ser alterada porque o backend ainda precisa da rota completa. O status foi atualizado.'
          : (priorityMessage || 'Erro ao atualizar prioridade'));
        if (!statusChanged) {
          return;
        }
      }
    }

    alert(priorityChanged && statusChanged
      ? 'Chamado atualizado com sucesso!'
      : statusChanged
        ? 'Chamado fechado com sucesso!'
        : 'Prioridade atualizada com sucesso!');
    await loadChamados();
    await loadDashboard();
    showChamadoDetails(chamadoId);
  } catch (error) {
    console.error('Erro ao atualizar chamado:', error);
    alert('Erro ao atualizar chamado: ' + error.message);
  }
}

function closeChamadoModal() {
  document.getElementById('chamadoModal').style.display = 'none';
}

async function uploadChamadoAdditionalImages(chamadoId) {
  if (!isAdmin()) {
    alert('Somente administradores podem adicionar imagens após a abertura do chamado.');
    return;
  }

  const input = document.getElementById('editChamadoAdditionalAttachments');
  const files = input?.files;
  if (!files || !files.length) {
    alert('Selecione ao menos uma imagem.');
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('attachments', files[i]);
  }

  try {
    const response = await fetch(`${API_URL}/chamados/${chamadoId}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao adicionar imagens ao chamado');
    }

    if (input) {
      input.value = '';
    }

    alert('Imagens adicionadas com sucesso!');
    await loadChamados();
    await showChamadoDetails(chamadoId);
  } catch (error) {
    console.error('Erro ao adicionar imagens ao chamado:', error);
    alert('Erro ao adicionar imagens ao chamado: ' + error.message);
  }
}

async function showChamadoDetails(chamadoId) {
  try {
    const response = await fetch(`${API_URL}/chamados/${chamadoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const chamado = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(chamado?.error || 'Chamado não encontrado.');
    }

    editingChamadoData = { ...chamado };
    const modal = document.getElementById('chamadoModal');
    const details = document.getElementById('chamadoDetails');

    const attachmentsHTML = (chamado.attachments || []).length
      ? `
        <h3 style="margin-top: 20px;">Anexos</h3>
        <div style="display: grid; gap: 8px;">
          ${chamado.attachments.map(att => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px; background:#f5f7fb; border-radius:8px;">
              <span>${att.file_name}</span>
              <button onclick="downloadChamadoAttachment(${att.id}, '${att.file_name}')" class="btn btn-primary" style="padding:4px 10px; font-size:12px;">Download</button>
            </div>
          `).join('')}
        </div>
      `
      : '';

    const historyHTML = (chamado.history || []).length
      ? `
        <h3 style="margin-top: 20px;">Histórico</h3>
        <div style="display: grid; gap: 8px;">
          ${chamado.history.map(item => `
            <div style="padding:10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc;">
              <strong>${humanizeOptionLabel(item.action_type)}</strong>
              <div style="font-size:12px; color:#64748b;">${item.changed_by_name || 'Sistema'} - ${new Date(item.created_at).toLocaleString('pt-BR')}</div>
              ${item.observation ? `<div>${item.observation}</div>` : ''}
              ${item.from_status || item.to_status ? `<div>Status: ${getChamadoStatusLabel(item.from_status)} → ${getChamadoStatusLabel(item.to_status)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `
      : '';

    const adminTicketFields = isAdmin() ? `
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoAssignedTo">Técnico</label>
            <select id="editChamadoAssignedTo" style="width:100%; padding:8px;">${document.getElementById('chamadoAssignedTo')?.innerHTML || '<option value=\"\">Definir depois</option>'}</select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoStatus">Status</label>
            <select id="editChamadoStatus" style="width:100%; padding:8px;">
              ${['triagem', 'aberto', 'em_atendimento', 'aguardando_usuario', 'aguardando_fornecedor', 'resolvido', 'validado_usuario', 'fechado', 'cancelado', 'reaberto'].map(status => `<option value="${status}" ${chamado.status === status ? 'selected' : ''}>${getChamadoStatusLabel(status)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoImpact">Impacto</label>
            <select id="editChamadoImpact" style="width:100%; padding:8px;">
              <option value="individual" ${chamado.impact === 'individual' ? 'selected' : ''}>Individual</option>
              <option value="setor" ${chamado.impact === 'setor' ? 'selected' : ''}>Setor</option>
              <option value="empresa" ${chamado.impact === 'empresa' ? 'selected' : ''}>Empresa</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoUrgency">Urgência</label>
            <select id="editChamadoUrgency" style="width:100%; padding:8px;">
              <option value="baixa" ${chamado.urgency === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="media" ${!chamado.urgency || chamado.urgency === 'media' ? 'selected' : ''}>Média</option>
              <option value="alta" ${chamado.urgency === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="critica" ${chamado.urgency === 'critica' ? 'selected' : ''}>Crítica</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoSupportLevel">Suporte</label>
            <select id="editChamadoSupportLevel" style="width:100%; padding:8px;">
              <option value="N1" ${chamado.support_level === 'N1' ? 'selected' : ''}>Suporte N1</option>
              <option value="N2" ${chamado.support_level === 'N2' ? 'selected' : ''}>Suporte N2</option>
              <option value="N3" ${chamado.support_level === 'N3' ? 'selected' : ''}>Suporte N3</option>
            </select>
          </div>
    ` : '';

    const additionalImagesSection = isAdmin() ? `
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div class="form-group" style="flex:1;">
            <label for="editChamadoAdditionalAttachments">Adicionar mais imagens</label>
            <input id="editChamadoAdditionalAttachments" type="file" accept="image/*" multiple style="width:100%; padding:8px;">
            <small>Somente administrador pode incluir novas imagens após a abertura.</small>
          </div>
          <div class="form-group" style="min-width:200px;">
            <button class="btn btn-secondary" type="button" onclick="uploadChamadoAdditionalImages(${chamado.id})" style="width:100%;">Enviar imagens</button>
          </div>
        </div>
    ` : '';

    const treatmentSummary = (chamado.action_taken || chamado.solution_applied || chamado.user_validation_status) ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #dbe4f0; border-radius: 10px; background: #ffffff;">
        <h3 style="margin-bottom: 12px;">Solução do técnico</h3>
        <p><strong>Ação executada:</strong> ${escapeHtml(chamado.action_taken || '-')}</p>
        <p><strong>Solução aplicada:</strong> ${escapeHtml(chamado.solution_applied || '-')}</p>
        <p><strong>Validação do usuário:</strong> ${getUserValidationLabel(chamado.user_validation_status)}</p>
        ${chamado.user_validation_comment ? `<p><strong>Situação descrita:</strong> ${escapeHtml(chamado.user_validation_comment)}</p>` : ''}
      </div>
    ` : '';

    const validationSection = canValidateChamadoSolution(chamado) ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #bfdbfe; border-radius: 10px; background: #eff6ff;">
        <h3 style="margin-bottom: 12px;">Validar solução</h3>
        <div class="form-group">
          <label for="chamadoValidationComment">Descreva a situação, principalmente se ainda não foi resolvida</label>
          <textarea id="chamadoValidationComment" rows="3" maxlength="500" style="width:100%; padding:8px;"></textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button class="btn btn-secondary" onclick="validarSolucaoChamado(${chamado.id}, false)">Não validar e reabrir</button>
          <button class="btn btn-primary" onclick="validarSolucaoChamado(${chamado.id}, true)">Validar solução</button>
        </div>
      </div>
    ` : '';

    const editSection = isAdmin() ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff;">
        <h3 style="margin-bottom: 12px;">Tratativa e fechamento</h3>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          ${adminTicketFields}
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoCategory">Categoria</label>
            <select id="editChamadoCategory" style="width:100%; padding:8px;">
              ${buildChamadoCategoryOptionsHtml(chamado.category || '')}
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoSubcategory">Subcategoria</label>
            <select id="editChamadoSubcategory" style="width:100%; padding:8px;">
              ${buildChamadoSubcategoryOptionsHtml(chamado.category || '', chamado.subcategory || '')}
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editChamadoPriority">Prioridade</label>
            <select id="editChamadoPriority" style="width:100%; padding:8px;">
              <option value="baixa" ${chamado.priority === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="normal" ${chamado.priority === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="alta" ${chamado.priority === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="urgente" ${chamado.priority === 'urgente' ? 'selected' : ''}>Urgente</option>
            </select>
          </div>
        </div>
        ${isAdmin() ? `
          <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
            <div class="form-group" style="flex:1;">
              <label for="editChamadoAssetTag">Patrimônio</label>
              <input id="editChamadoAssetTag" type="text" value="${chamado.asset_tag || ''}" style="width:100%; padding:8px;">
            </div>
            <div class="form-group" style="flex:1;">
              <label for="editChamadoSerial">Número de Série</label>
              <input id="editChamadoSerial" type="text" value="${chamado.serial_number || ''}" style="width:100%; padding:8px;">
            </div>
            <div class="form-group" style="flex:1;">
              <label for="editChamadoHostname">Hostname/Máquina</label>
              <input id="editChamadoHostname" type="text" value="${chamado.hostname || ''}" style="width:100%; padding:8px;">
            </div>
          </div>
          <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:180px;">
              <label for="editChamadoRecurrence">Problema recorrente?</label>
              <select id="editChamadoRecurrence" style="width:100%; padding:8px;">
                <option value="0" ${Number(chamado.recurrence_flag || 0) === 0 ? 'selected' : ''}>Não</option>
                <option value="1" ${Number(chamado.recurrence_flag || 0) === 1 ? 'selected' : ''}>Sim</option>
              </select>
            </div>
          </div>
        ` : ''}
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1;">
            <label for="editChamadoAttendanceType">Tipo de atendimento</label>
            <select id="editChamadoAttendanceType" style="width:100%; padding:8px;">
              <option value="">Selecione...</option>
              <option value="remoto" ${chamado.attendance_type === 'remoto' ? 'selected' : ''}>Remoto</option>
              <option value="presencial" ${chamado.attendance_type === 'presencial' ? 'selected' : ''}>Presencial</option>
              <option value="externo" ${chamado.attendance_type === 'externo' ? 'selected' : ''}>Externo</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1;">
            <label for="editChamadoRootCause">Causa</label>
            <textarea id="editChamadoRootCause" rows="2" style="width:100%; padding:8px;">${chamado.root_cause || ''}</textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editChamadoActionTaken">Ação executada</label>
            <textarea id="editChamadoActionTaken" rows="2" style="width:100%; padding:8px;">${chamado.action_taken || ''}</textarea>
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1;">
            <label for="editChamadoSolutionApplied">Solução aplicada</label>
            <textarea id="editChamadoSolutionApplied" rows="2" style="width:100%; padding:8px;">${chamado.solution_applied || ''}</textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editChamadoObservation">Observação</label>
            <textarea id="editChamadoObservation" rows="2" style="width:100%; padding:8px;"></textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editChamadoPauseReason">Motivo Pausa SLA</label>
            <textarea id="editChamadoPauseReason" rows="2" style="width:100%; padding:8px;" placeholder="Obrigatório quando estiver aguardando usuário ou fornecedor">${chamado.sla_pause_reason || ''}</textarea>
          </div>
        </div>
        ${additionalImagesSection}
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button class="btn btn-secondary" onclick="reabrirChamado(${chamado.id})">Reabrir</button>
          <button class="btn btn-primary" onclick="salvarEdicaoChamado(${chamado.id})">Salvar alterações</button>
        </div>
      </div>
    ` : '';

    details.innerHTML = `
      <p><strong>Número:</strong> ${chamado.ticket_number || `#${chamado.id}`}</p>
      <p><strong>Solicitante:</strong> ${chamado.requester_name || getChamadoUserName(chamado)}</p>
      <p><strong>Setor:</strong> ${chamado.department || '-'}</p>
      <p><strong>Unidade:</strong> ${chamado.unit_name || '-'}</p>
      <p><strong>Canal:</strong> ${humanizeOptionLabel(chamado.opening_channel || '-')}</p>
      <p><strong>Categoria:</strong> ${chamado.category || '-'} / ${humanizeOptionLabel(chamado.subcategory || '-')}</p>
      <p><strong>Descrição:</strong> ${chamado.description}</p>
      <p><strong>Impacto:</strong> ${humanizeOptionLabel(chamado.impact || '-')}</p>
      <p><strong>Urgência:</strong> ${humanizeOptionLabel(chamado.urgency || 'media')}</p>
      <p><strong>Suporte:</strong> ${chamado.support_level || '-'}</p>
      <p><strong>Prioridade:</strong> <span class="priority-badge ${chamado.priority}">${humanizeOptionLabel(chamado.priority)}</span></p>
      <p><strong>Status:</strong> <span class="status-badge ${chamado.status}">${getChamadoStatusLabel(chamado.status)}</span></p>
      <p><strong>SLA:</strong> ${getChamadoSlaLabel(chamado)}</p>
      <p><strong>Técnico:</strong> ${chamado.assigned_to_name || '-'}</p>
      <p><strong>Abertura:</strong> ${new Date(chamado.opened_at || chamado.created_at).toLocaleString('pt-BR')}</p>
      <p><strong>Primeiro atendimento:</strong> ${chamado.first_response_at ? new Date(chamado.first_response_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Início do atendimento:</strong> ${chamado.service_started_at ? new Date(chamado.service_started_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Resolução:</strong> ${chamado.resolved_at ? new Date(chamado.resolved_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Encerramento:</strong> ${chamado.closed_at ? new Date(chamado.closed_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Tempo de atendimento:</strong> ${chamado.service_started_at ? formatDurationSeconds(getChamadoServiceSeconds(chamado)) : '-'}</p>
      <p><strong>Tempo em espera:</strong> ${formatDurationSeconds((Number(chamado.waiting_user_seconds || 0) + Number(chamado.waiting_vendor_seconds || 0)))}</p>
      <p><strong>Tempo de fechamento:</strong> ${chamado.resolved_at && chamado.closed_at ? formatDurationSeconds(getChamadoClosingSeconds(chamado)) : '-'}</p>
      <p><strong>Motivo de pausa:</strong> ${chamado.sla_pause_reason || '-'}</p>
      <p><strong>Ativos vinculados:</strong> ${[chamado.asset_tag, chamado.serial_number, chamado.hostname].filter(Boolean).join(' / ') || '-'}</p>
      <p><strong>Sistema afetado:</strong> ${chamado.affected_system || '-'}</p>
      <p><strong>Recorrência:</strong> ${Number(chamado.recurrence_flag || 0) === 1 ? `Sim${chamado.recurrence_type ? ` - ${chamado.recurrence_type}` : ''}` : 'Não'}</p>
      ${treatmentSummary}
      ${validationSection}
      ${attachmentsHTML}
      ${historyHTML}
      ${editSection}
    `;

    const editAssignedTo = document.getElementById('editChamadoAssignedTo');
    if (editAssignedTo) {
      editAssignedTo.value = chamado.assigned_to || '';
    }

    const editCategory = document.getElementById('editChamadoCategory');
    if (editCategory) {
      editCategory.addEventListener('change', event => syncEditChamadoSubcategoryOptions(event.target.value));
    }
    modal.style.display = 'flex';
  } catch (error) {
    console.error('Erro ao buscar detalhes:', error);
    alert('Erro ao carregar detalhes do chamado: ' + error.message);
  }
}

async function salvarEdicaoChamado(chamadoId) {
  if (!isAdmin()) {
    alert('Seu perfil não tem permissão para editar chamados.');
    return;
  }

  try {
    const payload = {
      category: document.getElementById('editChamadoCategory')?.value || '',
      subcategory: document.getElementById('editChamadoSubcategory')?.value || '',
      priority: document.getElementById('editChamadoPriority')?.value || '',
      attendance_type: document.getElementById('editChamadoAttendanceType')?.value || '',
      root_cause: document.getElementById('editChamadoRootCause')?.value || '',
      action_taken: document.getElementById('editChamadoActionTaken')?.value || '',
      solution_applied: document.getElementById('editChamadoSolutionApplied')?.value || '',
      observation: document.getElementById('editChamadoObservation')?.value || ''
    };

    if (isAdmin()) {
      payload.assigned_to = document.getElementById('editChamadoAssignedTo')?.value || '';
      payload.status = document.getElementById('editChamadoStatus')?.value || '';
      payload.impact = document.getElementById('editChamadoImpact')?.value || '';
      payload.urgency = document.getElementById('editChamadoUrgency')?.value || '';
      payload.support_level = document.getElementById('editChamadoSupportLevel')?.value || '';
      payload.sla_pause_reason = document.getElementById('editChamadoPauseReason')?.value || '';
      payload.asset_tag = document.getElementById('editChamadoAssetTag')?.value || '';
      payload.serial_number = document.getElementById('editChamadoSerial')?.value || '';
      payload.hostname = document.getElementById('editChamadoHostname')?.value || '';
      payload.recurrence_flag = document.getElementById('editChamadoRecurrence')?.value || '0';
    }

    if (['resolvido', 'fechado', 'concluido', 'encerrado'].includes(payload.status)) {
      const missingFields = [];
      if (!payload.category) missingFields.push('categoria');
      if (!payload.subcategory) missingFields.push('subcategoria');
      if (!payload.attendance_type) missingFields.push('tipo de atendimento');
      if (!payload.root_cause) missingFields.push('causa');
      if (!payload.action_taken) missingFields.push('acao executada');
      if (!payload.solution_applied) missingFields.push('solucao aplicada');

      if (missingFields.length) {
        alert(`Para resolver o chamado, preencha: ${missingFields.join(', ')}.`);
        return;
      }
    }

    if (['aguardando_usuario', 'aguardando_fornecedor'].includes(payload.status) && !payload.sla_pause_reason) {
      alert('Informe o motivo de pausa do SLA.');
      return;
    }

    const response = await fetch(`${API_URL}/chamados/${chamadoId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao atualizar chamado');
    }

    alert('Chamado atualizado com sucesso!');
    await loadChamados();
    await showChamadoDetails(chamadoId);
  } catch (error) {
    console.error('Erro ao atualizar chamado:', error);
    alert('Erro ao atualizar chamado: ' + error.message);
  }
}

async function validarSolucaoChamado(chamadoId, approved) {
  const comment = document.getElementById('chamadoValidationComment')?.value?.trim() || '';
  if (!approved && comment.length < 5) {
    alert('Descreva o que ainda não foi resolvido para reabrir o chamado.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/chamados/${chamadoId}/validation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ approved, comment })
    });
    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao validar solucao');
    }

    alert(data?.message || (approved ? 'Solucao validada. Aguardando fechamento pelo administrador.' : 'Chamado reaberto para nova tratativa.'));
    await loadChamados();
    await showChamadoDetails(chamadoId);
  } catch (error) {
    alert('Erro ao validar solucao: ' + error.message);
  }
}

async function reabrirChamado(chamadoId) {
  if (!isAdmin()) {
    alert('A reabertura do chamado é permitida somente para administradores.');
    return;
  }
  const reason = prompt('Informe o motivo da reabertura do chamado:');
  if (!reason) return;

  try {
    const response = await fetch(`${API_URL}/chamados/${chamadoId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason })
    });
    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao reabrir chamado');
    }

    alert('Chamado reaberto com sucesso!');
    await loadChamados();
    await showChamadoDetails(chamadoId);
  } catch (error) {
    alert('Erro ao reabrir chamado: ' + error.message);
  }
}

function downloadChamadoAttachment(attachmentId, fileName) {
  try {
    const downloadUrl = `${API_URL}/chamados/download/${attachmentId}`;
    const token = localStorage.getItem('token');
    
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Erro ao fazer download: ${response.statusText}`);
      }
      return response.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'anexo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    })
    .catch(error => {
      console.error('Erro ao fazer download:', error);
      alert('Erro ao fazer download: ' + error.message);
    });
  } catch (error) {
    console.error('Erro ao fazer download:', error);
    alert('Erro ao fazer download do anexo');
  }
}

// ==================== INFRAESTRUTURA ====================
function showNewInfraChamadoForm() {
  document.getElementById('newInfraChamadoForm').style.display = 'block';
  const requesterField = document.getElementById('infraRequester');
  const departmentField = document.getElementById('infraDepartment');
  if (requesterField && !requesterField.value) {
    requesterField.value = currentUser.name || currentUser.username || '';
  }
  if (departmentField && currentUser.department && [...departmentField.options].some(option => option.value === currentUser.department)) {
    departmentField.value = currentUser.department || '';
  }
  syncInfraSubcategoryOptions(document.getElementById('infraCategory')?.value || '');
}

function hideInfraChamadoForm() {
  document.getElementById('newInfraChamadoForm').style.display = 'none';
  document.getElementById('formNewInfraChamado').reset();
  syncInfraSubcategoryOptions();
}

document.getElementById('formNewInfraChamado')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = getFieldValue('infraTitle');
  const requesterName = getFieldValue('infraRequester');
  const department = getFieldValue('infraDepartment');
  const unitName = getFieldValue('infraUnit');
  const description = getFieldValue('infraDescription');
  const category = getFieldValue('infraCategory');
  const subcategory = document.getElementById('infraSubcategory')?.value || '';
  const priority = getFieldValue('infraPriority');
  const validationErrors = [];

  if (!validateLength(title, 3, 120)) validationErrors.push('Titulo deve ter entre 3 e 120 caracteres');
  if (!validateLength(requesterName, 2, 100)) validationErrors.push('Solicitante deve ter entre 2 e 100 caracteres');
  if (!validateLength(department, 2, 100)) validationErrors.push('Setor deve ter entre 2 e 100 caracteres');
  if (!validateLength(unitName, 2, 100)) validationErrors.push('Unidade/local deve ter entre 2 e 100 caracteres');
  if (!validateLength(description, 10, 3000)) validationErrors.push('Descricao deve ter entre 10 e 3000 caracteres');
  if (!category) validationErrors.push('Selecione uma categoria');
  if (!subcategory) validationErrors.push('Selecione uma subcategoria');
  if (!['baixa', 'media', 'alta', 'critica'].includes(priority)) validationErrors.push('Selecione uma prioridade valida');

  if (showValidationAlert(validationErrors)) return;

  const formData = new FormData();
  formData.append('title', title);
  formData.append('requester_name', requesterName);
  formData.append('department', department);
  formData.append('unit_name', unitName);
  formData.append('description', description);
  formData.append('category', category);
  formData.append('subcategory', subcategory);
  formData.append('priority', priority);
  formData.append('impact', document.getElementById('infraImpact')?.value || 'individual');
  formData.append('urgency', document.getElementById('infraUrgency')?.value || 'media');
  formData.append('support_level', 'N1');
  formData.append('environment', getFieldValue('infraEnvironment'));
  formData.append('asset_identifier', getFieldValue('infraAssetIdentifier'));
  formData.append('safety_risk', document.getElementById('infraSafetyRisk')?.value || '0');
  formData.append('activity_interrupted', document.getElementById('infraActivityInterrupted')?.value || '0');
  formData.append('needs_approval', isAdmin() ? (document.getElementById('infraNeedsApproval')?.value || '0') : '0');
  formData.append('assigned_to', isAdmin() ? (document.getElementById('infraAssignedTo')?.value || '') : '');
  formData.append('supplier_name', isAdmin() ? getFieldValue('infraSupplierName') : '');
  formData.append('estimated_cost', isAdmin() ? getFieldValue('infraEstimatedCost') : '');

  const files = document.getElementById('infraAttachments').files;
  for (let i = 0; i < files.length; i++) {
    formData.append('attachments', files[i]);
  }

  try {
    const response = await fetch(`${API_URL}/infraestrutura/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await readApiResponse(response);
    if (!response.ok) {
      const apiMessage = data?.error || (Array.isArray(data?.errors) ? data.errors.map(err => err.msg).join(' | ') : 'Erro ao criar chamado');
      alert(apiMessage);
      return;
    }
    alert(`Chamado de infraestrutura criado com sucesso! ${data?.ticketNumber ? `Numero: ${data.ticketNumber}` : ''}`.trim());
    hideInfraChamadoForm();
    loadInfraChamados();
  } catch (error) {
    alert('Erro ao criar chamado de infraestrutura: ' + error.message);
  }
});

document.getElementById('infraCategory')?.addEventListener('change', event => {
  syncInfraSubcategoryOptions(event.target.value);
});

['infraStatusFilter', 'infraDateFrom', 'infraDateTo', 'infraFilterDepartment', 'infraFilterCategory', 'infraFilterPriority', 'infraFilterSla', 'infraFilterUnit', 'infraFilterAssignedTo']
  .forEach(id => document.getElementById(id)?.addEventListener('change', () => loadInfraChamados()));

document.getElementById('infraFilterSearch')?.addEventListener('input', () => loadInfraChamados());

async function loadInfraChamados() {
  try {
    const filters = getInfraFilterState();
    if (!validateChamadosDateRange(filters.from, filters.to)) {
      return;
    }

    const response = await fetch(getInfraEndpoint(filters), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(data?.error || 'Erro ao carregar chamados de infraestrutura');

    infraChamadosCache = sortInfraChamados(Array.isArray(data) ? data : []);
    const tableBody = document.getElementById('infraTableBody');
    if (!tableBody) return;

    if (infraChamadosCache.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 20px;">Nenhum chamado de infraestrutura encontrado</td></tr>';
      await loadInfraSummary();
      return;
    }

    tableBody.innerHTML = infraChamadosCache.map(c => `
      <tr>
        <td>${c.ticket_number || `#${c.id}`}</td>
        <td>${c.requester_name || getChamadoUserName(c)}</td>
        <td>${c.department || '-'}</td>
        <td>${escapeHtml(c.title)}</td>
        <td>${c.category || '-'}</td>
        <td><span class="priority-badge ${c.priority}">${humanizeOptionLabel(c.priority)}</span></td>
        <td><span class="status-badge ${c.status}">${getInfraStatusLabel(c.status)}</span></td>
        <td>${c.assigned_to_name || '-'}</td>
        <td>${getInfraSlaLabel(c)}</td>
        <td>${new Date(c.opened_at || c.created_at).toLocaleDateString('pt-BR')}</td>
        <td>
          <button onclick="showInfraDetails(${c.id})" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">Ver</button>
        </td>
      </tr>
    `).join('');
    await loadInfraSummary();
  } catch (error) {
    console.error('Erro ao carregar chamados de infraestrutura:', error);
  }
}

async function loadInfraSummary() {
  if (!isAdmin()) return;
  try {
    const response = await fetch(`${API_URL}/infraestrutura/summary?${new URLSearchParams(getInfraFilterState()).toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const data = await response.json();
    document.getElementById('infraReportOpened').textContent = data?.totals?.opened || 0;
    document.getElementById('infraReportClosed').textContent = data?.totals?.closed || 0;
    document.getElementById('infraReportApproval').textContent = data?.totals?.awaitingApproval || 0;
    document.getElementById('infraReportSla').textContent = `${Number(data?.sla?.withinPercentage || 0).toFixed(0)}%`;
  } catch (error) {
    console.error('Erro ao carregar resumo de infraestrutura:', error);
  }
}

async function showInfraDetails(chamadoId) {
  try {
    const response = await fetch(`${API_URL}/infraestrutura/${chamadoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const chamado = await readApiResponse(response);
    if (!response.ok) throw new Error(chamado?.error || 'Chamado de infraestrutura não encontrado');

    editingInfraChamadoData = { ...chamado };
    const modal = document.getElementById('chamadoModal');
    const details = document.getElementById('chamadoDetails');

    const attachmentsHTML = (chamado.attachments || []).length
      ? `
        <h3 style="margin-top: 20px;">Anexos</h3>
        <div style="display: grid; gap: 8px;">
          ${chamado.attachments.map(att => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px; background:#f5f7fb; border-radius:8px;">
              <span>${escapeHtml(att.file_name)}</span>
              <button onclick="downloadInfraAttachment(${att.id}, '${escapeHtml(att.file_name)}')" class="btn btn-primary" style="padding:4px 10px; font-size:12px;">Download</button>
            </div>
          `).join('')}
        </div>
      `
      : '';

    const historyHTML = (chamado.history || []).length
      ? `
        <h3 style="margin-top: 20px;">Historico</h3>
        <div style="display: grid; gap: 8px;">
          ${chamado.history.map(item => `
            <div style="padding:10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc;">
              <strong>${humanizeOptionLabel(item.action_type)}</strong>
              <div style="font-size:12px; color:#64748b;">${item.changed_by_name || 'Sistema'} - ${new Date(item.created_at).toLocaleString('pt-BR')}</div>
              ${item.observation ? `<div>${escapeHtml(item.observation)}</div>` : ''}
              ${item.from_status || item.to_status ? `<div>Status: ${getInfraStatusLabel(item.from_status)} -> ${getInfraStatusLabel(item.to_status)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `
      : '';

    const treatmentSummary = (chamado.action_taken || chamado.solution_applied || chamado.user_validation_status || chamado.status === 'resolvido') ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #dbe4f0; border-radius: 10px; background: #ffffff;">
        <h3 style="margin-bottom: 12px;">Solução do técnico</h3>
        <p><strong>Ação executada:</strong> ${escapeHtml(chamado.action_taken || '-')}</p>
        <p><strong>Solução aplicada:</strong> ${escapeHtml(chamado.solution_applied || '-')}</p>
        <p><strong>Validação do usuário:</strong> ${getUserValidationLabel(chamado.user_validation_status)}</p>
        ${chamado.user_validation_comment ? `<p><strong>Situação descrita:</strong> ${escapeHtml(chamado.user_validation_comment)}</p>` : ''}
      </div>
    ` : '';

    const validationSection = canValidateInfraSolution(chamado) ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #bfdbfe; border-radius: 10px; background: #eff6ff;">
        <h3 style="margin-bottom: 12px;">Validar solução</h3>
        <div class="form-group">
          <label for="infraValidationComment">Descreva a situação, principalmente se ainda não foi resolvida</label>
          <textarea id="infraValidationComment" rows="3" maxlength="500" style="width:100%; padding:8px;"></textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button class="btn btn-secondary" onclick="validarSolucaoInfra(${chamado.id}, false)">Não validar e reabrir</button>
          <button class="btn btn-primary" onclick="validarSolucaoInfra(${chamado.id}, true)">Validar solução</button>
        </div>
      </div>
    ` : '';

    const additionalImagesSection = isAdmin() ? `
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div class="form-group" style="flex:1;">
            <label for="editInfraAdditionalAttachments">Adicionar mais imagens</label>
            <input id="editInfraAdditionalAttachments" type="file" accept="image/*" multiple style="width:100%; padding:8px;">
            <small>Somente administrador pode incluir novas imagens após a abertura.</small>
          </div>
          <div class="form-group" style="min-width:200px;">
            <button class="btn btn-secondary" type="button" onclick="uploadInfraAdditionalImages(${chamado.id})" style="width:100%;">Enviar imagens</button>
          </div>
        </div>
    ` : '';

    const editSection = isAdmin() ? `
      <div style="margin-top: 20px; padding: 16px; border: 1px solid #dbe4f0; border-radius: 10px; background: #f8fbff;">
        <h3 style="margin-bottom: 12px;">Tratativa e fechamento</h3>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraAssignedTo">Tecnico</label>
            <select id="editInfraAssignedTo" style="width:100%; padding:8px;">${document.getElementById('infraAssignedTo')?.innerHTML || '<option value="">Definir depois</option>'}</select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraStatus">Status</label>
            <select id="editInfraStatus" style="width:100%; padding:8px;">
              ${['aberto', 'triagem', 'aguardando_informacoes', 'aguardando_aprovacao', 'aguardando_orcamento', 'aguardando_fornecedor', 'em_atendimento', 'pendente_material', 'pendente_agendamento', 'resolvido', 'validado_usuario', 'finalizado', 'cancelado', 'reaberto'].map(status => `<option value="${status}" ${chamado.status === status ? 'selected' : ''}>${getInfraStatusLabel(status)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraImpact">Impacto</label>
            <select id="editInfraImpact" style="width:100%; padding:8px;">
              <option value="individual" ${chamado.impact === 'individual' ? 'selected' : ''}>Individual</option>
              <option value="setor" ${chamado.impact === 'setor' ? 'selected' : ''}>Setor</option>
              <option value="empresa" ${chamado.impact === 'empresa' ? 'selected' : ''}>Empresa</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraUrgency">Urgencia</label>
            <select id="editInfraUrgency" style="width:100%; padding:8px;">
              <option value="baixa" ${chamado.urgency === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="media" ${!chamado.urgency || chamado.urgency === 'media' ? 'selected' : ''}>Media</option>
              <option value="alta" ${chamado.urgency === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="critica" ${chamado.urgency === 'critica' ? 'selected' : ''}>Critica</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraSupportLevel">Suporte</label>
            <select id="editInfraSupportLevel" style="width:100%; padding:8px;">
              <option value="N1" ${!chamado.support_level || chamado.support_level === 'N1' ? 'selected' : ''}>Suporte N1</option>
              <option value="N2" ${chamado.support_level === 'N2' ? 'selected' : ''}>Suporte N2</option>
              <option value="N3" ${chamado.support_level === 'N3' ? 'selected' : ''}>Suporte N3</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraCategory">Categoria</label>
            <select id="editInfraCategory" style="width:100%; padding:8px;">${buildInfraCategoryOptionsHtml(chamado.category || '')}</select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraSubcategory">Subcategoria</label>
            <select id="editInfraSubcategory" style="width:100%; padding:8px;">${buildInfraSubcategoryOptionsHtml(chamado.category || '', chamado.subcategory || '')}</select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraPriority">Prioridade</label>
            <select id="editInfraPriority" style="width:100%; padding:8px;">
              <option value="baixa" ${chamado.priority === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="media" ${chamado.priority === 'media' ? 'selected' : ''}>Media</option>
              <option value="alta" ${chamado.priority === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="critica" ${chamado.priority === 'critica' ? 'selected' : ''}>Critica</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1;">
            <label for="editInfraAssetIdentifier">Patrimonio</label>
            <input id="editInfraAssetIdentifier" type="text" value="${escapeHtml(chamado.asset_identifier || '')}" style="width:100%; padding:8px;">
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editInfraEnvironment">Ambiente/Sala</label>
            <input id="editInfraEnvironment" type="text" value="${escapeHtml(chamado.environment || '')}" style="width:100%; padding:8px;">
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editInfraSupplierName">Fornecedor</label>
            <input id="editInfraSupplierName" type="text" value="${escapeHtml(chamado.supplier_name || '')}" style="width:100%; padding:8px;">
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraRecurrence">Problema recorrente?</label>
            <select id="editInfraRecurrence" style="width:100%; padding:8px;">
              <option value="0" ${Number(chamado.recurrence_flag || 0) === 0 ? 'selected' : ''}>Nao</option>
              <option value="1" ${Number(chamado.recurrence_flag || 0) === 1 ? 'selected' : ''}>Sim</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:180px;">
            <label for="editInfraAttendanceType">Tipo de atendimento</label>
            <select id="editInfraAttendanceType" style="width:100%; padding:8px;">
              <option value="">Selecione...</option>
              <option value="presencial" ${chamado.attendance_type === 'presencial' ? 'selected' : ''}>Presencial</option>
              <option value="externo" ${chamado.attendance_type === 'externo' ? 'selected' : ''}>Externo</option>
              <option value="fornecedor" ${chamado.attendance_type === 'fornecedor' ? 'selected' : ''}>Fornecedor</option>
              <option value="interno" ${chamado.attendance_type === 'interno' ? 'selected' : ''}>Interno</option>
              <option value="misto" ${chamado.attendance_type === 'misto' ? 'selected' : ''}>Misto</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1;">
            <label for="editInfraRootCause">Causa</label>
            <textarea id="editInfraRootCause" rows="2" style="width:100%; padding:8px;">${escapeHtml(chamado.root_cause || '')}</textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editInfraActionTaken">Ação executada</label>
            <textarea id="editInfraActionTaken" rows="2" style="width:100%; padding:8px;">${escapeHtml(chamado.action_taken || '')}</textarea>
          </div>
        </div>
        <div class="form-row" style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1;">
            <label for="editInfraSolutionApplied">Solução aplicada</label>
            <textarea id="editInfraSolutionApplied" rows="2" style="width:100%; padding:8px;">${escapeHtml(chamado.solution_applied || '')}</textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editInfraObservation">Observacao</label>
            <textarea id="editInfraObservation" rows="2" style="width:100%; padding:8px;"></textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label for="editInfraPauseReason">Motivo Pausa SLA</label>
            <textarea id="editInfraPauseReason" rows="2" style="width:100%; padding:8px;" placeholder="Obrigatório quando estiver aguardando informações, aprovação, orçamento, fornecedor, material ou agendamento">${escapeHtml(chamado.sla_pause_reason || '')}</textarea>
          </div>
        </div>
        ${additionalImagesSection}
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button class="btn btn-secondary" onclick="reabrirInfraChamado(${chamado.id})">Reabrir</button>
          <button class="btn btn-primary" onclick="salvarEdicaoInfraChamado(${chamado.id})">Salvar alteracoes</button>
        </div>
      </div>
    ` : '';

    details.innerHTML = `
      <p><strong>Número:</strong> ${chamado.ticket_number || `#${chamado.id}`}</p>
      <p><strong>Solicitante:</strong> ${escapeHtml(chamado.requester_name || getChamadoUserName(chamado))}</p>
      <p><strong>Setor:</strong> ${escapeHtml(chamado.department || '-')}</p>
      <p><strong>Unidade:</strong> ${escapeHtml(chamado.unit_name || '-')}</p>
      <p><strong>Canal:</strong> ${humanizeOptionLabel(chamado.opening_channel || 'sistema')}</p>
      <p><strong>Categoria:</strong> ${escapeHtml(chamado.category || '-')} / ${humanizeOptionLabel(chamado.subcategory || '-')}</p>
      <p><strong>Descricao:</strong> ${escapeHtml(chamado.description || '-')}</p>
      <p><strong>Impacto:</strong> ${humanizeOptionLabel(chamado.impact || '-')}</p>
      <p><strong>Urgencia:</strong> ${humanizeOptionLabel(chamado.urgency || 'media')}</p>
      <p><strong>Suporte:</strong> ${chamado.support_level || 'N1'}</p>
      <p><strong>Prioridade:</strong> <span class="priority-badge ${chamado.priority}">${humanizeOptionLabel(chamado.priority)}</span></p>
      <p><strong>Status:</strong> <span class="status-badge ${chamado.status}">${getInfraStatusLabel(chamado.status)}</span></p>
      <p><strong>SLA:</strong> ${getInfraSlaLabel(chamado)}</p>
      <p><strong>Tecnico:</strong> ${escapeHtml(chamado.assigned_to_name || '-')}</p>
      <p><strong>Abertura:</strong> ${new Date(chamado.opened_at || chamado.created_at).toLocaleString('pt-BR')}</p>
      <p><strong>Primeiro atendimento:</strong> ${chamado.first_response_at ? new Date(chamado.first_response_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Inicio do atendimento:</strong> ${chamado.service_started_at ? new Date(chamado.service_started_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Resolucao:</strong> ${chamado.resolved_at ? new Date(chamado.resolved_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Encerramento:</strong> ${chamado.closed_at ? new Date(chamado.closed_at).toLocaleString('pt-BR') : '-'}</p>
      <p><strong>Tempo de atendimento:</strong> ${chamado.service_started_at ? formatDurationSeconds(getChamadoServiceSeconds(chamado)) : '-'}</p>
      <p><strong>Tempo em espera:</strong> ${formatDurationSeconds(getChamadoWaitingSeconds(chamado))}</p>
      <p><strong>Tempo de fechamento:</strong> ${chamado.resolved_at && chamado.closed_at ? formatDurationSeconds(getChamadoClosingSeconds(chamado)) : '-'}</p>
      <p><strong>Motivo de pausa:</strong> ${escapeHtml(chamado.sla_pause_reason || '-')}</p>
      <p><strong>Ativos vinculados:</strong> ${[chamado.asset_identifier, chamado.environment].filter(Boolean).map(escapeHtml).join(' / ') || '-'}</p>
      <p><strong>Sistema afetado:</strong> ${escapeHtml(chamado.environment || '-')}</p>
      <p><strong>Recorrencia:</strong> ${Number(chamado.recurrence_flag || 0) === 1 ? `Sim${chamado.recurrence_type ? ` - ${escapeHtml(chamado.recurrence_type)}` : ''}` : 'Nao'}</p>
      <p><strong>Risco a seguranca:</strong> ${Number(chamado.safety_risk || 0) === 1 ? 'Sim' : 'Nao'}</p>
      <p><strong>Atividade interrompida:</strong> ${Number(chamado.activity_interrupted || 0) === 1 ? 'Sim' : 'Nao'}</p>
      <p><strong>Exige aprovacao:</strong> ${Number(chamado.needs_approval || 0) === 1 ? 'Sim' : 'Nao'}</p>
      <p><strong>Fornecedor:</strong> ${escapeHtml(chamado.supplier_name || '-')}</p>
      ${treatmentSummary}
      ${validationSection}
      ${attachmentsHTML}
      ${historyHTML}
      ${editSection}
    `;

    const editAssignedTo = document.getElementById('editInfraAssignedTo');
    if (editAssignedTo) editAssignedTo.value = chamado.assigned_to || '';
    const editCategory = document.getElementById('editInfraCategory');
    if (editCategory) editCategory.addEventListener('change', event => syncEditInfraSubcategoryOptions(event.target.value));
    modal.style.display = 'flex';
  } catch (error) {
    console.error('Erro ao buscar detalhes de infraestrutura:', error);
    alert('Erro ao carregar detalhes: ' + error.message);
  }
}

async function salvarEdicaoInfraChamado(chamadoId) {
  if (!isAdmin()) {
    alert('Seu perfil não tem permissão para editar chamados de infraestrutura.');
    return;
  }

  const payload = {
    assigned_to: document.getElementById('editInfraAssignedTo')?.value || '',
    status: document.getElementById('editInfraStatus')?.value || '',
    priority: document.getElementById('editInfraPriority')?.value || '',
    impact: document.getElementById('editInfraImpact')?.value || '',
    urgency: document.getElementById('editInfraUrgency')?.value || '',
    support_level: document.getElementById('editInfraSupportLevel')?.value || '',
    category: document.getElementById('editInfraCategory')?.value || '',
    subcategory: document.getElementById('editInfraSubcategory')?.value || '',
    attendance_type: document.getElementById('editInfraAttendanceType')?.value || '',
    environment: document.getElementById('editInfraEnvironment')?.value || '',
    asset_identifier: document.getElementById('editInfraAssetIdentifier')?.value || '',
    supplier_name: document.getElementById('editInfraSupplierName')?.value || '',
    root_cause: document.getElementById('editInfraRootCause')?.value || '',
    action_taken: document.getElementById('editInfraActionTaken')?.value || '',
    solution_applied: document.getElementById('editInfraSolutionApplied')?.value || '',
    observation: document.getElementById('editInfraObservation')?.value || '',
    recurrence_flag: document.getElementById('editInfraRecurrence')?.value || '0',
    sla_pause_reason: document.getElementById('editInfraPauseReason')?.value || ''
  };

  if (['resolvido', 'finalizado'].includes(payload.status)) {
    const missingFields = [];
    if (!payload.category) missingFields.push('categoria');
    if (!payload.subcategory) missingFields.push('subcategoria');
    if (!payload.attendance_type) missingFields.push('tipo de atendimento');
    if (!payload.root_cause) missingFields.push('causa');
    if (!payload.action_taken) missingFields.push('acao executada');
    if (!payload.solution_applied) missingFields.push('solucao aplicada');
    if (missingFields.length) {
      alert(`Para resolver o chamado, preencha: ${missingFields.join(', ')}.`);
      return;
    }
  }

  try {
    const response = await fetch(`${API_URL}/infraestrutura/${chamadoId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(data?.error || 'Erro ao atualizar chamado de infraestrutura');

    alert('Chamado de infraestrutura atualizado com sucesso!');
    await loadInfraChamados();
    await showInfraDetails(chamadoId);
  } catch (error) {
    alert('Erro ao atualizar chamado de infraestrutura: ' + error.message);
  }
}

async function reabrirInfraChamado(chamadoId) {
  if (!isAdmin()) {
    alert('A reabertura e permitida somente para administradores.');
    return;
  }
  const reason = prompt('Informe o motivo da reabertura do chamado de infraestrutura:');
  if (!reason) return;

  try {
    const response = await fetch(`${API_URL}/infraestrutura/${chamadoId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason })
    });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(data?.error || 'Erro ao reabrir chamado');

    alert('Chamado reaberto com sucesso!');
    await loadInfraChamados();
    await showInfraDetails(chamadoId);
  } catch (error) {
    alert('Erro ao reabrir chamado: ' + error.message);
  }
}

async function uploadInfraAdditionalImages(chamadoId) {
  if (!isAdmin()) {
    alert('Somente administradores podem adicionar imagens após a abertura do chamado.');
    return;
  }

  const input = document.getElementById('editInfraAdditionalAttachments');
  const files = input?.files;
  if (!files || !files.length) {
    alert('Selecione ao menos uma imagem.');
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('attachments', files[i]);
  }

  try {
    const response = await fetch(`${API_URL}/infraestrutura/${chamadoId}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao adicionar imagens ao chamado de infraestrutura');
    }

    if (input) input.value = '';
    alert('Imagens adicionadas com sucesso!');
    await loadInfraChamados();
    await showInfraDetails(chamadoId);
  } catch (error) {
    alert('Erro ao adicionar imagens ao chamado de infraestrutura: ' + error.message);
  }
}

async function validarSolucaoInfra(chamadoId, approved) {
  const comment = document.getElementById('infraValidationComment')?.value?.trim() || '';
  if (!approved && comment.length < 5) {
    alert('Descreva o que ainda não foi resolvido para reabrir o chamado.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/infraestrutura/${chamadoId}/validation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ approved, comment })
    });
    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao validar solucao');
    }

    alert(data?.message || (approved ? 'Solucao validada. Aguardando fechamento pelo administrador.' : 'Chamado reaberto para nova tratativa.'));
    await loadInfraChamados();
    await showInfraDetails(chamadoId);
  } catch (error) {
    alert('Erro ao validar solucao: ' + error.message);
  }
}

function downloadInfraAttachment(attachmentId, fileName) {
  fetch(`${API_URL}/infraestrutura/download/${attachmentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(response => {
      if (!response.ok) throw new Error(`Erro ao fazer download: ${response.statusText}`);
      return response.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'anexo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    })
    .catch(error => alert('Erro ao fazer download: ' + error.message));
}

// ==================== COMUNICADOS ====================
function showNewComunicadoForm() {
  if (!canManageCatalogs()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }

  editingComunicadoId = null;
  setComunicadoFormMode('create');
  const form = document.getElementById('newComunicadoForm');
  if (form) form.style.display = 'block';
}

function hideComunicadoForm() {
  const form = document.getElementById('newComunicadoForm');
  if (form) form.style.display = 'none';

  const formEl = document.getElementById('formNewComunicado');
  if (formEl) formEl.reset();

  editingComunicadoId = null;
  setComunicadoFormMode('create');
  updateComunicadoCounter();
}

function updateComunicadoCounter() {
  const textarea = document.getElementById('comunicadoContent');
  const counter = document.getElementById('comunicadoCharCount');
  const previewTitle = document.getElementById('comunicadoPreviewTitle');
  const previewText = document.getElementById('comunicadoPreviewText');
  const titleInput = document.getElementById('comunicadoTitle');

  const value = textarea ? textarea.value : '';
  if (counter) counter.textContent = value.length;
  if (previewText) previewText.textContent = value || 'O texto do comunicado aparece aqui.';
  if (previewTitle) previewTitle.textContent = titleInput?.value || 'Título do comunicado';
}

const comunicadoContentInput = document.getElementById('comunicadoContent');
if (comunicadoContentInput) {
  comunicadoContentInput.addEventListener('input', updateComunicadoCounter);
}

const comunicadoTitleInput = document.getElementById('comunicadoTitle');
if (comunicadoTitleInput) {
  comunicadoTitleInput.addEventListener('input', updateComunicadoCounter);
}

const formNewComunicado = document.getElementById('formNewComunicado');
if (formNewComunicado) {
  formNewComunicado.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!canManageCatalogs()) {
      alert('Seu perfil não tem acesso a este cadastro.');
      return;
    }

    const title = getFieldValue('comunicadoTitle');
    const content = getFieldValue('comunicadoContent');
    const priority = document.getElementById('comunicadoPriority').value;
    const validationErrors = [];

    if (!validateLength(title, 3, 80)) {
      validationErrors.push('Título do comunicado deve ter entre 3 e 80 caracteres');
    }
    if (!validateLength(content, 1, 500)) {
      validationErrors.push('Texto do comunicado deve ter entre 1 e 500 caracteres');
    }
    if (!['normal', 'alta'].includes(priority)) {
      validationErrors.push('Selecione uma prioridade válida');
    }

    if (showValidationAlert(validationErrors)) {
      return;
    }

    try {
      const endpoint = editingComunicadoId ? `${API_URL}/comunicados/${editingComunicadoId}` : `${API_URL}/comunicados/create`;
      const response = await fetch(endpoint, {
        method: editingComunicadoId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title, content, priority })
      });

      const data = await response.json();
      const apiMessage = data?.error || data?.message || (Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.map(err => err.msg).join(' | ')
        : null);

      if (response.ok) {
        alert(editingComunicadoId ? 'Comunicado atualizado com sucesso!' : 'Comunicado publicado com sucesso!');
        hideComunicadoForm();
        loadComunicados();
        loadDashboard();
      } else {
        alert(apiMessage || (editingComunicadoId ? 'Erro ao atualizar comunicado' : 'Erro ao publicar comunicado'));
      }
    } catch (error) {
      console.error('Erro ao publicar comunicado:', error);
      alert('Erro ao publicar comunicado: ' + error.message);
    }
  });
}

async function loadComunicados() {
  try {
    const response = await fetch(`${API_URL}/comunicados/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const comunicados = await response.json();
    comunicadosCache = Array.isArray(comunicados) ? comunicados : [];
    const container = document.getElementById('comunicadosList');

    if (comunicadosCache.length === 0) {
      container.innerHTML = '<p style="text-align: center; padding: 40px; color: #64748b;">Nenhum comunicado disponível</p>';
      return;
    }

    container.innerHTML = comunicadosCache.map(c => `
      <div class="announcement-item">
        <div class="announcement-header">
          <h4>${c.title}</h4>
          <span class="announcement-badge ${c.priority}">${c.announcement_type === 'birthday' ? 'aniversario' : c.priority}</span>
        </div>
        <p class="announcement-content">${c.content.length > 500 ? c.content.substring(0, 500) + '...' : c.content}</p>
        <p class="announcement-meta">Por ${c.author_name} em ${new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
        ${canManageCatalogs() && c.announcement_type !== 'birthday' ? `
          <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
            <button onclick="showEditComunicadoForm(${c.id})" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px; margin-right: 8px;">Editar</button>
            <button onclick="deleteComunicado(${c.id})" class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;">Deletar</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar comunicados:', error);
  }
}

function showEditComunicadoForm(comunicadoId) {
  if (!canManageCatalogs()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }

  const comunicado = comunicadosCache.find(c => c.id === comunicadoId);
  if (!comunicado) {
    alert('Comunicado não encontrado.');
    return;
  }

  editingComunicadoId = comunicadoId;
  document.getElementById('comunicadoTitle').value = comunicado.title || '';
  document.getElementById('comunicadoContent').value = comunicado.content || '';
  document.getElementById('comunicadoPriority').value = comunicado.priority || 'normal';
  setComunicadoFormMode('edit');
  updateComunicadoCounter();

  const form = document.getElementById('newComunicadoForm');
  if (form) form.style.display = 'block';
  const titleInput = document.getElementById('comunicadoTitle');
  if (titleInput) titleInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteComunicado(comunicadoId) {
  if (!canManageCatalogs()) {
    alert('Seu perfil não tem permissão para deletar comunicados.');
    return;
  }

  if (!confirm('Tem certeza que deseja deletar este comunicado?')) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/comunicados/${comunicadoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await readApiResponse(response);
    const apiMessage = data?.error || data?.message || (Array.isArray(data?.errors) && data.errors.length > 0
      ? data.errors.map(err => err.msg).join(' | ')
      : null);

    if (response.ok) {
      alert(data.message || 'Comunicado deletado com sucesso!');
      loadComunicados();
      loadDashboard();
    } else {
      alert(apiMessage || 'Erro ao deletar comunicado');
    }
  } catch (error) {
    console.error('Erro ao deletar comunicado:', error);
    alert('Erro ao deletar comunicado: ' + error.message);
  }
}

// ==================== DOCUMENTOS ====================
function showUploadDocForm() {
  if (!canManageCatalogs()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }
  document.getElementById('uploadDocForm').style.display = 'block';
}

function hideUploadDocForm() {
  document.getElementById('uploadDocForm').style.display = 'none';
  document.getElementById('formUploadDoc').reset();
}

document.getElementById('formUploadDoc')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = getFieldValue('docName');
  const category = getFieldValue('docCategory');
  const description = getFieldValue('docDescription');
  const fileInput = document.getElementById('docFile');
  const validationErrors = [];

  if (!validateLength(name, 2, 120)) {
    validationErrors.push('Nome do documento deve ter entre 2 e 120 caracteres');
  }
  if (category && !validateLength(category, 1, 100)) {
    validationErrors.push('Categoria do documento deve ter no máximo 100 caracteres');
  }
  if (description && !validateLength(description, 0, 500)) {
    validationErrors.push('Descrição do documento deve ter no máximo 500 caracteres');
  }
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    validationErrors.push('Selecione um arquivo para envio');
  }

  if (showValidationAlert(validationErrors)) {
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('category', category);
  formData.append('description', description);
  formData.append('document', fileInput.files[0]);

  try {
    const response = await fetch(`${API_URL}/documentos/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (response.ok) {
      alert('Documento enviado com sucesso!');
      hideUploadDocForm();
      loadDocumentos();
    } else {
      alert('Erro ao enviar documento');
    }
  } catch (error) {
    alert('Erro ao enviar documento: ' + error.message);
  }
});

async function loadDocumentos() {
  try {
    const response = await fetch(`${API_URL}/documentos/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const documentos = await response.json();
    const tableBody = document.getElementById('documentosTableBody');

    if (documentos.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum documento disponível</td></tr>';
      return;
    }

    tableBody.innerHTML = documentos.map(d => `
      <tr>
        <td>${d.name}</td>
        <td>${d.category || '-'}</td>
        <td>${(d.file_size / 1024 / 1024).toFixed(2)} MB</td>
        <td>${d.uploader_name}</td>
        <td>${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
        <td>
          <button onclick="downloadDocument(${d.id}, '${d.file_name}')" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">Download</button>
          ${(canManageCatalogs() || currentUser.id === d.user_id) ? `<button onclick="deleteDocument(${d.id})" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar documentos:', error);
  }
}

function downloadDocument(docId, fileName) {
  try {
    const downloadUrl = `${API_URL}/documentos/download/${docId}`;
    const token = localStorage.getItem('token');
    
    // Fazer requisição com token
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Erro ao fazer download: ${response.statusText}`);
      }
      return response.blob();
    })
    .then(blob => {
      // Criar link de download com o blob
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'documento';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    })
    .catch(error => {
      console.error('Erro ao fazer download:', error);
      alert('Erro ao fazer download do documento: ' + error.message);
    });
  } catch (error) {
    console.error('Erro ao fazer download:', error);
    alert('Erro ao fazer download do documento');
  }
}

async function deleteDocument(docId) {
  if (!confirm('Tem certeza que deseja deletar este documento?')) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/documentos/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      alert('Documento deletado com sucesso!');
      loadDocumentos();
    } else {
      alert('Erro ao deletar documento');
    }
  } catch (error) {
    alert('Erro ao deletar documento: ' + error.message);
  }
}

// ==================== DOCUMENTOS - BUSCA ====================
document.getElementById('docSearch')?.addEventListener('input', (event) => {
  renderDocumentosList(event.target.value);
});

function renderDocumentosList(filterValue = '') {
  const tableBody = document.getElementById('documentosTableBody');
  if (!tableBody) return;

  const normalizedFilter = normalizeSearchText(filterValue);
  const filteredDocumentos = normalizedFilter
    ? documentosCache.filter(documento => normalizeSearchText(getDocumentoSearchText(documento)).includes(normalizedFilter))
    : documentosCache;

  if (documentosCache.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum documento disponível</td></tr>';
    return;
  }

  if (filteredDocumentos.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum documento encontrado para a busca</td></tr>';
    return;
  }

  tableBody.innerHTML = filteredDocumentos.map(d => `
    <tr>
      <td>${d.name}</td>
      <td>${d.category || '-'}</td>
      <td>${(d.file_size / 1024 / 1024).toFixed(2)} MB</td>
      <td>${d.uploader_name}</td>
      <td>${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
      <td>
        <button onclick="downloadDocument(${d.id}, '${d.file_name}')" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">Download</button>
        ${(canManageCatalogs() || currentUser.id === d.user_id) ? `<button onclick="deleteDocument(${d.id}')" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function loadDocumentos() {
  try {
    const response = await fetch(`${API_URL}/documentos/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    documentosCache = await response.json();
    renderDocumentosList(document.getElementById('docSearch')?.value || '');
  } catch (error) {
    console.error('Erro ao carregar documentos:', error);
  }
}

// ==================== FUNCIONÁRIOS ====================
let paginaAtualFunc = 1;
let limiteFunc = 16;
const FUNCIONARIO_CARD_MIN_WIDTH = 160;
const FUNCIONARIO_GRID_GAP = 15;
const FUNCIONARIO_VISIBLE_ROWS = 2;

function calcularLimiteFuncionarios() {
  const galeria = document.getElementById('funcionariosGaleria');
  const width = galeria?.clientWidth || galeria?.parentElement?.clientWidth || 0;
  if (!width) return limiteFunc;

  const columns = Math.max(
    1,
    Math.floor((width + FUNCIONARIO_GRID_GAP) / (FUNCIONARIO_CARD_MIN_WIDTH + FUNCIONARIO_GRID_GAP))
  );

  return Math.max(12, columns * FUNCIONARIO_VISIBLE_ROWS);
}

function showNewFuncionarioForm() {
  if (!canManageFuncionarios()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }
  editingFuncionarioId = null;
  setFuncionarioFormMode('create');
  const form = document.getElementById('newFuncionarioForm');
  if (form) form.style.display = 'block';
}

function hideFuncionarioForm() {
  const form = document.getElementById('newFuncionarioForm');
  if (form) form.style.display = 'none';
  const formEl = document.getElementById('formNewFuncionario');
  if (formEl) formEl.reset();
  editingFuncionarioId = null;
  setFuncionarioFormMode('create');
}

function showEditFuncionarioForm(funcionarioId) {
  if (!canManageFuncionarios()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }

  const funcionario = funcionariosCache.find(f => Number(f.id) === Number(funcionarioId));
  if (!funcionario) {
    alert('Funcionário não encontrado.');
    return;
  }

  editingFuncionarioId = Number(funcionarioId);
  document.getElementById('funcNome').value = funcionario.nome || '';
  document.getElementById('funcRe').value = funcionario.re || '';
  document.getElementById('funcCargo').value = funcionario.cargo || '';
  document.getElementById('funcRamal').value = funcionario.ramal || '';
  document.getElementById('funcEmail').value = funcionario.email || '';
  document.getElementById('funcDepartamento').value = funcionario.departamento || '';
  const fotoInput = document.getElementById('funcFoto');
  if (fotoInput) fotoInput.value = '';
  setFuncionarioFormMode('edit');

  const form = document.getElementById('newFuncionarioForm');
  if (form) form.style.display = 'block';
  document.getElementById('funcNome')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const formNewFunc = document.getElementById('formNewFuncionario');
if (formNewFunc) {
  formNewFunc.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!canManageFuncionarios()) {
      alert('Seu perfil não tem acesso a este cadastro.');
      return;
    }

    const nome = getFieldValue('funcNome');
    const re = getFieldValue('funcRe');
    const cargo = getFieldValue('funcCargo');
    const ramal = getFieldValue('funcRamal');
    const email = getFieldValue('funcEmail');
    const departamento = getFieldValue('funcDepartamento');
    const validationErrors = [];

    if (!validateLength(nome, 2, 100)) {
      validationErrors.push('Nome deve ter entre 2 e 100 caracteres');
    }
    if (!validateLength(cargo, 2, 100)) {
      validationErrors.push('Cargo deve ter entre 2 e 100 caracteres');
    }
    if (re && !validateNumberString(re)) {
      validationErrors.push('RE deve conter apenas números');
    }
    if (!validateEmailFormat(email)) {
      validationErrors.push('Email inválido');
    }
    if (ramal && !validatePhoneLike(ramal)) {
      validationErrors.push('Ramal inválido');
    }
    if (departamento && !validateLength(departamento, 0, 100)) {
      validationErrors.push('Departamento deve ter no máximo 100 caracteres');
    }

    if (showValidationAlert(validationErrors)) {
      return;
    }

    const formData = new FormData();
    formData.append('nome', nome);
    formData.append('re', re || '');
    formData.append('cargo', cargo);
    formData.append('ramal', ramal || '');
    formData.append('email', email);
    formData.append('departamento', departamento || '');
    
    if (document.getElementById('funcFoto').files[0]) {
      formData.append('foto', document.getElementById('funcFoto').files[0]);
    }

    try {
      const isEditing = Boolean(editingFuncionarioId);
      const response = await fetch(`${API_URL}/funcionarios/${isEditing ? editingFuncionarioId : 'criar'}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        alert(isEditing ? 'Funcionário atualizado com sucesso!' : 'Funcionário cadastrado com sucesso!');
        hideFuncionarioForm();
        paginaAtualFunc = 1;
        loadFuncionarios();
      } else {
        alert(data.error || (isEditing ? 'Erro ao atualizar funcionário' : 'Erro ao cadastrar funcionário'));
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao cadastrar: ' + error.message);
    }
  });
}

async function loadFuncionarios() {
  const galeria = document.getElementById('funcionariosGaleria');
  if (!galeria) return;

  limiteFunc = calcularLimiteFuncionarios();
  galeria.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Carregando...</p>';

  try {
    const response = await fetch(
      `${API_URL}/funcionarios/listar?page=${paginaAtualFunc}&limit=${limiteFunc}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!response.ok) {
      throw new Error('Erro na API');
    }

    const data = await response.json();
    funcionariosCache = Array.isArray(data.funcionarios) ? data.funcionarios : [];
    renderizarGaleriaFunc(data.funcionarios);
    renderizarPaginacaoFunc(data.pagination);
  } catch (error) {
    console.error('Erro ao carregar funcionários:', error);
    galeria.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red; padding: 40px;">Erro ao carregar funcionários: ' + error.message + '</p>';
  }
}

function renderizarGaleriaFunc(funcionarios) {
  const container = document.getElementById('funcionariosGaleria');
  if (!container) return;

  if (!funcionarios || funcionarios.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px;">Nenhum funcionário cadastrado</p>';
    return;
  }

  console.log('Renderizando funcionários:', funcionarios);

  container.innerHTML = funcionarios.map(f => {
    const fotoUrl = f.foto_path
  ? `${API_ORIGIN}${f.foto_path}`
  : null;
    console.log(`Foto de ${f.nome}:`, fotoUrl);
    
    return `
    <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.3s; border: 1px solid #e0e0e0;">
      <div style="width: 100%; aspect-ratio: 4 / 5; min-height: 210px; background: linear-gradient(180deg, #f8fafc, #e2e8f0); display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 40px;">
        ${fotoUrl ? `<img src="${fotoUrl}" alt="${f.nome}" style="width: 100%; height: 100%; object-fit: cover;" onerror="console.error('Erro ao carregar imagem: ${fotoUrl}')">` : '👤'}
      </div>
      <div style="padding: 12px; background: white;">
        <div style="font-weight: bold; color: #333; margin-bottom: 5px; font-size: 14px; word-break: break-word;">${f.nome}</div>
        ${f.re ? `<div style="color: #495057; font-size: 11px; margin-bottom: 5px;">RE: ${f.re}</div>` : ''}
        <div style="color: #666; font-size: 12px; margin-bottom: 5px;">${f.cargo}</div>
        ${f.departamento ? `<div style="background: #e7f3ff; color: #0056b3; padding: 3px 6px; border-radius: 3px; font-size: 10px; margin-bottom: 5px; display: inline-block;">📍 ${f.departamento}</div>` : ''}
        ${f.ramal ? `<div style="color: #999; font-size: 11px; margin-bottom: 5px; display: block;">📞 ${f.ramal}</div>` : ''}
        <a href="mailto:${f.email}" style="color: #007bff; font-size: 11px; text-decoration: none; display: block; margin-bottom: 8px; word-break: break-all;">${f.email}</a>
        <div style="display: flex; gap: 5px; flex-direction: column;">
          ${canManageFuncionarios() ? `<button onclick="event.stopPropagation(); showEditFuncionarioForm(${f.id})" style="width: 100%; padding: 5px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Editar</button>` : ''}
          ${canManageFuncionarios() ? `<button onclick="event.stopPropagation(); deletarFunc(${f.id})" style="flex: 1; padding: 5px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Deletar</button>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

  container.querySelectorAll('img').forEach((img) => {
    img.style.objectFit = 'cover';
    img.style.objectPosition = 'center top';
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = '100%';
  });
}

function renderizarPaginacaoFunc(pagination) {
  if (!pagination) return;

  const { page, totalPages } = pagination;
  const container = document.getElementById('funcionariosPaginacao');
  if (!container) return;

  let html = '';
  if (page > 1) {
    html += `<button onclick="mudaPaginaFunc(1)" style="margin: 0 5px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Primeira</button>`;
    html += `<button onclick="mudaPaginaFunc(${page - 1})" style="margin: 0 5px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">← Anterior</button>`;
  }

  html += `<span style="margin: 0 10px; color: #666; font-weight: bold;">Página ${page} de ${totalPages}</span>`;

  if (page < totalPages) {
    html += `<button onclick="mudaPaginaFunc(${page + 1})" style="margin: 0 5px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Próximo →</button>`;
    html += `<button onclick="mudaPaginaFunc(${totalPages})" style="margin: 0 5px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Última</button>`;
  }

  container.innerHTML = html;
}

function mudaPaginaFunc(novaPagina) {
  paginaAtualFunc = novaPagina;
  loadFuncionarios();
}

async function deletarFunc(id) {
  if (!canManageFuncionarios()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }

  if (!confirm('Tem certeza que deseja remover este funcionário?')) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/funcionarios/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      alert('Funcionário removido com sucesso!');
      loadFuncionarios();
    } else {
      alert('Erro ao remover funcionário');
    }
  } catch (error) {
    alert('Erro: ' + error.message);
  }
}

// Busca de funcionários
const buscaFuncInput = document.getElementById('buscaFuncionarios');
if (buscaFuncInput) {
  // Buscar ao apertar Enter
  buscaFuncInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      executarBuscaFunc();
    }
  });
}

function executarBuscaFunc() {
  const termo = document.getElementById('buscaFuncionarios').value.trim();

  if (termo.length < 2) {
    alert('Digite pelo menos 2 caracteres para buscar');
    return;
  }

  buscarFuncionariosProxy(termo);
}

function limparBuscaFunc() {
  document.getElementById('buscaFuncionarios').value = '';
  paginaAtualFunc = 1;
  loadFuncionarios();
}

async function buscarFuncionariosProxy(termo) {
  const galeria = document.getElementById('funcionariosGaleria');
  if (!galeria) return;

  galeria.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Buscando...</p>';

  try {
    const response = await fetch(`${API_URL}/funcionarios/buscar/${termo}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error('Erro na API');
    }

    const funcionarios = await response.json();
    funcionariosCache = Array.isArray(funcionarios) ? funcionarios : [];
    renderizarGaleriaFunc(funcionariosCache);
    document.getElementById('funcionariosPaginacao').innerHTML = '<p style="text-align: center; color: #666;">Total encontrado: ' + funcionariosCache.length + '</p>';
  } catch (error) {
    console.error('Erro na busca:', error);
    galeria.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Erro ao buscar: ' + error.message + '</p>';
  }
}

// ==================== BANCO DE IDEIAS ====================
const formNovaIdeia = document.getElementById('formNovaIdeia');
if (formNovaIdeia) {
  formNovaIdeia.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titulo = getFieldValue('ideiaTitulo');
    const categoria = getFieldValue('ideiaCategoria');
    const descricao = getFieldValue('ideiaDescricao');
    const validationErrors = [];

    if (!validateLength(titulo, 3, 150)) {
      validationErrors.push('Título da ideia deve ter entre 3 e 150 caracteres');
    }
    if (categoria && !validateLength(categoria, 0, 100)) {
      validationErrors.push('Categoria deve ter no máximo 100 caracteres');
    }
    if (!validateLength(descricao, 10, 2000)) {
      validationErrors.push('Descrição da ideia deve ter entre 10 e 2000 caracteres');
    }

    if (showValidationAlert(validationErrors)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/ideias/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ titulo, categoria, descricao })
      });

      const data = await readApiResponse(response);
      const apiMessage = data?.error || data?.message || (Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.map(err => err.msg).join(' | ')
        : null);

      if (!response.ok) {
        alert(apiMessage || 'Erro ao enviar ideia');
        return;
      }

      alert(data.message || 'Ideia enviada com sucesso!');
      formNovaIdeia.reset();

      if (canViewIdeasInbox()) {
        loadIdeias();
      }
    } catch (error) {
      console.error('Erro ao enviar ideia:', error);
      alert('Erro ao enviar ideia: ' + error.message);
    }
  });
}

function renderIdeiasList() {
  const tableBody = document.getElementById('ideiasTableBody');
  if (!tableBody) return;

  if (!ideiasCache.length) {
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma ideia enviada até o momento</td></tr>';
    return;
  }

  tableBody.innerHTML = ideiasCache.map(ideia => `
    <tr>
      <td>#${ideia.id}</td>
      <td>
        <strong>${ideia.titulo}</strong>
        <div style="margin-top: 6px; color: #64748b; white-space: pre-wrap;">${ideia.descricao}</div>
      </td>
      <td>${ideia.categoria || '-'}</td>
      <td>
        ${ideia.autor_nome || ideia.autor_usuario || '-'}
        <div style="margin-top: 4px; color: #64748b;">${ideia.autor_email || '-'}</div>
      </td>
      <td>${ideia.autor_departamento || '-'}</td>
      <td>${new Date(ideia.created_at).toLocaleDateString('pt-BR')}</td>
      <td><span class="status-badge pendente">${ideia.status || 'nova'}</span></td>
    </tr>
  `).join('');
}

async function loadIdeias() {
  const tableBody = document.getElementById('ideiasTableBody');
  if (!tableBody) return;

  if (!canViewIdeasInbox()) {
    return;
  }

  tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Carregando...</td></tr>';

  try {
    const response = await fetch(`${API_URL}/ideias/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao carregar ideias');
    }

    ideiasCache = Array.isArray(data) ? data : [];
    renderIdeiasList();
  } catch (error) {
    console.error('Erro ao carregar ideias:', error);
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: red;">Erro ao carregar ideias: ${error.message}</td></tr>`;
  }
}

// ==================== USUARIOS ====================
function showNewUsuarioForm() {
  if (!canAccessUsers()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }

  editingUsuarioId = null;
  setUsuarioFormMode('create');
  const formEl = document.getElementById('formNewUsuario');
  if (formEl) formEl.reset();
  const form = document.getElementById('newUsuarioForm');
  const birthDateInput = document.getElementById('usuarioNascimento');
  if (birthDateInput) {
    birthDateInput.max = new Date().toISOString().slice(0, 10);
  }
  syncUsuarioRoleOptions();
  if (form) form.style.display = 'block';
}

function hideUsuarioForm() {
  const form = document.getElementById('newUsuarioForm');
  if (form) form.style.display = 'none';
  const formEl = document.getElementById('formNewUsuario');
  if (formEl) formEl.reset();
  editingUsuarioId = null;
  setUsuarioFormMode('create');
}

function getUsuarioSearchText(usuario) {
  return [
    usuario?.id ? `#${usuario.id}` : '',
    usuario?.id,
    usuario?.username,
    usuario?.name,
    usuario?.email,
    ROLE_LABELS[normalizeRole(usuario?.role)] || usuario?.role,
    formatDateToPtBr(usuario?.birth_date),
    usuario?.created_at ? new Date(usuario.created_at).toLocaleDateString('pt-BR') : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function renderUsuariosList(filterValue = '') {
  const tableBody = document.getElementById('usuariosTableBody');
  if (!tableBody) return;

  if (!canAccessUsers()) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Seu perfil não tem acesso a esta área</td></tr>';
    return;
  }

  const normalizedFilter = normalizeSearchText(filterValue);
  const filteredUsuarios = normalizedFilter
    ? usuariosCache.filter(usuario => normalizeSearchText(getUsuarioSearchText(usuario)).includes(normalizedFilter))
    : usuariosCache;

  if (usuariosCache.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum usuário cadastrado</td></tr>';
    return;
  }

  if (filteredUsuarios.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum usuário encontrado para a busca</td></tr>';
    return;
  }

  tableBody.innerHTML = filteredUsuarios.map(u => `
    <tr>
      <td>#${u.id}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.name || '-')}</td>
      <td>${escapeHtml(u.email || '-')}</td>
      <td>${formatDateToPtBr(u.birth_date)}</td>
      <td><span style="display: inline-block; padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 600;">${escapeHtml(ROLE_LABELS[normalizeRole(u.role)] || u.role)}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
      <td>
        ${getCurrentRole() === 'admin' && Number(u.id) !== Number(currentUser.id) ? `<button onclick="editUser(${u.id})" class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">Editar</button><button onclick="deleteUser(${u.id})" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;">Excluir</button>` : '-'}
      </td>
    </tr>
  `).join('');
}

const formNewUsuario = document.getElementById('formNewUsuario');
if (formNewUsuario) {
  formNewUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!canAccessUsers()) {
      alert('Seu perfil não tem acesso a este cadastro.');
      return;
    }

    const name = getFieldValue('usuarioNome');
    const username = getFieldValue('usuarioLogin');
    const password = document.getElementById('usuarioSenha').value;
    const birthDate = document.getElementById('usuarioNascimento')?.value || '';
    const email = getFieldValue('usuarioEmail');
    const role = document.getElementById('usuarioPerfil').value;
    const validationErrors = [];

    if (!validateLength(username, 3, 30) || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      validationErrors.push('Login deve ter entre 3 e 30 caracteres e usar apenas letras, números, ponto, underline ou hífen');
    }
    if (!editingUsuarioId && !validateLength(password, 6, 72)) {
      validationErrors.push('Senha deve ter entre 6 e 72 caracteres');
    }
    if (editingUsuarioId && password && !validateLength(password, 6, 72)) {
      validationErrors.push('Nova senha deve ter entre 6 e 72 caracteres');
    }
    if (name && !validateLength(name, 2, 100)) {
      validationErrors.push('Nome deve ter entre 2 e 100 caracteres');
    }
    if (birthDate && isFutureDate(birthDate)) {
      validationErrors.push('Data de nascimento não pode ser futura');
    }
    if (email && !validateEmailFormat(email)) {
      validationErrors.push('Informe um email válido');
    }
    const allowedRoles = getAllowedUserRoles();
    if (!allowedRoles.includes(role)) {
      validationErrors.push('Selecione um perfil válido');
    }

    if (showValidationAlert(validationErrors)) {
      return;
    }

    const payload = {
      name,
      username,
      role,
      birth_date: birthDate || null
    };
    if (email) {
      payload.email = email;
    }
    if (password) {
      payload.password = password;
    }

    try {
      const response = await fetch(editingUsuarioId ? `${API_URL}/usuarios/${editingUsuarioId}/update` : `${API_URL}/usuarios/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await readApiResponse(response);
      const apiMessage = data?.error || data?.message || (Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.map(err => err.msg).join(' | ')
        : null);

      if (response.ok) {
        alert(editingUsuarioId ? 'Usuario atualizado com sucesso!' : 'Usuario cadastrado com sucesso!');
        hideUsuarioForm();
        loadUsuarios();
      } else {
        alert(apiMessage || (editingUsuarioId ? 'Erro ao atualizar usuário' : 'Erro ao cadastrar usuário'));
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      alert('Erro ao salvar usuário: ' + error.message);
    }
  });
}

document.getElementById('usuarioSearch')?.addEventListener('input', (event) => {
  renderUsuariosList(event.target.value);
});

async function loadUsuarios() {
  const tableBody = document.getElementById('usuariosTableBody');
  if (!tableBody) return;

  if (!canAccessUsers()) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Seu perfil não tem acesso a esta área</td></tr>';
    return;
  }

  tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Carregando...</td></tr>';

  try {
    const response = await fetch(`${API_URL}/usuarios/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const usuarios = await response.json();

    if (!response.ok) {
      throw new Error(usuarios.error || 'Erro ao carregar usuários');
    }

    usuariosCache = Array.isArray(usuarios) ? usuarios : [];
    renderUsuariosList(document.getElementById('usuarioSearch')?.value || '');
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: red;">Erro ao carregar usuários: ${error.message}</td></tr>`;
  }
}

function editUser(userId) {
  if (getCurrentRole() !== 'admin') {
    alert('Apenas administradores podem editar usuários.');
    return;
  }

  const user = usuariosCache.find(item => Number(item.id) === Number(userId));
  if (!user) {
    alert('Usuário não encontrado na lista.');
    return;
  }

  editingUsuarioId = Number(user.id);
  setUsuarioFormMode('edit');
  syncUsuarioRoleOptions();

  const form = document.getElementById('newUsuarioForm');
  const birthDateInput = document.getElementById('usuarioNascimento');
  if (birthDateInput) {
    birthDateInput.max = new Date().toISOString().slice(0, 10);
  }

  document.getElementById('usuarioNome').value = user.name || '';
  document.getElementById('usuarioLogin').value = user.username || '';
  document.getElementById('usuarioSenha').value = '';
  document.getElementById('usuarioEmail').value = user.email || '';
  document.getElementById('usuarioNascimento').value = user.birth_date ? String(user.birth_date).slice(0, 10) : '';
  document.getElementById('usuarioPerfil').value = normalizeRole(user.role);

  if (form) {
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function deleteUser(userId) {
  if (!confirm('Tem certeza que deseja excluir este usuário?')) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/usuarios/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message || 'Usuário removido com sucesso!');
      loadUsuarios();
    } else {
      alert(data.error || 'Erro ao remover usuário');
    }
  } catch (error) {
    alert('Erro ao remover usuário: ' + error.message);
  }
}

const formChangePassword = document.getElementById('formChangePassword');
if (formChangePassword) {
  formChangePassword.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('newPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmNewPassword')?.value || '';

    if (!/^[A-Za-z0-9]{6}$/.test(password)) {
      alert('A senha deve ter exatamente 6 números ou letras.');
      return;
    }

    if (password !== confirmPassword) {
      alert('A confirmação da senha não confere.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });

      const data = await readApiResponse(response);

      if (response.ok) {
        alert('Senha alterada com sucesso. Entre novamente com a nova senha.');
        closeChangePasswordModal();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      } else {
        const errorMessage = String(data.error || '');
        if (response.status === 404 || errorMessage.includes('Cannot POST') || errorMessage.includes('<!DOCTYPE html>')) {
          alert('Alteração de senha ainda não está disponível no servidor. Atualize e reinicie o backend em produção.');
        } else {
          alert(errorMessage || 'Erro ao alterar senha');
        }
      }
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      alert('Erro ao alterar senha: ' + error.message);
    }
  });
}

// ==================== LOGOUT ====================
function logout() {
  if (confirm('Deseja fazer logout?')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
  }
}

// Fechar modal ao clicar outside
window.onclick = function(event) {
  const modal = document.getElementById('chamadoModal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }

  const passwordModal = document.getElementById('changePasswordModal');
  if (event.target === passwordModal) {
    closeChangePasswordModal();
  }

  if (!event.target.closest?.('.user-menu-container')) {
    closeUserMenu();
  }
}

function humanizeOptionLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatDurationSeconds(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function secondsBetweenDates(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

function getChamadoServiceSeconds(chamado) {
  if (!chamado?.service_started_at) return 0;
  const endDate = chamado.resolved_at || chamado.closed_at || new Date();
  return secondsBetweenDates(chamado.service_started_at, endDate);
}

function getChamadoTotalSeconds(chamado) {
  const startDate = chamado?.opened_at || chamado?.created_at;
  const endDate = chamado?.closed_at || chamado?.resolved_at || new Date();
  return secondsBetweenDates(startDate, endDate);
}

function getChamadoWaitingSeconds(chamado) {
  return Number(chamado?.waiting_user_seconds || 0) + Number(chamado?.waiting_vendor_seconds || 0);
}

function getChamadoClosingSeconds(chamado) {
  if (!chamado?.resolved_at || !chamado?.closed_at) return 0;
  return secondsBetweenDates(chamado.resolved_at, chamado.closed_at);
}

function getChamadoStatusLabel(status) {
  const labels = {
    aberto: 'Aberto',
    triagem: 'Triagem',
    pendente: 'Pendente',
    em_atendimento: 'Em atendimento',
    em_andamento: 'Em andamento',
    aguardando_usuario: 'Aguardando usuário',
    aguardando_fornecedor: 'Aguardando fornecedor',
    pausado: 'Pausado',
    resolvido: 'Resolvido',
    validado_usuario: 'Validado pelo usuário',
    fechado: 'Fechado',
    concluido: 'Concluído',
    encerrado: 'Encerrado',
    cancelado: 'Cancelado',
    reaberto: 'Reaberto'
  };
  return labels[status] || humanizeOptionLabel(status || '-');
}

function getChamadoSlaLabel(chamado) {
  if (chamado?.sla_state === 'dentro_sla') return 'Dentro SLA';
  if (chamado?.sla_state === 'fora_sla') return 'Fora SLA';
  return 'Em andamento';
}

function buildChamadoCategoryOptions(selectId, includeEmptyLabel = 'Selecione...') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const categories = Object.keys(chamadosMetadata?.categories || DEFAULT_CHAMADO_METADATA.categories);
  select.innerHTML = [
    `<option value="">${includeEmptyLabel}</option>`,
    ...categories.map(category => `<option value="${category}">${category}</option>`)
  ].join('');
}

function buildChamadoCategoryOptionsHtml(selectedCategory = '', includeEmptyLabel = 'Selecione...') {
  const categories = Object.keys(chamadosMetadata?.categories || DEFAULT_CHAMADO_METADATA.categories);
  return [
    `<option value="">${includeEmptyLabel}</option>`,
    ...categories.map(category => `<option value="${category}" ${selectedCategory === category ? 'selected' : ''}>${category}</option>`)
  ].join('');
}

function buildChamadoSubcategoryOptionsHtml(selectedCategory = '', selectedSubcategory = '') {
  const subcategories = (chamadosMetadata?.categories?.[selectedCategory] || []);
  return [
    '<option value="">Selecione...</option>',
    ...subcategories.map(subcategory => `<option value="${subcategory}" ${selectedSubcategory === subcategory ? 'selected' : ''}>${humanizeOptionLabel(subcategory)}</option>`)
  ].join('');
}

function syncChamadoSubcategoryOptions(selectedCategory = '', selectedSubcategory = '') {
  const subcategorySelect = document.getElementById('chamadoSubcategory');
  if (!subcategorySelect) return;

  const categoryKey = selectedCategory || document.getElementById('chamadoCategory')?.value || '';
  const subcategories = (chamadosMetadata?.categories?.[categoryKey] || []);
  subcategorySelect.innerHTML = [
    '<option value="">Selecione...</option>',
    ...subcategories.map(subcategory => `<option value="${subcategory}">${humanizeOptionLabel(subcategory)}</option>`)
  ].join('');

  if (selectedSubcategory && subcategories.includes(selectedSubcategory)) {
    subcategorySelect.value = selectedSubcategory;
  }
}

function syncEditChamadoSubcategoryOptions(selectedCategory = '', selectedSubcategory = '') {
  const subcategorySelect = document.getElementById('editChamadoSubcategory');
  if (!subcategorySelect) return;

  const categoryKey = selectedCategory || document.getElementById('editChamadoCategory')?.value || '';
  subcategorySelect.innerHTML = buildChamadoSubcategoryOptionsHtml(categoryKey, selectedSubcategory);
}

function getInfraStatusLabel(status) {
  const labels = {
    aberto: 'Aberto',
    triagem: 'Em triagem',
    aguardando_informacoes: 'Aguardando informacoes',
    aguardando_aprovacao: 'Aguardando aprovacao',
    aguardando_orcamento: 'Aguardando orcamento',
    aguardando_fornecedor: 'Aguardando fornecedor',
    em_atendimento: 'Em atendimento',
    pendente_material: 'Pendente de material',
    pendente_agendamento: 'Pendente de agendamento',
    resolvido: 'Resolvido',
    validado_usuario: 'Validado pelo usuário',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
    reaberto_usuario: 'Reaberto pelo usuário',
    reaberto: 'Reaberto'
  };
  return labels[status] || humanizeOptionLabel(status || '-');
}

function getInfraSlaLabel(chamado) {
  if (chamado?.sla_state === 'dentro_sla') return 'Dentro SLA';
  if (chamado?.sla_state === 'fora_sla') return 'Fora SLA';
  return 'Em andamento';
}

function buildInfraCategoryOptions(selectId, includeEmptyLabel = 'Selecione...') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const categories = Object.keys(infraMetadata?.categories || DEFAULT_INFRA_METADATA.categories);
  select.innerHTML = [
    `<option value="">${includeEmptyLabel}</option>`,
    ...categories.map(category => `<option value="${category}">${category}</option>`)
  ].join('');
}

function buildInfraCategoryOptionsHtml(selectedCategory = '', includeEmptyLabel = 'Selecione...') {
  const categories = Object.keys(infraMetadata?.categories || DEFAULT_INFRA_METADATA.categories);
  return [
    `<option value="">${includeEmptyLabel}</option>`,
    ...categories.map(category => `<option value="${category}" ${selectedCategory === category ? 'selected' : ''}>${category}</option>`)
  ].join('');
}

function buildInfraSubcategoryOptionsHtml(selectedCategory = '', selectedSubcategory = '') {
  const subcategories = infraMetadata?.categories?.[selectedCategory] || [];
  return [
    '<option value="">Selecione...</option>',
    ...subcategories.map(subcategory => `<option value="${subcategory}" ${selectedSubcategory === subcategory ? 'selected' : ''}>${humanizeOptionLabel(subcategory)}</option>`)
  ].join('');
}

function syncInfraSubcategoryOptions(selectedCategory = '', selectedSubcategory = '') {
  const subcategorySelect = document.getElementById('infraSubcategory');
  if (!subcategorySelect) return;

  const categoryKey = selectedCategory || document.getElementById('infraCategory')?.value || '';
  const subcategories = infraMetadata?.categories?.[categoryKey] || [];
  subcategorySelect.innerHTML = [
    '<option value="">Selecione...</option>',
    ...subcategories.map(subcategory => `<option value="${subcategory}">${humanizeOptionLabel(subcategory)}</option>`)
  ].join('');

  if (selectedSubcategory && subcategories.includes(selectedSubcategory)) {
    subcategorySelect.value = selectedSubcategory;
  }
}

function syncEditInfraSubcategoryOptions(selectedCategory = '', selectedSubcategory = '') {
  const subcategorySelect = document.getElementById('editInfraSubcategory');
  if (!subcategorySelect) return;

  const categoryKey = selectedCategory || document.getElementById('editInfraCategory')?.value || '';
  subcategorySelect.innerHTML = buildInfraSubcategoryOptionsHtml(categoryKey, selectedSubcategory);
}

function populateUsuariosSelects() {
  const userOptions = usuariosCache
    .filter(user => normalizeRole(user.role) === 'admin')
    .map(user => `<option value="${user.id}">${user.name || user.username}</option>`)
    .join('');

  const chamadosAssignedTo = document.getElementById('chamadoAssignedTo');
  if (chamadosAssignedTo) {
    chamadosAssignedTo.innerHTML = '<option value="">Definir depois</option>' + userOptions;
  }

  const chamadosFilterAssignedTo = document.getElementById('chamadoFilterAssignedTo');
  if (chamadosFilterAssignedTo) {
    chamadosFilterAssignedTo.innerHTML = '<option value="">Todos</option>' + userOptions;
  }

  const infraAssignedTo = document.getElementById('infraAssignedTo');
  if (infraAssignedTo) {
    infraAssignedTo.innerHTML = '<option value="">Definir depois</option>' + userOptions;
  }

  const infraFilterAssignedTo = document.getElementById('infraFilterAssignedTo');
  if (infraFilterAssignedTo) {
    infraFilterAssignedTo.innerHTML = '<option value="">Todos</option>' + userOptions;
  }
}

function populateDepartmentFilter() {
  const sourceSelect = document.getElementById('chamadoDepartment');
  const filterSelect = document.getElementById('chamadoFilterDepartment');
  if (!sourceSelect || !filterSelect) return;

  const options = Array.from(sourceSelect.options)
    .filter(option => option.value)
    .map(option => `<option value="${option.value}">${option.textContent}</option>`)
    .join('');

  filterSelect.innerHTML = '<option value="">Todos</option>' + options;

  const infraDepartment = document.getElementById('infraDepartment');
  if (infraDepartment) {
    infraDepartment.innerHTML = '<option value="">Selecione...</option>' + options;
  }

  const infraFilterDepartment = document.getElementById('infraFilterDepartment');
  if (infraFilterDepartment) {
    infraFilterDepartment.innerHTML = '<option value="">Todos</option>' + options;
  }
}

function populateUnitFilter() {
  const sourceSelect = document.getElementById('chamadoUnit');
  const filterSelect = document.getElementById('chamadoFilterUnit');
  if (!sourceSelect || !filterSelect) return;

  const options = Array.from(sourceSelect.options)
    .filter(option => option.value)
    .map(option => `<option value="${option.value}">${option.textContent}</option>`)
    .join('');

  filterSelect.innerHTML = '<option value="">Todas</option>' + options;

  const infraUnit = document.getElementById('infraUnit');
  if (infraUnit) {
    infraUnit.innerHTML = '<option value="">Selecione...</option>' + options;
  }

  const infraFilterUnit = document.getElementById('infraFilterUnit');
  if (infraFilterUnit) {
    infraFilterUnit.innerHTML = '<option value="">Todas</option>' + options;
  }
}

async function loadChamadosMetadata() {
  try {
    const response = await fetch(`${API_URL}/chamados/metadata`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      chamadosMetadata = await response.json();
    }
  } catch (error) {
    console.error('Erro ao carregar metadados de chamados:', error);
  }

  buildChamadoCategoryOptions('chamadoCategory');
  buildChamadoCategoryOptions('chamadoFilterCategory', 'Todas');
  syncChamadoSubcategoryOptions();
  populateDepartmentFilter();
  populateUnitFilter();
}

async function loadInfraMetadata() {
  try {
    const response = await fetch(`${API_URL}/infraestrutura/metadata`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      infraMetadata = await response.json();
    }
  } catch (error) {
    console.error('Erro ao carregar metadados de infraestrutura:', error);
  }

  buildInfraCategoryOptions('infraCategory');
  buildInfraCategoryOptions('infraFilterCategory', 'Todas');
  syncInfraSubcategoryOptions();
}

async function loadChamadoUsers() {
  if (!isAdmin()) return;

  try {
    const response = await fetch(`${API_URL}/usuarios/list`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    usuariosCache = await response.json();
    if (!Array.isArray(usuariosCache)) {
      usuariosCache = [];
    }
  } catch (error) {
    console.error('Erro ao carregar técnicos:', error);
    usuariosCache = [];
  }

  populateUsuariosSelects();
}

async function loadChamadosSummary() {
  if (!isAdmin()) return;

  const filters = getChamadosFilterState();
  const response = await fetch(`${API_URL}/chamados/summary?${new URLSearchParams(filters).toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return;

  const data = await response.json();
  document.getElementById('reportOpenedTickets').textContent = data?.totals?.opened || 0;
  document.getElementById('reportClosedTickets').textContent = data?.totals?.closed || 0;
  document.getElementById('reportPendingTickets').textContent = data?.totals?.pending || 0;
  document.getElementById('reportSlaPercentage').textContent = `${Number(data?.sla?.withinPercentage || 0).toFixed(0)}%`;
}

function generateChamadosReportPdf() {
  if (!isAdmin()) {
    alert('A geração do relatório de chamados é permitida somente para administradores.');
    return;
  }

  const filters = getChamadosFilterState();
  const appliedFilters = [
    ['Status', filters.statusGroup || 'todos'],
    ['Período', filters.from || filters.to ? `${filters.from || '...'} até ${filters.to || '...'}` : 'Todos'],
    ['Setor', filters.department || 'Todos'],
    ['Categoria', filters.category || 'Todas'],
    ['Prioridade', filters.priority || 'Todas'],
    ['Canal', filters.opening_channel || 'Todos'],
    ['SLA', filters.sla_status || 'Todos'],
    ['Recorrência', filters.recurrence || 'Todos'],
    ['Unidade', filters.unit_name || 'Todas'],
    ['Técnico', document.getElementById('chamadoFilterAssignedTo')?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Busca', filters.search || '-']
  ];

  const summary = {
    opened: document.getElementById('reportOpenedTickets')?.textContent || '0',
    closed: document.getElementById('reportClosedTickets')?.textContent || '0',
    pending: document.getElementById('reportPendingTickets')?.textContent || '0',
    sla: document.getElementById('reportSlaPercentage')?.textContent || '0%'
  };

  const rows = chamadosCache.map(chamado => `
    <tr>
      <td>${chamado.ticket_number || `#${chamado.id}`}</td>
      <td>${chamado.requester_name || getChamadoUserName(chamado)}</td>
      <td>${chamado.department || '-'}</td>
      <td>${chamado.title}</td>
      <td>${chamado.category || '-'}</td>
      <td>${humanizeOptionLabel(chamado.priority)}</td>
      <td>${getChamadoStatusLabel(chamado.status)}</td>
      <td>${chamado.assigned_to_name || '-'}</td>
      <td>${getChamadoSlaLabel(chamado)}</td>
      <td>${new Date(chamado.opened_at || chamado.created_at).toLocaleDateString('pt-BR')}</td>
    </tr>
  `).join('');

  const reportWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!reportWindow) {
    alert('Não foi possível abrir a janela de impressão.');
    return;
  }

  reportWindow.document.write(`
    <html lang="pt-BR">
      <head>
        <title>Relatório de Chamados</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1, h2 { margin: 0 0 12px; }
          .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 20px; }
          .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
          .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Relatório de Chamados</h1>
        <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
        <div class="cards">
          <div class="card"><strong>Abertos</strong><div>${summary.opened}</div></div>
          <div class="card"><strong>Encerrados</strong><div>${summary.closed}</div></div>
          <div class="card"><strong>Pendentes</strong><div>${summary.pending}</div></div>
          <div class="card"><strong>SLA</strong><div>${summary.sla}</div></div>
        </div>
        <h2>Filtros aplicados</h2>
        <div class="meta">
          ${appliedFilters.map(([label, value]) => `<div><strong>${label}:</strong> ${value}</div>`).join('')}
        </div>
        <h2>Chamados</h2>
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Solicitante</th>
              <th>Setor</th>
              <th>Título</th>
              <th>Categoria</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Técnico</th>
              <th>SLA</th>
              <th>Abertura</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10">Nenhum chamado encontrado.</td></tr>'}</tbody>
        </table>
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

function ensureChamadosReportAccess() {
  if (!isAdmin()) {
    alert('A geração do relatório de chamados é permitida somente para administradores.');
    return false;
  }
  return true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getChamadosReportFileStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function getChamadosReportAppliedFilters() {
  const filters = getChamadosFilterState();
  return [
    ['Status', filters.statusGroup || 'todos'],
    ['Período', filters.from || filters.to ? `${filters.from || '...'} até ${filters.to || '...'}` : 'Todos'],
    ['Setor', filters.department || 'Todos'],
    ['Categoria', filters.category || 'Todas'],
    ['Prioridade', filters.priority || 'Todas'],
    ['Canal', filters.opening_channel || 'Todos'],
    ['SLA', filters.sla_status || 'Todos'],
    ['Recorrência', filters.recurrence || 'Todos'],
    ['Unidade', filters.unit_name || 'Todas'],
    ['Técnico', document.getElementById('chamadoFilterAssignedTo')?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Busca', filters.search || '-']
  ];
}

function getChamadosReportSummary() {
  const averageSeconds = (values) => {
    const validValues = values.filter(value => Number(value) > 0);
    if (!validValues.length) return '-';
    const total = validValues.reduce((sum, value) => sum + Number(value), 0);
    return formatDurationSeconds(Math.round(total / validValues.length));
  };

  return {
    opened: document.getElementById('reportOpenedTickets')?.textContent || '0',
    closed: document.getElementById('reportClosedTickets')?.textContent || '0',
    pending: document.getElementById('reportPendingTickets')?.textContent || '0',
    sla: document.getElementById('reportSlaPercentage')?.textContent || '0%',
    avgTotal: averageSeconds(chamadosCache.map(getChamadoTotalSeconds)),
    avgService: averageSeconds(chamadosCache.map(getChamadoServiceSeconds)),
    avgWaiting: averageSeconds(chamadosCache.map(getChamadoWaitingSeconds))
  };
}

function getChamadosReportRows() {
  return chamadosCache.map(chamado => ({
    numero: chamado.ticket_number || `#${chamado.id}`,
    solicitante: chamado.requester_name || getChamadoUserName(chamado),
    setor: chamado.department || '-',
    titulo: chamado.title || '-',
    categoria: chamado.category || '-',
    prioridade: humanizeOptionLabel(chamado.priority),
    status: getChamadoStatusLabel(chamado.status),
    tecnico: chamado.assigned_to_name || '-',
    canal: humanizeOptionLabel(chamado.opening_channel || 'sistema'),
    unidade: chamado.unit_name || '-',
    sla: getChamadoSlaLabel(chamado),
    tempoTotal: formatDurationSeconds(getChamadoTotalSeconds(chamado)),
    tempoAtendimento: chamado.service_started_at ? formatDurationSeconds(getChamadoServiceSeconds(chamado)) : '-',
    tempoEspera: formatDurationSeconds(getChamadoWaitingSeconds(chamado)),
    tempoFechamento: chamado.resolved_at && chamado.closed_at ? formatDurationSeconds(getChamadoClosingSeconds(chamado)) : '-',
    abertura: new Date(chamado.opened_at || chamado.created_at).toLocaleDateString('pt-BR')
  }));
}

function buildChamadosReportDocument() {
  const generatedAt = new Date().toLocaleString('pt-BR');
  const appliedFilters = getChamadosReportAppliedFilters();
  const summary = getChamadosReportSummary();
  const rows = getChamadosReportRows();
  const rowsHtml = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.numero)}</td>
      <td>${escapeHtml(row.solicitante)}</td>
      <td>${escapeHtml(row.setor)}</td>
      <td>${escapeHtml(row.titulo)}</td>
      <td>${escapeHtml(row.categoria)}</td>
      <td>${escapeHtml(row.prioridade)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.tecnico)}</td>
      <td>${escapeHtml(row.canal)}</td>
      <td>${escapeHtml(row.unidade)}</td>
      <td>${escapeHtml(row.sla)}</td>
      <td>${escapeHtml(row.tempoTotal)}</td>
      <td>${escapeHtml(row.tempoAtendimento)}</td>
      <td>${escapeHtml(row.tempoEspera)}</td>
      <td>${escapeHtml(row.tempoFechamento)}</td>
      <td>${escapeHtml(row.abertura)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatório de Chamados</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; background: #f8fafc; }
          .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px; }
          .toolbar button { border:none; border-radius:8px; padding:10px 14px; cursor:pointer; }
          .toolbar .primary { background:#0d6efd; color:#fff; }
          .toolbar .secondary { background:#e5e7eb; color:#111827; }
          .sheet { background:#fff; border-radius:16px; padding:24px; box-shadow:0 10px 30px rgba(15,23,42,0.08); }
          h1, h2 { margin: 0 0 12px; }
          p { margin: 0 0 16px; color:#475569; }
          .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 20px; }
          .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
          .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px; background:#f8fafc; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          @media print {
            body { padding: 0; background:#fff; }
            .toolbar { display:none; }
            .sheet { box-shadow:none; border-radius:0; padding:0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button>
          <button class="secondary" onclick="window.__saveReportHtml()">Salvar HTML</button>
        </div>
        <div class="sheet">
          <h1>Relatório de Chamados</h1>
          <p>Gerado em ${escapeHtml(generatedAt)}</p>
          <div class="cards">
            <div class="card"><strong>Abertos</strong><div>${escapeHtml(summary.opened)}</div></div>
            <div class="card"><strong>Encerrados</strong><div>${escapeHtml(summary.closed)}</div></div>
            <div class="card"><strong>Pendentes</strong><div>${escapeHtml(summary.pending)}</div></div>
            <div class="card"><strong>SLA</strong><div>${escapeHtml(summary.sla)}</div></div>
            <div class="card"><strong>Média total</strong><div>${escapeHtml(summary.avgTotal)}</div></div>
            <div class="card"><strong>Média atendimento</strong><div>${escapeHtml(summary.avgService)}</div></div>
            <div class="card"><strong>Média espera</strong><div>${escapeHtml(summary.avgWaiting)}</div></div>
          </div>
          <h2>Filtros aplicados</h2>
          <div class="meta">
            ${appliedFilters.map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join('')}
          </div>
          <h2>Chamados</h2>
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Solicitante</th>
                <th>Setor</th>
                <th>Título</th>
                <th>Categoria</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Técnico</th>
                <th>Canal</th>
                <th>Unidade</th>
                <th>SLA</th>
                <th>Tempo total</th>
                <th>Atendimento</th>
                <th>Espera</th>
                <th>Fechamento</th>
                <th>Abertura</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="16">Nenhum chamado encontrado.</td></tr>'}</tbody>
          </table>
        </div>
        <script>
          window.__saveReportHtml = function () {
            const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'relatorio-chamados-${getChamadosReportFileStamp()}.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          };
        </script>
      </body>
    </html>
  `;

  return { html, summary, appliedFilters, rows };
}

function downloadChamadosReportFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function openChamadosReportHtml(printOnOpen = false) {
  if (!ensureChamadosReportAccess()) return;

  const reportWindow = window.open('', '_blank', 'width=1400,height=900');
  if (!reportWindow) {
    alert('Não foi possível abrir a janela do relatório.');
    return;
  }

  const { html } = buildChamadosReportDocument();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();

  if (printOnOpen) {
    reportWindow.onload = () => {
      reportWindow.focus();
      reportWindow.print();
    };
  }
}

function generateChamadosReportPdf() {
  openChamadosReportHtml(true);
}

function exportChamadosReportExcel() {
  if (!ensureChamadosReportAccess()) return;
  const { html } = buildChamadosReportDocument();
  downloadChamadosReportFile(html, `relatorio-chamados-${getChamadosReportFileStamp()}.xls`, 'application/vnd.ms-excel;charset=utf-8');
}

function exportChamadosReportCsv() {
  if (!ensureChamadosReportAccess()) return;

  const headers = [
    'Numero',
    'Solicitante',
    'Setor',
    'Titulo',
    'Categoria',
    'Prioridade',
    'Status',
    'Tecnico',
    'Canal',
    'Unidade',
    'SLA',
    'Tempo total',
    'Atendimento',
    'Espera',
    'Fechamento',
    'Abertura'
  ];
  const rows = getChamadosReportRows();
  const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(';'),
    ...rows.map(row => [
      row.numero,
      row.solicitante,
      row.setor,
      row.titulo,
      row.categoria,
      row.prioridade,
      row.status,
      row.tecnico,
      row.canal,
      row.unidade,
      row.sla,
      row.tempoTotal,
      row.tempoAtendimento,
      row.tempoEspera,
      row.tempoFechamento,
      row.abertura
    ].map(escapeCsvValue).join(';'))
  ].join('\n');

  downloadChamadosReportFile(`\uFEFF${csv}`, `relatorio-chamados-${getChamadosReportFileStamp()}.csv`, 'text/csv;charset=utf-8');
}

function exportChamadosReportJson() {
  if (!ensureChamadosReportAccess()) return;

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: Object.fromEntries(getChamadosReportAppliedFilters()),
    summary: getChamadosReportSummary(),
    chamados: getChamadosReportRows()
  };

  downloadChamadosReportFile(JSON.stringify(payload, null, 2), `relatorio-chamados-${getChamadosReportFileStamp()}.json`, 'application/json;charset=utf-8');
}

function ensureInfraReportAccess() {
  if (!isAdmin()) {
    alert('A geracao do relatorio de infraestrutura e permitida somente para administradores.');
    return false;
  }
  return true;
}

function getInfraReportFileStamp() {
  return getChamadosReportFileStamp();
}

function getInfraReportAppliedFilters() {
  const filters = getInfraFilterState();
  return [
    ['Status', filters.statusGroup || 'ativos'],
    ['Periodo', filters.from || filters.to ? `${filters.from || '...'} ate ${filters.to || '...'}` : 'Todos'],
    ['Setor', filters.department || 'Todos'],
    ['Categoria', filters.category || 'Todas'],
    ['Prioridade', filters.priority || 'Todas'],
    ['SLA', filters.sla_status || 'Todos'],
    ['Unidade', filters.unit_name || 'Todas'],
    ['Responsavel', document.getElementById('infraFilterAssignedTo')?.selectedOptions?.[0]?.textContent || 'Todos'],
    ['Busca', filters.search || '-']
  ];
}

function getInfraReportSummary() {
  const averageSeconds = (values) => {
    const validValues = values.filter(value => Number(value) > 0);
    if (!validValues.length) return '-';
    const total = validValues.reduce((sum, value) => sum + Number(value), 0);
    return formatDurationSeconds(Math.round(total / validValues.length));
  };

  return {
    opened: document.getElementById('infraReportOpened')?.textContent || '0',
    closed: document.getElementById('infraReportClosed')?.textContent || '0',
    approval: document.getElementById('infraReportApproval')?.textContent || '0',
    sla: document.getElementById('infraReportSla')?.textContent || '0%',
    avgTotal: averageSeconds(infraChamadosCache.map(getChamadoTotalSeconds)),
    avgService: averageSeconds(infraChamadosCache.map(getChamadoServiceSeconds)),
    avgWaiting: averageSeconds(infraChamadosCache.map(getChamadoWaitingSeconds))
  };
}

function getInfraReportRows() {
  return infraChamadosCache.map(chamado => ({
    numero: chamado.ticket_number || `#${chamado.id}`,
    solicitante: chamado.requester_name || getChamadoUserName(chamado),
    setor: chamado.department || '-',
    titulo: chamado.title || '-',
    categoria: chamado.category || '-',
    subcategoria: chamado.subcategory || '-',
    prioridade: humanizeOptionLabel(chamado.priority),
    status: getInfraStatusLabel(chamado.status),
    responsavel: chamado.assigned_to_name || '-',
    canal: humanizeOptionLabel(chamado.opening_channel || 'sistema'),
    unidade: chamado.unit_name || '-',
    ambiente: chamado.environment || '-',
    ativo: chamado.asset_identifier || '-',
    fornecedor: chamado.supplier_name || '-',
    sla: getInfraSlaLabel(chamado),
    tempoTotal: formatDurationSeconds(getChamadoTotalSeconds(chamado)),
    tempoAtendimento: chamado.service_started_at ? formatDurationSeconds(getChamadoServiceSeconds(chamado)) : '-',
    tempoEspera: formatDurationSeconds(getChamadoWaitingSeconds(chamado)),
    tempoFechamento: chamado.resolved_at && chamado.closed_at ? formatDurationSeconds(getChamadoClosingSeconds(chamado)) : '-',
    abertura: new Date(chamado.opened_at || chamado.created_at).toLocaleDateString('pt-BR')
  }));
}

function buildInfraReportDocument() {
  const generatedAt = new Date().toLocaleString('pt-BR');
  const appliedFilters = getInfraReportAppliedFilters();
  const summary = getInfraReportSummary();
  const rows = getInfraReportRows();
  const rowsHtml = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.numero)}</td>
      <td>${escapeHtml(row.solicitante)}</td>
      <td>${escapeHtml(row.setor)}</td>
      <td>${escapeHtml(row.titulo)}</td>
      <td>${escapeHtml(row.categoria)}</td>
      <td>${escapeHtml(row.subcategoria)}</td>
      <td>${escapeHtml(row.prioridade)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.responsavel)}</td>
      <td>${escapeHtml(row.canal)}</td>
      <td>${escapeHtml(row.unidade)}</td>
      <td>${escapeHtml(row.ambiente)}</td>
      <td>${escapeHtml(row.ativo)}</td>
      <td>${escapeHtml(row.fornecedor)}</td>
      <td>${escapeHtml(row.sla)}</td>
      <td>${escapeHtml(row.tempoTotal)}</td>
      <td>${escapeHtml(row.tempoAtendimento)}</td>
      <td>${escapeHtml(row.tempoEspera)}</td>
      <td>${escapeHtml(row.tempoFechamento)}</td>
      <td>${escapeHtml(row.abertura)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatorio de Chamados de Infraestrutura</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; background: #f8fafc; }
          .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px; }
          .toolbar button { border:none; border-radius:8px; padding:10px 14px; cursor:pointer; }
          .toolbar .primary { background:#0d6efd; color:#fff; }
          .toolbar .secondary { background:#e5e7eb; color:#111827; }
          .sheet { background:#fff; border-radius:16px; padding:24px; box-shadow:0 10px 30px rgba(15,23,42,0.08); }
          h1, h2 { margin: 0 0 12px; }
          p { margin: 0 0 16px; color:#475569; }
          .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 20px; }
          .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
          .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px; background:#f8fafc; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          @media print {
            body { padding: 0; background:#fff; }
            .toolbar { display:none; }
            .sheet { box-shadow:none; border-radius:0; padding:0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button>
          <button class="secondary" onclick="window.__saveReportHtml()">Salvar HTML</button>
        </div>
        <div class="sheet">
          <h1>Relatorio de Chamados de Infraestrutura</h1>
          <p>Gerado em ${escapeHtml(generatedAt)}</p>
          <div class="cards">
            <div class="card"><strong>Abertos</strong><div>${escapeHtml(summary.opened)}</div></div>
            <div class="card"><strong>Encerrados</strong><div>${escapeHtml(summary.closed)}</div></div>
            <div class="card"><strong>Aguard. aprovacao</strong><div>${escapeHtml(summary.approval)}</div></div>
            <div class="card"><strong>SLA</strong><div>${escapeHtml(summary.sla)}</div></div>
            <div class="card"><strong>Media total</strong><div>${escapeHtml(summary.avgTotal)}</div></div>
            <div class="card"><strong>Media atendimento</strong><div>${escapeHtml(summary.avgService)}</div></div>
            <div class="card"><strong>Media espera</strong><div>${escapeHtml(summary.avgWaiting)}</div></div>
          </div>
          <h2>Filtros aplicados</h2>
          <div class="meta">
            ${appliedFilters.map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join('')}
          </div>
          <h2>Chamados</h2>
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Solicitante</th>
                <th>Setor</th>
                <th>Titulo</th>
                <th>Categoria</th>
                <th>Subcategoria</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Responsavel</th>
                <th>Canal</th>
                <th>Unidade</th>
                <th>Ambiente</th>
                <th>Ativo</th>
                <th>Fornecedor</th>
                <th>SLA</th>
                <th>Tempo total</th>
                <th>Atendimento</th>
                <th>Espera</th>
                <th>Fechamento</th>
                <th>Abertura</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="20">Nenhum chamado encontrado.</td></tr>'}</tbody>
          </table>
        </div>
        <script>
          window.__saveReportHtml = function () {
            const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'relatorio-infraestrutura-${getInfraReportFileStamp()}.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          };
        </script>
      </body>
    </html>
  `;

  return { html, summary, appliedFilters, rows };
}

function openInfraReportHtml(printOnOpen = false) {
  if (!ensureInfraReportAccess()) return;

  const reportWindow = window.open('', '_blank', 'width=1400,height=900');
  if (!reportWindow) {
    alert('Nao foi possivel abrir a janela do relatorio.');
    return;
  }

  const { html } = buildInfraReportDocument();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();

  if (printOnOpen) {
    reportWindow.onload = () => {
      reportWindow.focus();
      reportWindow.print();
    };
  }
}

function generateInfraReportPdf() {
  openInfraReportHtml(true);
}

function exportInfraReportExcel() {
  if (!ensureInfraReportAccess()) return;
  const { html } = buildInfraReportDocument();
  downloadChamadosReportFile(html, `relatorio-infraestrutura-${getInfraReportFileStamp()}.xls`, 'application/vnd.ms-excel;charset=utf-8');
}

function exportInfraReportCsv() {
  if (!ensureInfraReportAccess()) return;

  const headers = [
    'Numero',
    'Solicitante',
    'Setor',
    'Titulo',
    'Categoria',
    'Subcategoria',
    'Prioridade',
    'Status',
    'Responsavel',
    'Canal',
    'Unidade',
    'Ambiente',
    'Ativo',
    'Fornecedor',
    'SLA',
    'Tempo total',
    'Atendimento',
    'Espera',
    'Fechamento',
    'Abertura'
  ];
  const rows = getInfraReportRows();
  const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(';'),
    ...rows.map(row => [
      row.numero,
      row.solicitante,
      row.setor,
      row.titulo,
      row.categoria,
      row.subcategoria,
      row.prioridade,
      row.status,
      row.responsavel,
      row.canal,
      row.unidade,
      row.ambiente,
      row.ativo,
      row.fornecedor,
      row.sla,
      row.tempoTotal,
      row.tempoAtendimento,
      row.tempoEspera,
      row.tempoFechamento,
      row.abertura
    ].map(escapeCsvValue).join(';'))
  ].join('\n');

  downloadChamadosReportFile(`\uFEFF${csv}`, `relatorio-infraestrutura-${getInfraReportFileStamp()}.csv`, 'text/csv;charset=utf-8');
}

function exportInfraReportJson() {
  if (!ensureInfraReportAccess()) return;

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: Object.fromEntries(getInfraReportAppliedFilters()),
    summary: getInfraReportSummary(),
    chamados: getInfraReportRows()
  };

  downloadChamadosReportFile(JSON.stringify(payload, null, 2), `relatorio-infraestrutura-${getInfraReportFileStamp()}.json`, 'application/json;charset=utf-8');
}
