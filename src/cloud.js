/* Explicit backups keep offline edits from silently replacing a shared board. */
window.ReadyBoardsCloud = (() => {
  const endpoint = '/.netlify/functions/boards';
  let etag;
  async function request(method, password, data) {
    if (!password) throw new Error('أدخل كلمة مرور التخزين.');
    const headers = { Authorization: `Bearer ${password}` };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['If-Match'] = etag || 'new';
    }
    const response = await fetch(endpoint, {
      method, headers, body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(20000), cache: 'no-store'
    });
    if (!response.ok) {
      const messages = {
        401: 'كلمة المرور غير صحيحة.',
        404: 'لا توجد نسخة سحابية أو خدمة التخزين غير متاحة.',
        409: 'تغيّرت النسخة السحابية. صدّر بياناتك المحلية ثم استعد النسخة السحابية قبل الحفظ.',
        413: 'النسخة أكبر من حد التخزين السحابي (٤ ميغابايت). استخدم تصدير البيانات.',
        503: 'التخزين السحابي غير مهيّأ. اضبط كلمة مرور التخزين في Netlify.'
      };
      throw new Error(messages[response.status] || 'تعذّر الاتصال بالسحابة. البيانات المحلية محفوظة.');
    }
    const result = await response.json();
    return result;
  }
  function bind({ ready, snapshot, restore }) {
    const status = document.getElementById('cloudStatus');
    const password = document.getElementById('cloudPassword');
    const upload = document.getElementById('cloudUpload');
    const download = document.getElementById('cloudDownload');
    async function run(task) {
      if (!ready()) return;
      upload.disabled = download.disabled = true;
      status.textContent = 'جارٍ الاتصال بالسحابة…';
      try { await task(); }
      catch (error) { status.textContent = error.message; }
      finally { upload.disabled = download.disabled = false; }
    }
    password.addEventListener('input', () => { etag = undefined; });
    upload.onclick = () => run(async () => {
      const result = await request('PUT', password.value, await snapshot());
      etag = result.etag;
      status.textContent = 'تم حفظ البيانات والسجل في السحابة.';
    });
    download.onclick = () => run(async () => {
      if (!confirm('استعادة محتوى السحابة؟ سيبقى سجل التعديلات المحلي محفوظًا.')) return;
      const result = await request('GET', password.value);
      await restore(result.archive);
      etag = result.etag;
      status.textContent = 'تم استعادة البيانات من السحابة.';
    });
  }
  async function inlineAssets(copy) {
    async function read(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Asset unavailable');
      return response;
    }
    for (const link of copy.querySelectorAll('link[rel="stylesheet"]')) {
      const style = document.createElement('style');
      style.textContent = await (await read(link.href)).text();
      link.replaceWith(style);
    }
    for (const script of copy.querySelectorAll('script[src]')) {
      script.textContent = await (await read(script.src)).text();
      script.removeAttribute('src');
    }
    const audio = copy.querySelector('#applauseAudio');
    if (!audio.src.startsWith('data:')) {
      const blob = await (await read(audio.src)).blob();
      audio.src = await new Promise((resolve, reject) => {
        const reader = new FileReader();reader.onload = () => resolve(reader.result);
        reader.onerror = reject;reader.readAsDataURL(blob);
      });
    }
  }
  return { bind, inlineAssets };
})();
