const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const EXCLUDED_RES = new Set(['38', '195']);

function loadRawBase() {
  const importUsersPath = path.join(__dirname, 'import-users.js');
  const source = fs.readFileSync(importUsersPath, 'utf8');
  const match = source.match(/const rawUsers = `([\s\S]*?)`;/);

  if (!match) {
    throw new Error('Base de usuarios nao encontrada em import-users.js');
  }

  return match[1];
}

function parseFuncionarios() {
  return loadRawBase()
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [re, nome, cargo, departamento, email, ramal] = line.split(';').map((value) => value.trim());
      return {
        re,
        nome,
        cargo,
        departamento,
        email: email.toLowerCase(),
        ramal
      };
    });
}

async function main() {
  const funcionarios = parseFuncionarios();
  const funcionariosToImport = funcionarios.filter((funcionario) => !EXCLUDED_RES.has(funcionario.re));
  const excludedFuncionarios = funcionarios.filter((funcionario) => EXCLUDED_RES.has(funcionario.re));

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  let inserted = 0;
  let updated = 0;
  let deduplicated = 0;

  try {
    await connection.beginTransaction();

    for (const funcionario of funcionariosToImport) {
      const params = [funcionario.re];
      const lookupParts = ['re = ?'];

      if (funcionario.email) {
        lookupParts.push('email = ?');
        params.push(funcionario.email);
      }

      lookupParts.push('nome = ?');
      params.push(funcionario.nome);

      const [existing] = await connection.query(
        `SELECT id, re, email, nome
         FROM funcionarios
         WHERE ${lookupParts.join(' OR ')}
         ORDER BY
           CASE WHEN re = ? THEN 0 WHEN email = ? AND email <> '' THEN 1 ELSE 2 END,
           id ASC`,
        [...params, funcionario.re, funcionario.email]
      );

      if (existing.length) {
        const keepId = existing[0].id;

        await connection.query(
          `UPDATE funcionarios
           SET re = ?, nome = ?, cargo = ?, email = ?, ramal = ?, departamento = ?, status = 'ativo', updated_at = NOW()
           WHERE id = ?`,
          [
            funcionario.re,
            funcionario.nome,
            funcionario.cargo,
            funcionario.email,
            funcionario.ramal || null,
            funcionario.departamento || null,
            keepId
          ]
        );

        const duplicateIds = existing
          .slice(1)
          .map((row) => row.id);

        if (duplicateIds.length) {
          await connection.query(
            'UPDATE funcionarios SET status = "inativo", updated_at = NOW() WHERE id IN (?)',
            [duplicateIds]
          );
          deduplicated += duplicateIds.length;
        }

        updated += 1;
      } else {
        await connection.query(
          `INSERT INTO funcionarios
             (nome, re, cargo, email, ramal, departamento, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'ativo', NULL)`,
          [
            funcionario.nome,
            funcionario.re,
            funcionario.cargo,
            funcionario.email,
            funcionario.ramal || null,
            funcionario.departamento || null
          ]
        );
        inserted += 1;
      }
    }

    await connection.query(
      'UPDATE funcionarios SET status = "inativo", updated_at = NOW() WHERE re IN (?, ?)',
      [...EXCLUDED_RES]
    );

    await connection.commit();

    console.log(`Funcionarios inseridos: ${inserted}`);
    console.log(`Funcionarios atualizados: ${updated}`);
    console.log(`Duplicados antigos inativados: ${deduplicated}`);
    console.log(`Funcionarios excluidos da carga: ${excludedFuncionarios.length}`);
    console.log(excludedFuncionarios.map((funcionario) => `- RE ${funcionario.re}: ${funcionario.nome}`).join('\n'));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Erro ao importar funcionarios:', error.message);
  process.exit(1);
});
