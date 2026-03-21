const API_URL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api';

function toggleForms() {
  document.getElementById('loginForm').style.display =
    document.getElementById('loginForm').style.display === 'none' ? 'block' : 'none';
  document.getElementById('registerForm').style.display =
    document.getElementById('registerForm').style.display === 'none' ? 'block' : 'none';
}

// Login
document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const messageDiv = document.getElementById('message');

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      messageDiv.textContent = 'Login realizado! Redirecionando...';
      messageDiv.className = 'message success';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);
    } else {
      messageDiv.textContent = data.error || 'Erro ao fazer login';
      messageDiv.className = 'message error';
    }
  } catch (error) {
    messageDiv.textContent = 'Erro de conexão com o servidor';
    messageDiv.className = 'message error';
  }
});

// Registrar
document.getElementById('formRegister')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value;
  const username = document.getElementById('regUsername').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('regPassword').value;
  const messageDiv = document.getElementById('message');

  if (password.length < 6) {
    messageDiv.textContent = 'Senha deve ter no mínimo 6 caracteres';
    messageDiv.className = 'message error';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, username, email, password })
    });

    const data = await response.json();

    if (response.ok) {
      messageDiv.textContent = 'Cadastro realizado com sucesso! Faça login agora.';
      messageDiv.className = 'message success';
      document.getElementById('formRegister').reset();

      setTimeout(() => {
        toggleForms();
        document.getElementById('formLogin').reset();
      }, 1500);
    } else {
      messageDiv.textContent = data.error || 'Erro ao registrar';
      messageDiv.className = 'message error';
    }
  } catch (error) {
    messageDiv.textContent = 'Erro de conexão com o servidor';
    messageDiv.className = 'message error';
  }
});

// Verificar autenticação
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token && !window.location.pathname.includes('index.html')) {
    window.location.href = 'index.html';
  }
}

checkAuth();