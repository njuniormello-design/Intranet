const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const frontendUrl = 'http://127.0.0.1:8000/index.html';
const backendUrl = 'http://127.0.0.1:5000/';

const nodeCmd = process.execPath;

const children = [];
let shuttingDown = false;
let browserOpened = false;

function spawnProcess(label, cwd) {
  const child = spawn(nodeCmd, ['server.js'], {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', code => {
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`Processo ${label} encerrou com codigo ${code}.`);
      shutdown(code || 1);
    }
  });

  children.push(child);
  return child;
}

function checkPort(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise(resolve => {
    const socket = new (require('net').Socket)();
    let settled = false;

    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function openBrowser(url) {
  if (browserOpened) return;
  browserOpened = true;

  const command = process.platform === 'win32'
    ? { file: 'cmd', args: ['/c', 'start', '', url] }
    : process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : { file: 'xdg-open', args: [url] };

  spawn(command.file, command.args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
  }).unref();
}

function waitForHttp(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }

        retry();
      });

      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timeout aguardando ${url}`));
        return;
      }

      setTimeout(check, 500);
    };

    check();
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Iniciando backend e frontend...');

Promise.all([
  checkPort(5000),
  checkPort(8000),
]).then(([backendRunning, frontendRunning]) => {
  if (!backendRunning) {
    spawnProcess('backend', backendDir);
  } else {
    console.log('Backend ja esta rodando na porta 5000, nao vou iniciar outro.');
  }

  if (!frontendRunning) {
    spawnProcess('frontend', frontendDir);
  } else {
    console.log('Frontend ja esta rodando na porta 8000, nao vou iniciar outro.');
  }

  waitForHttp(frontendUrl)
    .then(() => {
      console.log(`Abrindo interface em ${frontendUrl}`);
      openBrowser(frontendUrl);
    })
    .catch(error => {
      console.warn(error.message);
      return waitForHttp(backendUrl)
        .then(() => {
          console.log(`Porta 8000 indisponivel, abrindo backend em ${backendUrl}`);
          openBrowser(backendUrl);
        })
        .catch(() => {
          console.log(`Abrindo interface mesmo assim em ${frontendUrl}`);
          openBrowser(frontendUrl);
        });
    });
});
