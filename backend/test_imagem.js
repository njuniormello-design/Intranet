const http = require('http');

const fileName = 'funcionario-1774049564342-482627289.jpg';

const options = {
  hostname: 'localhost',
  port: 5000,
  path: `/uploads/funcionarios/${fileName}`,
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  
  if (res.statusCode === 200) {
    console.log('✅ IMAGEM SENDO SERVIDA CORRETAMENTE!');
  } else {
    console.log('❌ Erro ao servir imagem');
  }
  
  process.exit(0);
});

req.on('error', (err) => {
  console.error('❌ Erro na requisição:', err);
  process.exit(1);
});

req.end();
