const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

async function checkDocuments() {
  try {
    const connection = await pool.getConnection();
    const [documentos] = await connection.query('SELECT id, name, file_path, file_name FROM documentos LIMIT 5');
    connection.release();

    console.log('\n=== DOCUMENTOS NO BANCO DE DADOS ===');
    documentos.forEach(doc => {
      const normalPath = path.normalize(doc.file_path);
      const exists = fs.existsSync(normalPath);
      console.log(`\nID: ${doc.id}`);
      console.log(`Nome: ${doc.name}`);
      console.log(`File Name: ${doc.file_name}`);
      console.log(`Caminho salvo: ${doc.file_path}`);
      console.log(`Caminho normalizado: ${normalPath}`);
      console.log(`Arquivo existe? ${exists}`);
      
      if (!exists) {
        // Verificar se o arquivo pode estar em outro lugar
        const uploadDir = path.join(__dirname, 'uploads/documentos');
        const files = fs.readdirSync(uploadDir);
        console.log(`Arquivos no diretório: ${files.slice(0, 5).join(', ')}...`);
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

checkDocuments();
