import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fail, validateConfig, timeout } from './config.mjs';

export async function request(config, method, endpoint, body, { fetch = globalThis.fetch, timeoutMs = config.timeoutMs, allow = [] } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      try { fail('QDRANT_TIMEOUT', 'Qdrant-REST-Frist überschritten; Dienst/Port prüfen oder timeoutMs erhöhen.'); } catch (e) { reject(e); }
    }, timeout(timeoutMs));
  });
  const operation = async () => {
    let response, text;
    try {
      response = await fetch(`${config.url}${endpoint}`, { method, redirect: 'error', signal: controller.signal,
        headers: { 'api-key': config.apiKey, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // Error bodies may contain credentials; never expose them or JSON parser errors.
      if ([401, 403].includes(response.status)) fail('QDRANT_AUTH', 'Qdrant lehnt den privaten API-Schlüssel ab; gespeicherten Zustand prüfen, nicht automatisch rotieren.');
      if (response.status !== 200 && !allow.includes(response.status)) fail('QDRANT_HTTP', `Qdrant antwortet mit HTTP ${Number(response.status)}.`, { status: Number(response.status) });
      text = await response.text();
    } catch (e) {
      if (e.name === 'QdrantError') throw e;
      fail('QDRANT_NETWORK', 'Qdrant ist nicht erreichbar oder verweist auf einen anderen Endpunkt; URL/Port prüfen.');
    }
    let data;
    if (endpoint !== '/readyz' && response.status === 200) {
      try { data = JSON.parse(text); } catch { fail('QDRANT_RESPONSE', 'Qdrant lieferte ungültiges JSON.'); }
    }
    return { status: response.status, data };
  };
  try { return await Promise.race([operation(), deadline]); } finally { clearTimeout(timer); }
}
export async function readiness(config, deps = {}) {
  const deadline = Date.now() + timeout(config.timeoutMs);
  while (true) {
    try { await request(config, 'GET', '/readyz', undefined, { ...deps, timeoutMs: Math.max(1, deadline - Date.now()) }); return; }
    catch (e) {
      if (!['QDRANT_NETWORK', 'QDRANT_TIMEOUT', 'QDRANT_HTTP'].includes(e.code) || (e.code === 'QDRANT_HTTP' && e.status < 500)) throw e;
      if (Date.now() >= deadline) fail('QDRANT_TIMEOUT', 'Qdrant wurde nicht rechtzeitig bereit; Docker-Status und Loopback-Port prüfen.');
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
    }
  }
}
export function assertSchema(data, config) {
  const vector = data?.result?.config?.params?.vectors?.[config.vectorName];
  if (vector?.size !== config.dimension || vector?.distance !== config.distance || vector?.multivector_config) fail('QDRANT_SCHEMA', 'Inkompatibles Vektorschema. Erwartet fast-all-minilm-l6-v2, 384, Cosine (Einzelvektor). Bestehende Daten bleiben unverändert; separate Collection/Migration wählen.');
}
const collectionPath = c => `/collections/${encodeURIComponent(c.collection)}`;
export async function ensureCollection(config, deps) {
  const endpoint = collectionPath(config);
  let response = await request(config, 'GET', endpoint, undefined, { ...deps, allow: [404] });
  if (response.status === 404) {
    await request(config, 'PUT', endpoint, { vectors: { [config.vectorName]: { size: config.dimension, distance: config.distance } } }, { ...deps, allow: [409] });
    response = await request(config, 'GET', endpoint, undefined, deps);
  }
  assertSchema(response.data, config);
}
export async function doctorQdrant(config, deps = {}) {
  validateConfig(config);
  await request(config, 'GET', '/readyz', undefined, deps);
  const result = await request(config, 'GET', collectionPath(config), undefined, deps);
  assertSchema(result.data, config);
  return { ok: true, url: config.url, collection: config.collection, embeddingModel: config.embeddingModel,
    vectorName: config.vectorName, dimension: config.dimension, distance: config.distance,
    embeddingsVerified: false };
}
// Synthetic storage/query test only. It does NOT prove real text embeddings work.
export async function smokeQdrant(config, deps = {}) {
  validateConfig(config);
  const id = randomUUID(), marker = randomUUID(), endpoint = `${collectionPath(config)}/points`;
  const vector = Array.from({ length: config.dimension }, (_, index) => index === 0 ? 1 : 0);
  const existing = await request(config, 'GET', `${endpoint}/${id}`, undefined, { ...deps, allow: [404] });
  if (existing.status !== 404) fail('QDRANT_SMOKE', 'Testpunkt-ID existiert bereits; keine Überschreibung.');
  let primaryError;
  try {
    await request(config, 'PUT', `${endpoint}?wait=true`, { points: [{ id, vector: { [config.vectorName]: vector }, payload: { thinktank_smoke: marker } }] }, deps);
    const result = await request(config, 'GET', `${endpoint}/${id}`, undefined, deps);
    const point = result.data?.result;
    if (point?.id !== id || point?.payload?.thinktank_smoke !== marker || point?.vector?.[config.vectorName]?.length !== config.dimension) fail('QDRANT_SMOKE', 'Geschriebener Testpunkt wurde nicht korrekt zurückgelesen.');
    const query = await request(config, 'POST', `${endpoint}/query`, { query: vector, using: config.vectorName,
      filter: { must: [{ has_id: [id] }] }, with_payload: true, limit: 1 }, deps);
    if (!query.data?.result?.points?.some(p => p.id === id && p.payload?.thinktank_smoke === marker)) fail('QDRANT_SMOKE', 'Vektorabfrage liefert den eigenen Testpunkt nicht.');
  } catch (e) { primaryError = e; }
  // Cleanup is identity-scoped, including after an uncertain write timeout.
  try {
    const found = await request(config, 'GET', `${endpoint}/${id}`, undefined, { ...deps, allow: [404] });
    if (found.status === 200) {
      if (found.data?.result?.payload?.thinktank_smoke !== marker) fail('QDRANT_SMOKE_CLEANUP', 'Testpunkt-Markierung weicht ab; nichts gelöscht.');
      await request(config, 'POST', `${endpoint}/delete?wait=true`, { points: [id] }, deps);
      const gone = await request(config, 'GET', `${endpoint}/${id}`, undefined, { ...deps, allow: [404] });
      if (gone.status !== 404) fail('QDRANT_SMOKE_CLEANUP', 'Testpunkt-Löschung wurde nicht bestätigt.');
    }
  } catch { fail('QDRANT_SMOKE_CLEANUP', 'Eigener Smoke-Testpunkt konnte nicht sicher entfernt werden; keine fremden Punkte gelöscht.', { pointId: id }); }
  if (primaryError) throw primaryError;
  return { ok: true, synthetic: true, embeddingsVerified: false };
}
