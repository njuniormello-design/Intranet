const API_URL = 'http://localhost:5000/api';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null') || {};

const ROLE_LABELS = {
  admin: 'Administrador',
  creator: 'Criador',
  viewer: 'Visualizador',
  user: 'Visualizador'
};

const RECENT_ANNOUNCEMENTS_LIMIT = 10;
let chamadosCache = [];
let comunicadosCache = [];
let documentosCache = [];
let funcionariosCache = [];
let ideiasCache = [];
let editingChamadoId = null;
let editingChamadoData = null;
let editingComunicadoId = null;
let editingFuncionarioId = null;

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
  return ['admin', 'creator'].includes(getCurrentRole());
}

function getAllowedUserRoles() {
  return getCurrentRole() === 'admin' ? ['viewer', 'creator', 'admin'] : ['viewer', 'creator'];
}

function canManageCatalogs() {
  return ['admin', 'creator'].includes(getCurrentRole());
}

function isAdmin() {
  return getCurrentRole() === 'admin';
}

function canViewIdeasInbox() {
  return isAdmin();
}

function getChamadosEndpoint(filters = {}) {
  const baseUrl = isAdmin() ? `${API_URL}/chamados/all` : `${API_URL}/chamados/my-chamados`;
  const params = new URLSearchParams();

  if (filters.statusGroup) params.set('statusGroup', filters.statusGroup);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function getChamadoUserName(chamado) {
  if (chamado?.user_name) return chamado.user_name;
  if (chamado?.name) return chamado.name;
  return currentUser.name || currentUser.username || 'Usuário';
}

function getChamadoPriorityRank(priority) {
  const normalized = normalizeSearchText(priority);
  if (normalized === 'urgente') return 0;
  if (normalized === 'alta') return 1;
  if (normalized === 'normal') return 2;
  if (normalized === 'baixa') return 3;
  return 4;
}

function sortChamados(chamados) {
  return [...(Array.isArray(chamados) ? chamados : [])].sort((a, b) => {
    const priorityDiff = getChamadoPriorityRank(a?.priority) - getChamadoPriorityRank(b?.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = new Date(a?.created_at || 0).getTime();
    const dateB = new Date(b?.created_at || 0).getTime();
    return dateB - dateA;
  });
}

function getChamadosFilterState() {
  const statusGroup = document.getElementById('chamadoStatusFilter')?.value || 'ativos';
  const from = document.getElementById('chamadoDateFrom')?.value || '';
  const to = document.getElementById('chamadoDateTo')?.value || '';
  return { statusGroup, from, to };
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

  const fromInput = document.getElementById('chamadoDateFrom');
  const toInput = document.getElementById('chamadoDateTo');

  if (fromInput) {
    fromInput.max = maxDate;
  }
  if (toInput) {
    toInput.max = maxDate;
  }
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

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
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
}

// Carregar dados do usuário
window.addEventListener('load', async () => {
  await hydrateCurrentUser();
  renderCurrentUser();
  applyRolePermissions();
  loadDashboard();
});

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

function applyRolePermissions() {
  const usuariosNav = document.getElementById('navUsuarios');
  if (usuariosNav) {
    usuariosNav.style.display = canAccessUsers() ? '' : 'none';
  }

  const usuariosPage = document.getElementById('usuarios');
  if (usuariosPage && !canAccessUsers()) {
    usuariosPage.style.display = 'none';
  }

  const btnNovoFuncionario = document.getElementById('btnNovoFuncionario');
  if (btnNovoFuncionario) {
    btnNovoFuncionario.style.display = canManageCatalogs() ? '' : 'none';
  }

  const newFuncionarioForm = document.getElementById('newFuncionarioForm');
  if (newFuncionarioForm && !canManageCatalogs()) {
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
}

// Carregar página
function loadPage(page, evt) {
  if (page === 'usuarios' && !canAccessUsers()) {
    alert('Seu perfil não tem acesso a essa área.');
    return;
  }

  const pages = ['dashboard', 'chamados', 'comunicados', 'documentos', 'funcionarios', 'ideias', 'usuarios'];
  
  pages.forEach(p => {
    const pageEl = document.getElementById(p);
    if (pageEl) {
      pageEl.style.display = p === page ? 'block' : 'none';
    }
  });

  // Atualizar nav ativa
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const navLink = evt?.target?.closest('.nav-link');
  if (navLink) {
    navLink.classList.add('active');
  }

  // Atualizar título
  const titles = {
    dashboard: 'Dashboard',
    chamados: 'Gerenciamento de Chamados',
    comunicados: 'Comunicados',
    documentos: 'Repositório de Documentos',
    funcionarios: 'Gerenciamento de Funcionários',
    ideias: 'Banco de Ideias',
    usuarios: 'Cadastro de Usuários'
  };
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = titles[page] || 'Dashboard';
  }

  // Carregar dados da página
  if (page === 'chamados') {
    loadChamados();
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
}

function hideChamadoForm() {
  document.getElementById('newChamadoForm').style.display = 'none';
  document.getElementById('formNewChamado').reset();
}

document.getElementById('formNewChamado')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = getFieldValue('chamadoTitle');
  const description = getFieldValue('chamadoDescription');
  const category = getFieldValue('chamadoCategory');
  const priority = getFieldValue('chamadoPriority');
  const validationErrors = [];

  if (!validateLength(title, 3, 120)) {
    validationErrors.push('Título do chamado deve ter entre 3 e 120 caracteres');
  }
  if (!validateLength(description, 10, 2000)) {
    validationErrors.push('Descrição do chamado deve ter entre 10 e 2000 caracteres');
  }
  if (category && !validateLength(category, 1, 100)) {
    validationErrors.push('Departamento do chamado deve ter no máximo 100 caracteres');
  }
  if (!['baixa', 'normal', 'alta', 'urgente'].includes(priority)) {
    validationErrors.push('Selecione uma prioridade válida');
  }

  if (showValidationAlert(validationErrors)) {
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('category', category);
  formData.append('priority', priority);

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

    if (response.ok) {
      alert('Chamado criado com sucesso!');
      hideChamadoForm();
      loadChamados();
    } else {
      alert('Erro ao criar chamado');
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
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum chamado encontrado</td></tr>';
      return;
    }

    tableBody.innerHTML = chamadosCache.map(c => `
      <tr>
        <td>#${c.id}</td>
        <td>${getChamadoUserName(c)}</td>
        <td>${c.title}</td>
        <td>${c.category || '-'}</td>
        <td><span class="priority-badge ${c.priority}">${c.priority}</span></td>
        <td><span class="status-badge ${c.status}">${c.status}</span></td>
        <td>${new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
        <td>
          <button onclick="showChamadoDetails(${c.id})" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">Ver</button>
        </td>
      </tr>
    `).join('');
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
              <option value="aberto" ${chamado.status === 'aberto' ? 'selected' : ''}>Aberto</option>
              <option value="pendente" ${chamado.status === 'pendente' ? 'selected' : ''}>Pendente</option>
              <option value="fechado" ${chamado.status === 'fechado' ? 'selected' : ''}>Fechado</option>
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
      <p><strong>Departamento:</strong> ${chamado.category || '-'}</p>
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
  if (!['aberto', 'pendente', 'fechado'].includes(status)) {
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
let limiteFunc = 12;

function showNewFuncionarioForm() {
  if (!canManageCatalogs()) {
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
  if (!canManageCatalogs()) {
    alert('Seu perfil não tem acesso a este cadastro.');
    return;
  }

  const funcionario = funcionariosCache.find(f => f.id === funcionarioId);
  if (!funcionario) {
    alert('Funcionário não encontrado.');
    return;
  }

  editingFuncionarioId = funcionarioId;
  document.getElementById('funcNome').value = funcionario.nome || '';
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

    const nome = getFieldValue('funcNome');
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
    const fotoUrl = f.foto_path ? `http://localhost:5000${f.foto_path}` : null;
    console.log(`Foto de ${f.nome}:`, fotoUrl);
    
    return `
    <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.3s; border: 1px solid #e0e0e0;">
      <div style="width: 100%; aspect-ratio: 4 / 5; min-height: 210px; background: linear-gradient(180deg, #f8fafc, #e2e8f0); display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 40px;">
        ${fotoUrl ? `<img src="${fotoUrl}" alt="${f.nome}" style="width: 100%; height: 100%; object-fit: cover;" onerror="console.error('Erro ao carregar imagem: ${fotoUrl}')">` : '👤'}
      </div>
      <div style="padding: 12px; background: white;">
        <div style="font-weight: bold; color: #333; margin-bottom: 5px; font-size: 14px; word-break: break-word;">${f.nome}</div>
        <div style="color: #666; font-size: 12px; margin-bottom: 5px;">${f.cargo}</div>
        ${f.departamento ? `<div style="background: #e7f3ff; color: #0056b3; padding: 3px 6px; border-radius: 3px; font-size: 10px; margin-bottom: 5px; display: inline-block;">📍 ${f.departamento}</div>` : ''}
        ${f.ramal ? `<div style="color: #999; font-size: 11px; margin-bottom: 5px; display: block;">📞 ${f.ramal}</div>` : ''}
        <a href="mailto:${f.email}" style="color: #007bff; font-size: 11px; text-decoration: none; display: block; margin-bottom: 8px; word-break: break-all;">${f.email}</a>
        <div style="display: flex; gap: 5px; flex-direction: column;">
          ${canManageCatalogs() ? `<button onclick="event.stopPropagation(); showEditFuncionarioForm(${f.id})" style="width: 100%; padding: 5px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Editar</button>` : ''}
          ${canManageCatalogs() ? `<button onclick="event.stopPropagation(); deletarFunc(${f.id})" style="flex: 1; padding: 5px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Deletar</button>` : ''}
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
    const funcionarios = await response.json();
    renderizarGaleriaFunc(funcionarios);
    document.getElementById('funcionariosPaginacao').innerHTML = '<p style="text-align: center; color: #666;">Total encontrado: ' + funcionarios.length + '</p>';
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
    const role = document.getElementById('usuarioPerfil').value;
    const validationErrors = [];

    if (!validateLength(username, 3, 30) || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      validationErrors.push('Login deve ter entre 3 e 30 caracteres e usar apenas letras, números, ponto, underline ou hífen');
    }
    if (!validateLength(password, 6, 72)) {
      validationErrors.push('Senha deve ter entre 6 e 72 caracteres');
    }
    if (name && !validateLength(name, 2, 100)) {
      validationErrors.push('Nome deve ter entre 2 e 100 caracteres');
    }
    if (birthDate && isFutureDate(birthDate)) {
      validationErrors.push('Data de nascimento nao pode ser futura');
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
      password,
      role,
      birth_date: birthDate || null
    };

    try {
      const response = await fetch(`${API_URL}/usuarios/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      const apiMessage = data?.error || data?.message || (Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.map(err => err.msg).join(' | ')
        : null);

      if (response.ok) {
        alert('Usuário cadastrado com sucesso!');
        hideUsuarioForm();
        loadUsuarios();
      } else {
        alert(apiMessage || 'Erro ao cadastrar usuário');
      }
    } catch (error) {
      console.error('Erro ao cadastrar usuário:', error);
      alert('Erro ao cadastrar usuário: ' + error.message);
    }
  });
}

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

    if (usuarios.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum usuário cadastrado</td></tr>';
      return;
    }

    tableBody.innerHTML = usuarios.map(u => `
      <tr>
        <td>#${u.id}</td>
        <td>${u.username}</td>
        <td>${u.name || '-'}</td>
        <td>${u.email || '-'}</td>
        <td>${formatDateToPtBr(u.birth_date)}</td>
        <td><span style="display: inline-block; padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 600;">${ROLE_LABELS[normalizeRole(u.role)] || u.role}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
        <td>
          ${getCurrentRole() === 'admin' && u.id !== currentUser.id ? `<button onclick="deleteUser(${u.id})" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;">Excluir</button>` : '-'}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: red;">Erro ao carregar usuários: ${error.message}</td></tr>`;
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
}
