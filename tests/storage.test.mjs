import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, validArchive } from '../netlify/functions/boards.mjs';
const settings = Object.fromEntries(['pageTitle', 'url', 'eyebrow', 'mainTitle', 'subtitle', 'hijri', 'date', 'hint', 'button', 'launchLabel', 'successTitle', 'successBody'].map(key => [key, key === 'url' ? 'https://example.org' : 'عنوان']));
settings.logos = [];
const archive = { schemaVersion: 2, settings, history: [] };
function fixture() {
  let entry, version = 0;
  const store = {
    getWithMetadata: async () => entry,
    setJSON: async (key, data, options) => {
      if ((options.onlyIfNew && entry) || (options.onlyIfMatch && options.onlyIfMatch !== entry?.etag)) return { modified: false };
      entry = { data, etag: `v${++version}` };return { modified: true };
    }
  };
  return createHandler({ password: 'secret', store: () => store });
}
function request(method, data, version = 'new', password = 'secret') {
  return new Request('https://example.org/.netlify/functions/boards', {
    method, headers: { Authorization: `Bearer ${password}`, 'If-Match': version },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
}
test('authentication and missing configuration fail closed', async () => {
  assert.equal((await fixture()(request('GET', undefined, 'new', 'wrong'))).status, 401);
  assert.equal((await createHandler({ store: () => { throw Error(); } })(request('GET'))).status, 503);
});
test('backup survives reads; stale clients cannot overwrite it', async () => {
  const handler = fixture();
  assert.equal((await handler(request('GET'))).status, 404);
  const saved = await (await handler(request('PUT', archive))).json();
  assert.deepEqual((await (await handler(request('GET'))).json()).archive, archive);
  assert.equal((await handler(request('PUT', archive))).status, 409);
  assert.equal((await handler(request('PUT', archive, saved.etag))).status, 200);
  assert.equal((await handler(request('PUT', archive, saved.etag))).status, 409);
});
test('rejects malformed data, unsafe links, and oversized backups', async () => {
  assert.equal(validArchive(archive), true);
  assert.equal(validArchive({ ...archive, settings: { ...settings, url: 'javascript:alert(1)' } }), false);
  assert.equal((await fixture()(request('PUT', { ...archive, history: [{}] }))).status, 400);
  assert.equal((await fixture()(request('PUT', { text: 'x'.repeat(4 * 1024 * 1024) }))).status, 413);
});
