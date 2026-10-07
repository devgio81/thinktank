export const STATUSES = ['completed', 'blocked', 'failed', 'needs_handoff'];
export const ID = /^[a-z][a-z0-9_-]{0,63}$/;
export const text = value => typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const strings = (value, nonempty = false) => Array.isArray(value) && (!nonempty || value.length > 0) && value.every(text);
export const keys = (value, required, optional = []) => record(value) && required.every(k => Object.hasOwn(value, k)) &&
  Object.keys(value).every(k => required.includes(k) || optional.includes(k));
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort(compare).map(k => [k, canonical(value[k])]));
  return value;
}
export const issue = (code, path, message) => ({ code, path, message });
export function invalid(code, errors) {
  const error = new Error(`${code}: ${errors.map(e => `${e.path}: ${e.message}`).join('; ')}`);
  error.code = code; error.errors = errors; return error;
}
const array = () => ({ type: 'array', items: { type: 'string', minLength: 1 } });
const schema = {
  type: 'object', additionalProperties: false,
  required: ['task_id', 'status', 'summary', 'evidence', 'commands_run', 'touched_paths', 'unresolved', 'handoff'],
  properties: {
    task_id: { type: 'string', pattern: ID.source },
    status: { type: 'string', enum: STATUSES }, summary: { type: 'string', minLength: 1 },
    evidence: array(), commands_run: array(), touched_paths: array(), unresolved: array(), handoff: array(),
    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'claim', 'evidence'], properties: {
        id: { type: 'string', pattern: ID.source }, claim: { type: 'string', minLength: 1 }, evidence: array(),
      } } },
  },
};
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const WORKER_OUTPUT_SCHEMA = freeze(schema);
export const validOutputSchema = value => record(value) && stable(value) === stable(WORKER_OUTPUT_SCHEMA);
