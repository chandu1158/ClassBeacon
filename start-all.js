import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function ensureMysql() {
  const mysqlRunning = await isPortOpen(3306);
  if (mysqlRunning) {
    console.log('✓ MySQL is already running on port 3306.');
    return;
  }

  console.log('Starting local MySQL database service...');
  const xamppMysql = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
  const myIni = 'C:\\xampp\\mysql\\bin\\my.ini';

  try {
    const mysqlProcess = spawn(xamppMysql, [`--defaults-file=${myIni}`, '--console'], {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    mysqlProcess.unref();

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isPortOpen(3306)) {
        console.log('✓ MySQL database started successfully on port 3306.');
        return;
      }
    }
  } catch (err) {
    console.warn('Could not launch mysqld automatically:', err.message);
  }
}

async function ensureBackend() {
  const backendRunning = await isPortOpen(5000);
  if (backendRunning) {
    console.log('✓ Backend Express server is already running on http://localhost:5000');
    return;
  }

  console.log('Starting Backend Express API server on http://localhost:5000...');
  const backend = spawn('node', ['server.js'], {
    cwd: path.join(rootDir, 'server'),
    detached: true,
    stdio: 'inherit',
    shell: true,
  });
  backend.unref();

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await isPortOpen(5000)) {
      console.log('✓ Backend API server started successfully on http://localhost:5000');
      return;
    }
  }
}

async function startAll() {
  console.log('\n======================================================');
  console.log('🚀 Starting ClassBeacon Full Stack (DB + Backend + Frontend)');
  console.log('======================================================\n');

  await ensureMysql();
  await ensureBackend();

  console.log('\nStarting Frontend Vite Dev Server on http://localhost:5173...\n');
  const frontend = spawn('npm', ['run', 'dev', '--prefix', 'apps/web'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  frontend.on('exit', (code) => {
    process.exit(code || 0);
  });
}

startAll().catch((err) => {
  console.error('Failed to start ClassBeacon:', err);
  process.exit(1);
});
