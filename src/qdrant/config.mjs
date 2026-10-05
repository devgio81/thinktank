import path from 'node:path';
import { createHash } from 'node:crypto';

export const IMAGE = 'qdrant/qdrant:v1.19.0';
export const MCP_VERSION = '0.8.1';
export const EMBEDDING = Object.freeze({
  embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
  vectorName: 'fast-all-minilm-l6-v2', dimension: 384, distance: 'Cosine',
});
export class QdrantError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'QdrantError';
    this.code = code;
    Object.assign(this, details);
  }
}
export function fail(code, message, details) { throw new QdrantError(code, message, details); }
export function timeout(value = 30000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) fail('QDRANT_CONFIG', 'timeoutMs muss eine positive Millisekundenzahl sein.');
  return value;
}
export function portNumber(value) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) fail('QDRANT_CONFIG', 'Port muss eine Ganzzahl zwischen 1 und 65535 sein.');
  return value;
}
export function collectionName(value = 'thinktank-memory') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) fail('QDRANT_CONFIG', 'Collection muss 1–128 Buchstaben, Ziffern, Bindestriche oder Unterstriche enthalten.');
  return value;
}
export function statePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value) || value.split(path.sep).includes('..')) fail('QDRANT_STATE', 'stateDir muss ein absoluter, traversal-freier Pfad sein.');
  return path.resolve(value);
}
export function projectName(stateDir, instanceId) {
  return `thinktank-${createHash('sha256').update(`${stateDir}\0${instanceId}`).digest('hex').slice(0, 24)}`;
}
export function validateConfig(config) {
  if (!config || typeof config !== 'object') fail('QDRANT_CONFIG', 'Qdrant-Konfiguration fehlt.');
  portNumber(config.port);
  collectionName(config.collection);
  timeout(config.timeoutMs);
  if (config.url !== `http://127.0.0.1:${config.port}` || typeof config.apiKey !== 'string' || !/^[a-f0-9]{64}$/.test(config.apiKey)) fail('QDRANT_CONFIG', 'Ungültiger Loopback-Endpunkt oder privater API-Schlüssel.');
  for (const [key, value] of Object.entries(EMBEDDING)) if (config[key] !== value) fail('QDRANT_CONFIG', 'Nicht unterstützter Embedding-/Vektorvertrag.');
  if (config.mcpVersion !== MCP_VERSION) fail('QDRANT_CONFIG', 'MCP-Version muss auf 0.8.1 gepinnt sein.');
  return config;
}
export function validateState(config, dir) {
  validateConfig(config);
  if (config.stateVersion !== 1 || config.stateDir !== dir || !/^[a-f0-9]{32}$/.test(config.instanceId) || config.projectName !== projectName(dir, config.instanceId) || config.composeFile !== path.join(dir, 'compose.yaml') || config.envFile !== path.join(dir, 'qdrant.env') || config.image !== IMAGE) fail('QDRANT_STATE', 'Gespeicherter Qdrant-Zustand ist inkompatibel oder wurde verschoben. Nicht automatisch übernehmen.');
  return config;
}
