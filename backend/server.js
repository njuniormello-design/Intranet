const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir arquivos estáticos com headers CORS explícitos
const uploadsPath = path.join(__dirname, 'uploads');
console.log(`Servindo arquivos estáticos de: ${uploadsPath}`);
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static(uploadsPath));

// Importar rotas
const authRoutes = require('./routes/auth');
const chamadosRoutes = require('./routes/chamados');
const comunicadosRoutes = require('./routes/comunicados');
const documentosRoutes = require('./routes/documentos');
const funcionariosRoutes = require('./routes/funcionarios');
const usuariosRoutes = require('./routes/usuarios');

// Usar rotas
app.use('/api/auth', authRoutes);
app.use('/api/chamados', chamadosRoutes);
app.use('/api/comunicados', comunicadosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ message: 'API de Intranet funcionando!' });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
