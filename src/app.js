const stage=document.getElementById('stage'),launch=document.getElementById('launch'),countdown=document.getElementById('countdown'),count=document.getElementById('count'),success=document.getElementById('success'),settings=document.getElementById('settings');
    const form=document.getElementById('settingsForm'),status=document.getElementById('saveStatus'),siteUrl=document.getElementById('edit-url');
    const targets={eyebrow:'eyebrowText',mainTitle:'mainTitleText',subtitle:'subtitleText',hijri:'hijriDateText',date:'dateText',hint:'hintText',button:'buttonText',launchLabel:'launchLabelText',successTitle:'successTitleText',successBody:'successBodyText'};
    const originalLogo=JSON.parse(document.getElementById('originalLogo').textContent);
    const defaults={pageTitle:document.title,url:'https://wamy.org'};
    for(const [key,id] of Object.entries(targets)) defaults[key]=document.getElementById(id).textContent;
    const textKeys=Object.keys(defaults);defaults.logos=[originalLogo];
    const storageKey='wamyLaunchSettings';
    function sanitize(data){
      if(!data||typeof data!=='object'||Array.isArray(data)) throw new Error('Invalid settings');
      const result={};for(const key of textKeys) if(typeof data[key]==='string') result[key]=data[key].slice(0,2000);
      if('url' in result){const url=new URL(result.url);if(!['https:','http:'].includes(url.protocol))throw new Error('Invalid URL');}
      if('logos' in data){
        if(!Array.isArray(data.logos)||data.logos.length>6)throw new Error('Invalid logos');
        result.logos=data.logos.map(logo=>{if(!logo||typeof logo.src!=='string'||logo.src.length>1500000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo.src))throw new Error('Invalid logo');return {src:logo.src,alt:typeof logo.alt==='string'?logo.alt.slice(0,160):'شعار'};});
        if(JSON.stringify(result.logos).length>3000000)throw new Error('Logo data too large');
      }
      return result;
    }
    function notice(message,error=false){status.textContent=message;status.dataset.error=String(error);}
    let current={...defaults},storageProblem='';
    try{Object.assign(current,sanitize(JSON.parse(document.getElementById('embeddedSettings').textContent)));}catch(e){storageProblem='تعذّر قراءة البيانات المضمّنة.';}
    // Exported HTML uses its embedded settings until it has its own browser save.
    const embeddedStamp=document.getElementById('embeddedSettings').dataset.exportedAt||'';
    try{const raw=localStorage.getItem(storageKey);if(raw){const saved=JSON.parse(raw);if(!embeddedStamp||saved._exportedAt===embeddedStamp)Object.assign(current,sanitize(saved));}}catch(e){storageProblem='تعذّر قراءة الحفظ السابق. يمكنك استيراد نسخة احتياطية.';}
    function apply(){document.title=current.pageTitle;for(const [key,id]of Object.entries(targets))document.getElementById(id).textContent=current[key];renderLogos();}
    function populate(){for(const key of textKeys)document.getElementById('edit-'+key).value=current[key];}
    let database=null,events=[],revision=0,writeQueue=Promise.resolve(),dataFileHandle=null,lastSavedSettings=null,ready=false;
    const databaseStatus=document.getElementById('databaseStatus'),scope='launch:'+ (embeddedStamp||location.pathname);
    const clone=value=>JSON.parse(JSON.stringify(value));
    const eventNames={initial:'بدء حفظ البيانات',edit:'تعديل المحتوى',save:'حفظ التعديلات',import:'استيراد البيانات',restore:'استعادة محتوى سابق',launch_click:'بدء التدشين',launch_complete:'اكتمال التدشين',site_open:'فتح الموقع',audio_error:'تعذّر تشغيل التصفيق'};
    function openDatabase(){return new Promise((resolve,reject)=>{
      const request=indexedDB.open('WamyLaunchData',1);let expired=false;const timer=setTimeout(()=>{expired=true;reject(new Error('Database open timeout'));},5000);
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('settings',{keyPath:'scope'});const history=db.createObjectStore('events',{keyPath:'id'});history.createIndex('scope','scope');};
      request.onsuccess=()=>{clearTimeout(timer);if(expired){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{databaseStatus.textContent='أغلق النسخ الأخرى من اللوحة ثم أعد فتحها لإكمال الحفظ.';};
    });}
    function readDatabase(){return new Promise((resolve,reject)=>{
      const tx=database.transaction(['settings','events'],'readonly'),state=tx.objectStore('settings').get(scope),history=tx.objectStore('events').index('scope').getAll(scope);
      tx.oncomplete=()=>resolve({state:state.result,events:history.result.sort((a,b)=>a.revision-b.revision)});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}
    function writeDatabase(snapshot,event){return new Promise((resolve,reject)=>{
      const tx=database.transaction(['settings','events'],'readwrite');tx.objectStore('settings').put({scope,settings:snapshot,revision:event.revision});tx.objectStore('events').put({...event,scope});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}
    function archive(){return {schemaVersion:2,exportedAt:new Date().toISOString(),settings:current,history:events};}
    async function writeDataFile(){if(!dataFileHandle)return;const stream=await dataFileHandle.createWritable();await stream.write(JSON.stringify(archive(),null,2));await stream.close();document.getElementById('dataFileStatus').textContent='تم تحديث ملف البيانات المستقل: '+dataFileHandle.name;}
    function persist(type='edit',detail=''){
      if(!ready)return false;
      const snapshot=clone(current),changes={};for(const key of Object.keys(defaults))if(!lastSavedSettings||JSON.stringify(snapshot[key])!==JSON.stringify(lastSavedSettings[key]))changes[key]=snapshot[key];
      if(type==='edit'&&!Object.keys(changes).length)return true;
      const event={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),revision:++revision,time:new Date().toISOString(),type,detail:String(detail).slice(0,2000),changes};events.push(event);lastSavedSettings=snapshot;
      // Fast recovery copy; the database transaction stores settings and history together.
      let fallbackSaved=false;try{localStorage.setItem(storageKey,JSON.stringify({...snapshot,_exportedAt:embeddedStamp}));localStorage.setItem(storageKey+':archive:'+scope,JSON.stringify(archive()));fallbackSaved=true;}catch(e){}
      notice('جارٍ حفظ البيانات والسجل…');renderHistory();
      writeQueue=writeQueue.then(async()=>{
        let saved=false;try{if(database){await writeDatabase(snapshot,event);saved=true;databaseStatus.textContent='قاعدة البيانات متصلة — '+events.length+' حدث محفوظ.';}}catch(e){databaseStatus.textContent='تعذّر الكتابة في قاعدة البيانات. احتفظ بنسخة احتياطية.';}
        let fileSaved=false;if(dataFileHandle){try{await writeDataFile();fileSaved=true;}catch(e){document.getElementById('dataFileStatus').textContent='تعذّر تحديث ملف البيانات. أعد ربطه أو صدّر نسخة احتياطية.';}}
        if(saved||fallbackSaved||fileSaved){storageProblem='';notice(saved?'تم حفظ البيانات وسجل الأحداث في قاعدة البيانات.':'تم حفظ نسخة احتياطية؛ قاعدة البيانات غير متاحة.',!saved);}
        else{storageProblem='تعذّر الحفظ الدائم. البيانات الحالية في الذاكرة فقط: صدّر نسخة احتياطية الآن.';notice(storageProblem,true);}
      });return true;
    }
    function validateHistory(items,renewIds=false){
      if(!Array.isArray(items)||items.length>100000)throw new Error('Invalid history');
      return items.map((event,index)=>{if(!event||!Number.isFinite(Date.parse(event.time))||typeof event.type!=='string')throw new Error('Invalid event');return {id:!renewIds&&typeof event.id==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(event.id)?event.id:Date.now().toString(36)+'-import-'+index+'-'+Math.random().toString(36).slice(2),revision:Number.isSafeInteger(event.revision)&&event.revision>0?event.revision:index+1,time:event.time,type:event.type.slice(0,60),detail:typeof event.detail==='string'?event.detail.slice(0,2000):'',changes:sanitize(event.changes||{})};});
    }
    function renderHistory(){
      const list=document.getElementById('historyList');if(list.hidden)return;list.replaceChildren();
      const count=document.createElement('p');count.textContent='إجمالي الأحداث: '+events.length+' — عرض آخر 100 حدث. التصدير يتضمن السجل كاملًا.';list.append(count);
      for(const event of events.slice(-100).reverse()){
        const row=document.createElement('div');row.className='history-row';const label=document.createElement('div');label.textContent=new Date(event.time).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})+' — '+(eventNames[event.type]||event.type)+(event.detail?' — '+event.detail:'');row.append(label);
        if(Object.keys(event.changes).length){const restore=document.createElement('button');restore.type='button';restore.textContent='استعادة المحتوى عند هذا الحدث';restore.onclick=()=>{let restored=clone(defaults);for(const item of events){Object.assign(restored,item.changes);if(item.id===event.id)break;}current={...defaults,...sanitize(restored)};apply();populate();persist('restore',event.time);};row.append(restore);}list.append(row);
      }
    }
    document.getElementById('showHistory').onclick=()=>{const list=document.getElementById('historyList');list.hidden=!list.hidden;renderHistory();};
    document.getElementById('connectDataFile').onclick=async()=>{
      if(!window.showSaveFilePicker){document.getElementById('dataFileStatus').textContent='ربط ملف للحفظ التلقائي غير مدعوم في هذا المتصفح. استخدم تصدير البيانات لحفظ نسخة كاملة.';return;}
      try{const handle=await window.showSaveFilePicker({suggestedName:'launch-data-history.json',types:[{description:'بيانات اللوحة والسجل',accept:{'application/json':['.json']}}]});await writeQueue;dataFileHandle=handle;await writeDataFile();}catch(e){if(e.name!=='AbortError')document.getElementById('dataFileStatus').textContent='تعذّر ربط ملف البيانات. استخدم تصدير البيانات.';}
    };
    // Prevent edits while the saved database is being restored.
    document.getElementById('settingsBtn').disabled=true;launch.disabled=true;
    async function initializeStorage(){
      try{events=validateHistory(JSON.parse(document.getElementById('embeddedHistory').textContent));revision=events.length;}catch(e){events=[];}
      try{database=await openDatabase();const saved=await readDatabase();if(saved.state){current={...defaults,...sanitize(saved.state.settings)};events=saved.events;revision=saved.state.revision;}
        databaseStatus.textContent='قاعدة البيانات متصلة — '+events.length+' حدث محفوظ.';
      }catch(e){database=null;databaseStatus.textContent='قاعدة البيانات غير متاحة. يتم استخدام الحفظ الاحتياطي في المتصفح.';}
      // Recover newer emergency saves if a previous database write failed.
      try{const raw=localStorage.getItem(storageKey+':archive:'+scope);if(raw){const fallback=JSON.parse(raw),history=validateHistory(fallback.history),newest=history.reduce((max,event)=>Math.max(max,event.revision),0);if(newest>revision||history.length>events.length){current={...defaults,...sanitize(fallback.settings)};events=history;revision=newest;}}}catch(e){}
      ready=true;apply();populate();lastSavedSettings=events.length?clone(current):null;
      // Migrate embedded/imported history into the database without dropping events.
      if(database&&events.length){try{await new Promise((resolve,reject)=>{const tx=database.transaction(['settings','events'],'readwrite');tx.objectStore('settings').put({scope,settings:clone(current),revision});for(const event of events)tx.objectStore('events').put({...event,scope});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}catch(e){notice('تعذّر نقل السجل إلى قاعدة البيانات. صدّر نسخة احتياطية.',true);}}
      if(!events.length)persist('initial');
      if(navigator.storage&&navigator.storage.persist){try{const granted=await navigator.storage.persist();databaseStatus.textContent+=granted?' — تخزين دائم مفعّل.':' — احتفظ بنسخة خارجية تحسبًا لمسح بيانات المتصفح.';}catch(e){}}
      document.getElementById('settingsBtn').disabled=false;launch.disabled=false;
    }
    function commit(eventType='edit'){
      const data=Object.fromEntries(textKeys.map(key=>[key,document.getElementById('edit-'+key).value]));
      try{current={...defaults,...sanitize({...data,logos:current.logos})};siteUrl.setCustomValidity('');apply();persist(eventType);return true;}catch(e){siteUrl.setCustomValidity('أدخل رابطًا صحيحًا يبدأ بـ https:// أو http://');notice('لم تُحفظ التعديلات: يرجى تصحيح رابط الموقع.',true);return false;}
    }
    function renderLogos(){
      const brand=document.getElementById('brandLogos'),list=document.getElementById('logoList');brand.replaceChildren();list.replaceChildren();brand.classList.toggle('multiple',current.logos.length>1);
      current.logos.forEach((logo,index)=>{
        const image=document.createElement('img');image.className='brand-logo';image.src=logo.src;image.alt=logo.alt;brand.append(image);
        const row=document.createElement('div');row.className='logo-row';const preview=image.cloneNode(),name=document.createElement('span'),remove=document.createElement('button');name.textContent=logo.alt||('شعار '+(index+1));remove.type='button';remove.textContent='إزالة';remove.setAttribute('aria-label','إزالة '+name.textContent);remove.onclick=()=>{current={...current,logos:current.logos.filter((_,i)=>i!==index)};renderLogos();persist();};row.append(preview,name,remove);list.append(row);
      });
    }
    async function readLogo(file){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Invalid image');
      const url=URL.createObjectURL(file);
      try{
        const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('Empty image');
        const scale=Math.min(1,900/image.naturalWidth,450/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        const src=canvas.toDataURL('image/webp',.92);return {src,alt:file.name.replace(/\.[^.]+$/,'').slice(0,160)};
      }finally{URL.revokeObjectURL(url);}
    }
    let uploading=false;
    async function uploadLogos(replace){
      if(uploading)return;const input=document.getElementById('logoFiles'),files=Array.from(input.files||[]);if(!files.length){notice('اختر صورة شعار أولًا.',true);return;}
      if(files.length+(replace?0:current.logos.length)>6){notice('الحد الأقصى 6 شعارات. أزل بعض الشعارات أو اختر الاستبدال.',true);return;}
      uploading=true;const buttons=['addLogos','replaceLogos','restoreLogo'].map(id=>document.getElementById(id));buttons.forEach(button=>button.disabled=true);notice('جارٍ تجهيز الشعارات…');
      try{const logos=[];for(const file of files)logos.push(await readLogo(file));const validated=sanitize({logos:replace?logos:[...current.logos,...logos]});current={...current,...validated};renderLogos();persist();input.value='';}
      catch(e){notice('تعذّر إضافة الشعارات. اختر صور PNG أو JPEG أو WebP سليمة بالحجم المسموح.',true);}
      finally{uploading=false;buttons.forEach(button=>button.disabled=false);}
    }
    document.getElementById('addLogos').onclick=()=>uploadLogos(false);
    document.getElementById('replaceLogos').onclick=()=>uploadLogos(true);
    document.getElementById('restoreLogo').onclick=()=>{current={...current,logos:[originalLogo]};renderLogos();persist();};
    apply();populate();
    document.getElementById('settingsBtn').onclick=()=>{populate();notice(storageProblem||'التعديلات تُحفظ تلقائيًا أثناء الكتابة.',Boolean(storageProblem));settings.showModal();};
    form.addEventListener('input',event=>{if(['importFile','logoFiles','cloudPassword'].includes(event.target.id))return;siteUrl.setCustomValidity('');commit();});
    form.addEventListener('submit',async event=>{event.preventDefault();if(commit('save')){await writeQueue;if(!storageProblem)notice('تم حفظ التعديلات بنجاح');siteUrl.reportValidity();}});
    document.getElementById('closeEditor').onclick=async()=>{if(commit()){await writeQueue;settings.close();}else siteUrl.reportValidity();};
    settings.addEventListener('cancel',event=>{if(!commit()){event.preventDefault();siteUrl.reportValidity();}});
    function download(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
    document.getElementById('exportData').onclick=async()=>{if(commit()){await writeQueue;download('launch-data-history.json',JSON.stringify(archive(),null,2),'application/json');}};
    document.getElementById('downloadHtml').onclick=async()=>{
      if(!commit())return;await writeQueue;
      const copy=document.documentElement.cloneNode(true),embedded=copy.querySelector('#embeddedSettings');
      embedded.textContent=JSON.stringify(current).replace(/</g,'\\u003c');embedded.dataset.exportedAt=String(Date.now());
      copy.querySelector('#embeddedHistory').textContent=JSON.stringify(events).replace(/</g,'\\u003c');
      copy.querySelector('#historyList').replaceChildren();copy.querySelector('#historyList').hidden=true;
      copy.querySelector('#settingsBtn').disabled=false;copy.querySelector('#launch').disabled=false;
      copy.querySelector('#settings').removeAttribute('open');
      copy.querySelector('#cloudPassword').value='';copy.querySelector('#cloudPassword').removeAttribute('value');
      try{await ReadyBoardsCloud.inlineAssets(copy);}catch(error){notice('تعذّر تجهيز النسخة المستقلة. حاول مرة أخرى.',true);return;}copy.querySelector('#saveStatus').textContent='';
      download('تشغيل_لوحة_التدشين.html','<!doctype html>\n'+copy.outerHTML,'text/html;charset=utf-8');
      notice('تم طلب تنزيل نسخة HTML تتضمن التعديلات الحالية.');
    };
    document.getElementById('importData').onclick=()=>document.getElementById('importFile').click();
    document.getElementById('importFile').addEventListener('change',async event=>{
      const input=event.currentTarget||event.target,file=input.files[0];if(!file)return;
      try{if(file.size>100*1024*1024)throw new Error('Too large');const parsed=JSON.parse(await file.text());const data=sanitize(parsed.settings||parsed);if(!Object.keys(data).length)throw new Error('Empty');const imported=parsed.history?validateHistory(parsed.history,true):[];await writeQueue;
        // Append imported events; retain all existing history.
        if(database&&imported.length){await new Promise((resolve,reject)=>{const tx=database.transaction('events','readwrite');for(const event of imported){event.revision=++revision;tx.objectStore('events').put({...event,scope});}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}else for(const event of imported)event.revision=++revision;
        events.push(...imported);current={...defaults,...data};populate();siteUrl.setCustomValidity('');apply();lastSavedSettings=null;persist('import',file.name);await writeQueue;}catch(e){notice('تعذّر استيراد الملف. اختر نسخة JSON صالحة من بيانات اللوحة.',true);}finally{input.value='';}
    });
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const applause=document.getElementById('applauseAudio');
    function prepareApplause(){
      const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return Promise.resolve(null);
      try{
        const ctx=new AudioCtx(),resumed=ctx.resume();
        const decoded=fetch(applause.src).then(response=>response.arrayBuffer()).then(bytes=>ctx.decodeAudioData(bytes));
        return Promise.all([resumed,decoded]).then(([,buffer])=>({ctx,buffer})).catch(()=>{ctx.close().catch(()=>{});return null;});
      }catch(e){return Promise.resolve(null);}
    }
    async function startApplause(prepared=null){
      const audio=await prepared;
      if(audio&&audio.ctx.state==='running'){
        const source=audio.ctx.createBufferSource(),gain=audio.ctx.createGain();source.buffer=audio.buffer;gain.gain.value=.9;source.connect(gain).connect(audio.ctx.destination);source.onended=()=>audio.ctx.close().catch(()=>{});source.start();return audio.buffer.duration;
      }
      applause.pause();applause.currentTime=0;applause.volume=.9;
      try{await applause.play();return Number.isFinite(applause.duration)?applause.duration:7.252;}catch(e){notice('تعذّر تشغيل الصوت. جرّب تشغيله من الإعدادات.',true);persist('audio_error');return 0;}
    }
    document.getElementById('testApplause').onclick=()=>startApplause(prepareApplause());
    function transitionFinished(element,property){
      const style=getComputedStyle(element),seconds=value=>value.trim().endsWith('ms')?parseFloat(value)/1000:parseFloat(value);
      const durations=style.transitionDuration.split(',').map(seconds),delays=style.transitionDelay.split(',').map(seconds);
      const duration=Math.max(...durations.map((value,index)=>value+(delays[index%delays.length]||0)));
      if(!duration)return Promise.resolve();
      return new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);element.removeEventListener('transitionend',onEnd);resolve();};const onEnd=event=>{if(event.target===element&&event.propertyName===property)finish();};element.addEventListener('transitionend',onEnd);timer=setTimeout(finish,duration*1000+80);});
    }
    document.getElementById('downloadApplause').onclick=()=>{const a=document.createElement('a');a.href=applause.src;a.download='applause-CC0.mp3';document.body.append(a);a.click();a.remove();};
    launch.onclick=async()=>{
      if(!ready)return;launch.disabled=true;
      // Unlock the audio context within the click gesture, without playing sound.
      const preparedApplause=prepareApplause();persist('launch_click',current.url);document.getElementById('settingsBtn').style.display='none';
      stage.classList.add('closing');await wait(1150);countdown.classList.add('show');
      for(const n of [3,2,1]){count.textContent=n;count.style.animation='none';void count.offsetWidth;count.style.animation='pop .72s ease both';await wait(850);}
      countdown.classList.remove('show');stage.classList.remove('closing');stage.classList.add('opened');
      await Promise.all(Array.from(document.querySelectorAll('.curtain')).map(curtain=>transitionFinished(curtain,'transform')));
      success.classList.add('show');await transitionFinished(success,'opacity');
      const applauseDuration=await startApplause(preparedApplause);persist('launch_complete');await wait(Math.max(3200,applauseDuration*1000+150));
      persist('site_open',current.url);await writeQueue;window.location.assign(current.url);
    };
    window.addEventListener('beforeunload',event=>{if(status.textContent==='جارٍ حفظ البيانات والسجل…'){event.preventDefault();event.returnValue='';}});
    ReadyBoardsCloud.bind({
      ready:()=>ready,
      snapshot:async()=>{if(!commit())throw new Error('صحّح رابط الموقع أولًا.');await writeQueue;return clone(archive());},
      restore:async archiveData=>{
        const restored=sanitize(archiveData.settings),history=validateHistory(archiveData.history,true);
        await writeQueue;
        for(const event of history){event.revision=++revision;events.push(event);}
        current={...defaults,...restored};apply();populate();lastSavedSettings=null;
        // Reusing the import path preserves local events and writes imported events to IndexedDB.
        if(database&&history.length)await new Promise((resolve,reject)=>{
          const tx=database.transaction('events','readwrite');for(const event of history)tx.objectStore('events').put({...event,scope});
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
        });
        persist('import','Netlify');await writeQueue;
      }
    });
    initializeStorage();
  
