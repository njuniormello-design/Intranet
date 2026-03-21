const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

async function checkFotos() {
  try {
    const connection = await pool.getConnection();
    const [funcionarios] = await connection.query('SELECT id, nome, foto_name, foto_path FROM funcionarios LIMIT 10');
    connection.release();

    console.log('\n=== FUNCIONÁRIOS E FOTOS ===');
    funcionarios.forEach(f => {
      const uploadDir = path.join(__dirname, 'uploads/funcionarios');
      console.log(`\nID: ${f.id}`);
      console.log(`Nome: ${f.nome}`);
      console.log(`Foto name: ${f.foto_name}`);
      console.log(`Foto path (no BD): ${f.foto_path}`);
      
      if (f.foto_path) {
        // Tentar construir o caminho do arquivo
        let filePath = f.foto_path;
        if (!filePath.startsWith('/')) {
          filePath = path.join(uploadDir, path.basename(filePath));
        } else {
          filePath = path.join(__dirname, filePath);
        }
        
        filePath = path.normalize(filePath);
        console.log(`Caminho construído: ${filePath}`);
        console.log(`Arquivo existe? ${fs.existsSync(filePath)}`);
      }
    });

    // Verificar arquivos no diretório
    const uploadDir = path.join(__dirname, 'uploads/funcionarios');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      console.log(`\n=== ARQUIVOS EM /uploads/funcionarios ===`);
      console.log(`Total: ${files.length} arquivos`);
      files.slice(0, 5).forEach(f => console.log(`  - ${f}`));
    }

    process.exit(0);
  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

checkFotos();
