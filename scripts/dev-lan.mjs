// Levanta todo lo necesario para usar la oficina virtual desde otros equipos de
// la red local, en modo desarrollo (con recarga en caliente):
//
//   1. Asegura .env (IP de la LAN + secretos) y un certificado TLS autofirmado.
//   2. Arranca PostgreSQL y Janus en Docker (puertos publicados por docker-compose.dev.yml).
//   3. Arranca la API (NestJS) y el cliente (Vite con HTTPS) en el host.
//
// Uso:
//   npm run dev:lan                 # IP detectada automáticamente
//   npm run dev:lan -- --ip 192.168.1.7
//   npm run dev:lan -- --no-docker  # sin voz/video (sin Janus)
//   npm run dev:lan -- --no-web --no-server  # solo infraestructura
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { certsDir, detectLanIp, ensureCert, envPath, lanCandidates, readEnvFile, rootDir } from './lan.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : undefined);

const ipArg = valueOf('--ip');
const useDocker = !has('--no-docker');
const runServer = !has('--no-server');
const runWeb = !has('--no-web');
const isWindows = process.platform === 'win32';

// 1. .env --------------------------------------------------------------------
if (!existsSync(envPath)) {
  console.log('.env no encontrado: ejecutando scripts/setup-env.mjs ...');
  const setup = spawnSync(process.execPath, [join(rootDir, 'scripts', 'setup-env.mjs'), ...(ipArg ? ['--ip', ipArg] : [])], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (setup.status !== 0 || !existsSync(envPath)) {
    console.error('No se pudo generar .env. Abortando.');
    process.exit(1);
  }
}

const env = readEnvFile();
const ip = ipArg ?? env.LAN_IP ?? detectLanIp();
if (!ip) {
  console.error('No se detectó ninguna IP de red local. Usa: npm run dev:lan -- --ip 192.168.1.50');
  process.exit(1);
}
if (ipArg && env.LAN_IP && ipArg !== env.LAN_IP) {
  console.log(`Aviso: .env tiene LAN_IP=${env.LAN_IP} pero usarás ${ipArg}. Janus anunciará ${ipArg}.`);
}

const cert = ensureCert(ip);
console.log(`Certificado TLS ${cert.created ? 'generado' : 'reutilizado'}: ${cert.cert}`);

const dockerEnv = { ...process.env, LAN_IP: ip };

// 2. Infraestructura Docker --------------------------------------------------
let dockerReady = false;
if (useDocker) {
  console.log('Levantando PostgreSQL y Janus en Docker ...');
  const up = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'up', '-d', 'postgres', 'janus'],
    { cwd: rootDir, stdio: 'inherit', env: dockerEnv, shell: isWindows },
  );
  if (up.status !== 0) {
    console.error('No se pudieron levantar los contenedores. La voz/video no estará disponible.');
    console.error('Revisa que Docker Desktop esté en marcha y vuelve a intentarlo.');
  } else {
    dockerReady = (await waitForPort('127.0.0.1', 5432, 30000)) && (await waitForPort('127.0.0.1', 8088, 30000));
  }
}

// 3. Procesos de desarrollo --------------------------------------------------
const children = [];
const run = (name, cmdArgs, extraEnv) => {
  const child = spawn('npm', cmdArgs, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  prefixStream(child.stdout, name, console.log);
  prefixStream(child.stderr, name, console.error);
  child.on('exit', (code) => console.log(`[${name}] proceso terminado (código ${code ?? 0})`));
  return child;
};

const databaseUrl = process.env.DATABASE_URL ?? `postgresql://office:${env.POSTGRES_PASSWORD ?? 'office'}@localhost:5432/office`;

if (runServer) {
  run('server', ['run', 'dev:server'], {
    LAN_IP: ip,
    DATABASE_URL: databaseUrl,
    ...(dockerReady ? { JANUS_API_URL: 'http://localhost:8088/janus' } : {}),
    JANUS_AUTH_SECRET: env.JANUS_AUTH_SECRET,
    JANUS_ADMIN_KEY: env.JANUS_ADMIN_KEY,
    JANUS_ROOM_SECRET: env.JANUS_ROOM_SECRET,
    JWT_SECRET: env.JWT_SECRET,
  });
}

if (runWeb) {
  run('web', ['run', 'dev:web'], {
    LAN_IP: ip,
    VITE_HTTPS: '1',
    VITE_TLS_CERT: cert.cert,
    VITE_TLS_KEY: cert.key,
    VITE_API_TARGET: 'http://localhost:3000',
    VITE_JANUS_TARGET: 'http://localhost:8188',
  });
}

// 4. Resumen y apagado -------------------------------------------------------
const otherIps = lanCandidates().filter((c) => c.address !== ip);
console.log('');
console.log('Oficina virtual en marcha (modo desarrollo):');
console.log(`  Este equipo:   https://localhost:5173`);
console.log(`  Red local:     https://${ip}:5173`);
for (const c of otherIps) console.log(`  Otra IP:       https://${c.address}:5173  (${c.name})`);
console.log(`  Certificado:   ${join(certsDir, 'dev.crt')} (autofirmado)`);
console.log('');
console.log('Los demás equipos deben aceptar el aviso del certificado una vez');
console.log('(o instalarlo como entidad de certificación raíz de confianza).');
console.log(dockerReady
  ? 'Voz y video: Janus en Docker, proxied por Vite en /janus.'
  : 'Voz y video: DESACTIVADOS (Janus no está disponible).');
console.log('Detén con Ctrl+C. La infraestructura Docker sigue con: npm run down');
console.log('');

function prefixStream(stream, name, write) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) write(`[${name}] ${line}`);
  });
}

function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = createConnection({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        console.log(`Puerto ${port} listo.`);
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          console.warn(`El puerto ${port} no respondió a tiempo; continúo igualmente.`);
          resolve(false);
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

function killTree(child) {
  if (!child.pid || child.killed) return;
  if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nDeteniendo procesos de desarrollo ...');
  for (const child of children) killTree(child);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
