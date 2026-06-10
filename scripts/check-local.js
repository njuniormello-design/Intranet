const { spawnSync } = require('child_process');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const checks = [];

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: 'utf8',
    shell: false
  });

  checks.push({
    label,
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  });
}

function checkHttp(label, url) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      res.resume();
      checks.push({ label, ok: res.statusCode >= 200 && res.statusCode < 500, output: `HTTP ${res.statusCode}` });
      resolve();
    });

    req.on('error', error => {
      checks.push({ label, ok: false, output: error.message });
      resolve();
    });

    req.setTimeout(3000, () => {
      req.destroy();
      checks.push({ label, ok: false, output: 'timeout' });
      resolve();
    });
  });
}

async function main() {
  run('Sintaxe backend/routes/chamados.js', process.execPath, ['--check', 'backend/routes/chamados.js']);
  run('Sintaxe backend/routes/frota.js', process.execPath, ['--check', 'backend/routes/frota.js']);
  run('Sintaxe backend/server.js', process.execPath, ['--check', 'backend/server.js']);
  run('Sintaxe frontend/js/dashboard.js', process.execPath, ['--check', 'frontend/js/dashboard.js']);

  run(
    'Estrutura de validacao da Frota no banco local',
    process.execPath,
    [
      '-e',
      `const pool=require('./config/database');
       (async()=>{
         const expected=['last_reopen_reason','reopen_count','user_validated_at','user_validation_comment','user_validation_status'];
         const [rows]=await pool.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='frota_chamados' AND COLUMN_NAME IN ('user_validation_status','user_validation_comment','user_validated_at','reopen_count','last_reopen_reason') ORDER BY COLUMN_NAME");
         const found=rows.map(r=>r.COLUMN_NAME);
         const missing=expected.filter(name=>!found.includes(name));
         if(missing.length){ console.error('Faltando: '+missing.join(', ')); process.exit(1); }
         console.log(found.join(', '));
         await pool.end();
       })().catch(error=>{ console.error(error.message); process.exit(1); });`
    ],
    { cwd: path.join(rootDir, 'backend') }
  );

  run(
    'Permissoes separadas de responsaveis no banco local',
    process.execPath,
    [
      '-e',
      `const pool=require('./config/database');
       (async()=>{
         const [tables]=await pool.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_assignment_permissions'");
         if(!tables.length){ console.error('Tabela user_assignment_permissions ausente'); process.exit(1); }
         const [indexes]=await pool.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_assignment_permissions' AND INDEX_NAME='uniq_user_assignment_permission'");
         if(!indexes.length){ console.error('Indice unico de responsaveis ausente'); process.exit(1); }
         console.log('user_assignment_permissions pronta');
         await pool.end();
       })().catch(error=>{ console.error(error.message); process.exit(1); });`
    ],
    { cwd: path.join(rootDir, 'backend') }
  );

  run(
    'Colunas de validacao no banco local',
    process.execPath,
    [
      '-e',
      `const pool=require('./config/database');
       (async()=>{
         const expected=['user_validated_at','user_validation_comment','user_validation_status'];
         const [rows]=await pool.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='chamados' AND COLUMN_NAME IN ('user_validation_status','user_validation_comment','user_validated_at') ORDER BY COLUMN_NAME");
         const found=rows.map(r=>r.COLUMN_NAME);
         const missing=expected.filter(name=>!found.includes(name));
         if(missing.length){ console.error('Faltando: '+missing.join(', ')); process.exit(1); }
         console.log(found.join(', '));
         await pool.end();
       })().catch(error=>{ console.error(error.message); process.exit(1); });`
    ],
    { cwd: path.join(rootDir, 'backend') }
  );

  await checkHttp('Backend local porta 5000', 'http://127.0.0.1:5000/');
  await checkHttp('Frontend local porta 8000', 'http://127.0.0.1:8000/index.html');

  let failed = 0;
  for (const check of checks) {
    const icon = check.ok ? '[OK]' : '[ERRO]';
    console.log(`${icon} ${check.label}`);
    if (check.output) console.log(`     ${check.output.split('\n').slice(-3).join('\n     ')}`);
    if (!check.ok) failed += 1;
  }

  if (failed) {
    console.error(`\n${failed} verificacao(oes) falharam.`);
    process.exit(1);
  }

  console.log('\nTudo pronto para o teste funcional local.');
}

main();
