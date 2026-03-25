const { execSync } = require('child_process');

function getPortFromArgs() {
  const arg = process.argv[2];
  const parsed = Number.parseInt(arg || '3000', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

function getListeningPidsWindows(port) {
  const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  const lines = output.split(/\r?\n/);
  const pids = new Set();

  for (const line of lines) {
    if (!line.includes('LISTENING')) continue;
    if (!line.includes(`:${port}`)) continue;

    const match = line.trim().match(/\s(\d+)$/);
    if (match) pids.add(match[1]);
  }

  return [...pids];
}

function getListeningPidsUnix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
    if (!output) return [];
    return output.split(/\r?\n/).map((pid) => pid.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function killPidWindows(pid) {
  execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
}

function killPidUnix(pid) {
  execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
}

function main() {
  const port = getPortFromArgs();
  const isWindows = process.platform === 'win32';
  const pids = isWindows ? getListeningPidsWindows(port) : getListeningPidsUnix(port);

  if (pids.length === 0) {
    console.log(`No se encontro ningun proceso escuchando en el puerto ${port}.`);
    return;
  }

  let killed = 0;
  for (const pid of pids) {
    try {
      if (isWindows) {
        killPidWindows(pid);
      } else {
        killPidUnix(pid);
      }
      killed += 1;
    } catch (error) {
      const message = error && error.message ? error.message : 'Error desconocido';
      console.error(`No se pudo detener PID ${pid}: ${message}`);
    }
  }

  if (killed > 0) {
    console.log(`Se detuvieron ${killed} proceso(s) en el puerto ${port}.`);
    return;
  }

  process.exitCode = 1;
}

main();
