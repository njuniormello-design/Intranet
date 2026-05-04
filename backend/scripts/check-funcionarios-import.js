const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  try {
    const [[activeTotal]] = await connection.query(
      'SELECT COUNT(*) AS total FROM funcionarios WHERE status = "ativo"'
    );
    const [excluded] = await connection.query(
      'SELECT re, nome, status FROM funcionarios WHERE re IN ("38", "195") ORDER BY re'
    );
    const [sample] = await connection.query(
      'SELECT re, nome, cargo, departamento, email, ramal FROM funcionarios WHERE status = "ativo" ORDER BY nome LIMIT 5'
    );

    console.log(JSON.stringify({
      activeTotal: activeTotal.total,
      excluded,
      sample
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Erro ao conferir funcionarios:', error.message);
  process.exit(1);
});
