function normalizeRole(role) {
    if (!role) return 'viewer';
    const value = String(role).toLowerCase();
    if (value === 'user') return 'viewer';
    if (value === 'moderator') return 'creator';
    if (['admin', 'creator', 'viewer'].includes(value)) return value;
    return 'viewer';
}

function canManageCatalogs(role) {
    return ['admin', 'creator'].includes(normalizeRole(role));
}

function carregarSidebar() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    let currentUser = {};
    const userInfo = localStorage.getItem('user');
    if (userInfo) {
        try {
            currentUser = JSON.parse(userInfo) || {};
            const usernameEl = document.getElementById('username');
            if (usernameEl) {
                usernameEl.textContent = currentUser.name || 'Usuário';
            }
        } catch (e) {
            console.error('Erro ao parse do usuário:', e);
        }
    }

    sidebar.innerHTML = `
        <aside class="sidebar">
            <div class="sidebar-header">
                <h2>Intranet</h2>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    <li><a href="dashboard.html">📊 Dashboard</a></li>
                    <li><a href="chamados.html">🎫 Chamados</a></li>
                    <li><a href="comunicados.html">📢 Comunicados</a></li>
                    <li><a href="documentos.html">📁 Documentos</a></li>
                    <li><a href="funcionarios.html" class="active">👥 Funcionários</a></li>
                </ul>
            </nav>
        </aside>
    `;

    hydrateSidebarUser(currentUser, token);
}

async function hydrateSidebarUser(currentUser, token) {
    try {
        const response = await fetch('http://localhost:5000/api/auth/verify', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data?.user) {
                currentUser = { ...currentUser, ...data.user, role: normalizeRole(data.user.role) };
                localStorage.setItem('user', JSON.stringify(currentUser));
                const usernameEl = document.getElementById('username');
                if (usernameEl) {
                    usernameEl.textContent = currentUser.name || 'Usuário';
                }
            }
        }
    } catch (e) {
        console.error('Erro ao validar usuário da sidebar:', e);
    }

    applyPermissionVisibility(currentUser);
}

function applyPermissionVisibility(user) {
    const role = normalizeRole(user?.role);
    const isManager = canManageCatalogs(role);

    const funcionarioFormCard = document.getElementById('funcionarioFormCard');
    if (funcionarioFormCard) {
        funcionarioFormCard.style.display = isManager ? '' : 'none';
    }

    const formFuncionario = document.getElementById('formFuncionario');
    if (formFuncionario) {
        const submitBtn = formFuncionario.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.style.display = isManager ? '' : 'none';
        }

        if (!isManager) {
            const formGroups = formFuncionario.querySelectorAll('.form-group');
            formGroups.forEach(group => {
                const labels = group.querySelectorAll('label');
                const buttons = group.querySelectorAll('button');
                labels.forEach(el => (el.style.display = 'none'));
                buttons.forEach(el => (el.style.display = 'none'));
            });
        }
    }

    const btnNovoFuncionario = document.getElementById('btnNovoFuncionario');
    if (btnNovoFuncionario) {
        btnNovoFuncionario.style.display = isManager ? '' : 'none';
    }

    const newFuncionarioForm = document.getElementById('newFuncionarioForm');
    if (newFuncionarioForm && !isManager) {
        newFuncionarioForm.style.display = 'none';
    }

    const btnUploadDocumento = document.getElementById('btnUploadDocumento');
    if (btnUploadDocumento) {
        btnUploadDocumento.style.display = isManager ? '' : 'none';
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}
