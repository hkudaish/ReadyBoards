import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

const keys = ['pageTitle', 'url', 'eyebrow', 'mainTitle', 'subtitle', 'hijri', 'date', 'hint', 'button', 'launchLabel', 'successTitle', 'successBody'];
export function validSettings(value, partial = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!partial && keys.some(key => typeof value[key] !== 'string')) return false;
  if (Object.keys(value).some(key => !keys.includes(key) && key !== 'logos')) return false;
  for (const key of keys) if (key in value && (typeof value[key] !== 'string' || value[key].length > 2000)) return false;
  if ('url' in value) {
    try { if (!['http:', 'https:'].includes(new URL(value.url).protocol)) return false; }
    catch { return false; }
  }
  if ('logos' in value) {
    if (!Array.isArray(value.logos) || value.logos.length > 6 || JSON.stringify(value.logos).length > 3000000) return false;
    for (const logo of value.logos) {
      if (!logo || typeof logo.src !== 'string' || logo.src.length > 1500000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo.src) || typeof logo.alt !== 'string' || logo.alt.length > 160) return false;
    }
  } else if (!partial) return false;
  return true;
}
export function validArchive(value) {
  return value?.schemaVersion === 2 && validSettings(value.settings) &&
    Array.isArray(value.history) && value.history.length <= 100000 &&
    value.history.every(event => event && typeof event.id === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(event.id) &&
      Number.isSafeInteger(event.revision) && event.revision > 0 &&
      typeof event.time === 'string' && Number.isFinite(Date.parse(event.time)) &&
      typeof event.type === 'string' && event.type.length <= 60 &&
      typeof event.detail === 'string' && event.detail.length <= 2000 && validSettings(event.changes, true));
}
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
export function createHandler({ password, store }) {
  return async request => {
    if (!['GET', 'PUT'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } });
    if (!password) return json({ error: 'Storage is not configured' }, 503);
    const digest = text => createHash('sha256').update(text).digest();
    if (!timingSafeEqual(digest(request.headers.get('authorization') || ''), digest(`Bearer ${password}`))) return json({ error: 'Unauthorized' }, 401);
    try {
      const storage = store();
      if (request.method === 'GET') {
        const entry = await storage.getWithMetadata('board', { type: 'json', consistency: 'strong' });
        return entry ? json({ archive: entry.data, etag: entry.etag }) : json({ error: 'No backup' }, 404);
      }
      const expected = request.headers.get('if-match');
      if (!expected) return json({ error: 'Version is required' }, 428);
      // Stream with a bound instead of trusting Content-Length.
      let size = 0;const chunks = [];
      if (!request.body) return json({ error: 'Missing archive' }, 400);
      for await (const chunk of request.body) {
        size += chunk.byteLength;
        if (size > 4 * 1024 * 1024) return json({ error: 'Backup too large' }, 413);
        chunks.push(Buffer.from(chunk));
      }
      let archive;
      try { archive = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!validArchive(archive)) return json({ error: 'Invalid archive' }, 400);
      const result = await storage.setJSON('board', archive, expected === 'new' ? { onlyIfNew: true } : { onlyIfMatch: expected });
      if (!result.modified) return json({ error: 'Cloud backup changed' }, 409);
      // Return the version of this exact payload; if another client has already written,
      // force a restore instead of granting permission to overwrite its new version.
      const entry = await storage.getWithMetadata('board', { type: 'json', consistency: 'strong' });
      if (!entry || JSON.stringify(entry.data) !== JSON.stringify(archive)) return json({ error: 'Cloud backup changed' }, 409);
      return json({ etag: entry.etag });
    } catch {
      return json({ error: 'Storage unavailable' }, 503);
    }
  };
}
export default async (request, context) => createHandler({
  password: process.env.BOARDS_STORAGE_PASSWORD,
  // Keep previews isolated from the production backup while surviving redeploys.
  store: () => getStore({ name: `readyboards-${context?.deploy?.context || 'dev'}`, consistency: 'strong' })
})(request);
