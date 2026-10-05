import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';

// Real stdio MCP protocol probe. No model output or transport response is fabricated.
export async function probeMcp(command, args, { timeoutMs = 240000 } = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let sequence = 0;
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', line => {
    let response;
    try { response = JSON.parse(line); } catch { return; }
    const slot = pending.get(response.id);
    if (!slot) return;
    pending.delete(response.id);
    clearTimeout(slot.timer);
    if (response.error) slot.reject(new Error(`MCP response error: ${JSON.stringify(response.error)}`));
    else slot.resolve(response.result);
  });
  child.on('error', error => {
    for (const slot of pending.values()) { clearTimeout(slot.timer); slot.reject(error); }
    pending.clear();
  });
  child.on('exit', code => {
    for (const slot of pending.values()) { clearTimeout(slot.timer); slot.reject(new Error(`MCP exited ${code}: ${stderr}`)); }
    pending.clear();
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timeout (${timeoutMs}ms): ${stderr}`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  try {
    const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'thinktank-integration', version: '17.0.0' } });
    if (!initialized?.serverInfo) throw new Error('MCP initialize omitted serverInfo.');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const listed = await request('tools/list', {});
    const tools = listed.tools ?? [];
    const store = tools.find(tool => /qdrant[-_]store$/.test(tool.name));
    const find = tools.find(tool => /qdrant[-_]find$/.test(tool.name));
    if (!store || !find) throw new Error('MCP did not expose qdrant store/find tools.');
    const marker = `thinktank-v17-integration-${randomUUID()}`;
    const stored = await request('tools/call', { name: store.name, arguments: { information: marker, metadata: { test_run: marker } } });
    if (stored.isError) throw new Error(`MCP store failed: ${JSON.stringify(stored)}`);
    const found = await request('tools/call', { name: find.name, arguments: { query: marker } });
    if (found.isError || !JSON.stringify(found).includes(marker)) throw new Error('MCP find did not retrieve its real stored marker.');
    return { server: initialized.serverInfo, tools: tools.map(t => t.name), marker, stored: true, recalled: true };
  } finally {
    lines.close();
    child.stdin.end();
    child.kill('SIGTERM');
    for (const slot of pending.values()) clearTimeout(slot.timer);
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode) return resolve();
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
