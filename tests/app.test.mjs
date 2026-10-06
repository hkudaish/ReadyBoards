import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('Arabic edits save locally and cloud backup uses versioned authentication', async () => {
  const dom = new JSDOM(await readFile('src/index.html', 'utf8'), { url: 'https://readyboards.example/', runScripts: 'outside-only' });
  const { window } = dom;
  try {
    window.AbortSignal = AbortSignal;
    const sent = [];
    window.fetch = async (url, options) => {
      sent.push({ url, options });
      return new Response(JSON.stringify({ etag: 'version-1' }));
    };
    window.eval(await readFile('src/cloud.js', 'utf8'));
    window.eval(await readFile('src/app.js', 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.document.getElementById('launch').disabled, false);
    const input = window.document.getElementById('edit-mainTitle');
    input.value = 'تدشين جديد';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(window.document.getElementById('mainTitleText').textContent, input.value);
    assert.equal(JSON.parse(window.localStorage.getItem('wamyLaunchSettings')).mainTitle, input.value);
    const password = window.document.getElementById('cloudPassword');
    password.value = 'test-password';
    password.dispatchEvent(new window.Event('input', { bubbles: true }));
    await window.document.getElementById('cloudUpload').onclick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].options.headers.Authorization, 'Bearer test-password');
    assert.equal(sent[0].options.headers['If-Match'], 'new');
    assert.equal(JSON.parse(sent[0].options.body).settings.mainTitle, input.value);
    assert.equal(sent[0].options.body.includes('test-password'), false);
    assert.equal(window.localStorage.getItem('wamyLaunchSettings').includes('test-password'), false);
    await window.document.getElementById('cloudUpload').onclick();
    assert.equal(sent[1].options.headers['If-Match'], 'version-1');
    // Export packs external scripts, CSS and audio into a standalone document.
    window.fetch = async url => {
      const path = new URL(url).pathname.slice(1);
      return new Response(await readFile(`src/${path}`));
    };
    window.FileReader = class {
      readAsDataURL() { this.result = 'data:audio/mpeg;base64,AA==';this.onload(); }
    };
    const copy = window.document.documentElement.cloneNode(true);
    await window.ReadyBoardsCloud.inlineAssets(copy);
    assert.equal(copy.querySelectorAll('script[src], link[rel="stylesheet"]').length, 0);
    assert.match(copy.querySelector('#applauseAudio').src, /^data:/);
  } finally { window.close(); }
});
