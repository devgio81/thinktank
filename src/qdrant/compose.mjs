import { spawn } from 'node:child_process';
import net from 'node:net';
import { IMAGE, fail, timeout, validateState } from './config.mjs';

export function runCommand(command, args, { env = process.env, timeoutMs = 30000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    let child, output = '', settled = false, timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const error = (code, message, details) => { try { fail(code, message, details); } catch (e) { finish(e); } };
    try { child = spawn(command, args, { env, cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { error('QDRANT_PROCESS', 'Prozess konnte nicht gestartet werden.'); return; }
    timer = setTimeout(() => { child.kill('SIGKILL'); error('QDRANT_TIMEOUT', 'Prozessfrist überschritten; Docker/uv und Dienstzustand prüfen.'); }, timeout(timeoutMs));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 1024 * 1024) { child.kill('SIGKILL'); error('QDRANT_PROCESS', 'Prozessantwort überschreitet die zulässige Größe.'); }
    });
    // Never forward Docker output: daemon errors/inspect may contain credentials.
    child.stderr.resume();
    child.once('error', e => error(e.code === 'ENOENT' ? 'QDRANT_DEPENDENCY' : 'QDRANT_PROCESS', 'Docker Compose fehlt oder ist nicht ausführbar; Docker und Compose installieren/starten.'));
    child.once('close', (code, signal) => {
      if (code === 0) finish(null, { stdout: output });
      else error('QDRANT_PROCESS', 'Docker-Befehl fehlgeschlagen; Daemon, Image und Compose prüfen. Fremde Instanzen nicht stoppen.', { exitCode: code ?? 1, signal });
    });
  });
}
export function composeDocument(config) {
  const labels = { 'dev.thinktank.instance': config.instanceId };
  return `${JSON.stringify({
    name: config.projectName,
    services: { qdrant: {
      image: IMAGE, restart: 'unless-stopped',
      ports: [`127.0.0.1:${config.port}:6333`],
      environment: {
        QDRANT__SERVICE__API_KEY: '${QDRANT_API_KEY:?private qdrant.env required}',
        QDRANT__SERVICE__ENABLE_TLS: 'false', QDRANT__LOG_LEVEL: 'WARN',
      },
      volumes: ['storage:/qdrant/storage'], labels,
    } },
    volumes: { storage: { labels } },
  }, null, 2)}\n`;
}
export function composeCommand(config, action = ['up', '-d']) {
  validateState(config, config.stateDir);
  if (!Array.isArray(action) || !action.every(s => typeof s === 'string')) fail('QDRANT_CONFIG', 'Compose-Aktion muss eine Argumentliste sein.');
  return { command: 'docker', args: ['compose', '--project-name', config.projectName,
    '--project-directory', config.stateDir, '--env-file', config.envFile, '-f', config.composeFile, ...action] };
}
export function dockerEnvironment(env = process.env) {
  const result = { ...env };
  for (const key of Object.keys(result)) if (key.startsWith('COMPOSE_') || key === 'QDRANT_API_KEY') delete result[key];
  return result;
}
export async function localDocker(run, options) {
  const host = options.env.DOCKER_HOST;
  if (host && !host.startsWith('unix://')) fail('QDRANT_DOCKER_REMOTE', 'Nur ein lokaler Docker-Socket ist zulässig; DOCKER_HOST verweist nicht auf unix://.');
  const result = await run('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], options);
  let endpoint;
  try { endpoint = JSON.parse(result.stdout.trim()); } catch { fail('QDRANT_PROCESS', 'Docker-Kontext konnte nicht geprüft werden.'); }
  if ((!host || options.env.DOCKER_CONTEXT) && (typeof endpoint !== 'string' || !endpoint.startsWith('unix://'))) fail('QDRANT_DOCKER_REMOTE', 'Docker-Kontext ist nicht lokal. Lokalen Docker-Desktop-/Unix-Kontext auswählen.');
  await run('docker', ['compose', 'version'], options);
}
export async function availablePort(port = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => { try { fail('QDRANT_PORT', 'Loopback-Port ist belegt oder nicht verfügbar. Anderen Port wählen; fremde Instanz nicht stoppen.'); } catch (e) { reject(e); } });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      const actual = server.address().port;
      server.close(error => error ? reject(error) : resolve(actual));
    });
  });
}
function parseInspection(stdout) {
  try { const parsed = JSON.parse(stdout.trim()); return Array.isArray(parsed) ? parsed[0] : parsed; }
  catch { fail('QDRANT_OWNERSHIP', 'Docker-Zuordnung ist nicht überprüfbar; keine fremden Ressourcen übernehmen.'); }
}
export async function ownedContainer(config, existing, run, options) {
  const project = `label=com.docker.compose.project=${config.projectName}`;
  const ids = (await run('docker', ['ps', '-aq', '--filter', project], options)).stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length > 1 || (!existing && ids.length)) fail('QDRANT_OWNERSHIP', 'Compose-Projekt ist bereits belegt; keine Übernahme.');
  let running = false;
  for (const id of ids) {
    if (!/^[a-f0-9]{12,64}$/.test(id)) fail('QDRANT_OWNERSHIP', 'Ungültige Docker-Containerkennung.');
    const data = parseInspection((await run('docker', ['inspect', '--format', '{{json .}}', id], options)).stdout);
    const labels = data.Config?.Labels;
    const bindings = data.HostConfig?.PortBindings;
    if (labels?.['dev.thinktank.instance'] !== config.instanceId || labels?.['com.docker.compose.project'] !== config.projectName || labels?.['com.docker.compose.service'] !== 'qdrant' || data.Config?.Image !== IMAGE || JSON.stringify(bindings?.['6333/tcp']) !== JSON.stringify([{ HostIp: '127.0.0.1', HostPort: String(config.port) }]) || Object.keys(bindings ?? {}).length !== 1 || !data.Mounts?.some(m => m.Type === 'volume' && m.Name === `${config.projectName}_storage` && m.Destination === '/qdrant/storage')) fail('QDRANT_OWNERSHIP', 'Containeridentität, Image, Volume oder Loopback-Port weichen ab. Keine Übernahme oder Reparatur.');
    running = data.State?.Running === true;
  }
  const expectedVolume = `${config.projectName}_storage`;
  const volumes = (await run('docker', ['volume', 'ls', '-q', '--filter', `name=${expectedVolume}`], options)).stdout.trim().split(/\s+/).filter(name => name === expectedVolume);
  if (volumes.length > 1 || (!existing && volumes.length)) fail('QDRANT_OWNERSHIP', 'Compose-Volume ist bereits belegt; keine Übernahme.');
  for (const name of volumes) {
    if (name !== `${config.projectName}_storage`) fail('QDRANT_OWNERSHIP', 'Unerwartetes Compose-Volume.');
    const data = parseInspection((await run('docker', ['volume', 'inspect', '--format', '{{json .}}', name], options)).stdout);
    if (data.Labels?.['dev.thinktank.instance'] !== config.instanceId || data.Labels?.['com.docker.compose.project'] !== config.projectName) fail('QDRANT_OWNERSHIP', 'Volume gehört nicht zur gespeicherten Instanz.');
  }
  return running;
}
