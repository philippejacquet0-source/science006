/* Rémanence — manual JSON-response capture in an already open REMAP session. */
(() => {
  'use strict';
  if (location.hostname !== 'remap.jrc.ec.europa.eu') {
    alert('Ouvrez la carte sur remap.jrc.ec.europa.eu avant de lancer cet outil.');
    return;
  }
  if (/\/Consent\//i.test(location.pathname)) {
    alert('Passez d’abord vous-même le CAPTCHA et les étapes d’accès à la carte REMAP.');
    return;
  }
  if (window.__remanenceCapture) { window.__remanenceCapture.show(); return; }
  const captures = [], MAX_BYTES = 20 * 1024 * 1024;
  const clientScripts=[...document.scripts].filter(s=>s.src).map(s=>{try{const u=new URL(s.src,location.href);return u.origin+u.pathname;}catch{return null;}}).filter(Boolean);
  const client={scripts:[...new Set(clientScripts)],jquery:window.jQuery?.fn?.jquery || null,dygraph:typeof window.Dygraph==='function',highcharts:!!window.Highcharts};
  let bytes = 0, enabled = true, skipped = 0;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = '<style>:host{font:13px system-ui;color:#24424b}section{width:310px;background:#fff;border:1px solid #bed2c8;border-radius:10px;padding:19px;box-shadow:0 7px 35px #153a4533}h2{font-size:18px;margin:0 0 10px}p{font-size:11px;line-height:1.7;color:#667c7d}button{font:11px system-ui;cursor:pointer;background:#193f48;color:white;border:0;border-radius:5px;padding:9px 12px;margin:5px 6px 0 0}button:disabled{opacity:.4;cursor:default}#stop{background:#edf2eb;color:#28494c}strong{font-size:12px;color:#2e7678}</style><section><h2>Rémanence · capture v2</h2><p>Sélectionnez une balise et ouvrez sa courbe. Choisissez la période voulue, puis ajoutez les balises voisines à la sélection REMAP. Les séries ne sont reçues qu’à ces actions.</p><strong id="status">0 réponse JSON capturée</strong><p>Capture des réponses réseau et, si disponible, de leur état après traitement par le client REMAP. Les réponses brutes peuvent être encodées. Aucun cookie, valeur d’en-tête ou corps de requête n’est exporté.</p><button id="download" disabled>Télécharger le JSON</button><button id="stop">Arrêter et fermer</button></section>';
  document.documentElement.append(host);
  const status = root.getElementById('status'), download = root.getElementById('download');
  function sanitize(value, depth = 0) {
    if (depth > 50) return '[profondeur limitée]';
    if (Array.isArray(value)) return value.map(v => sanitize(v, depth + 1));
    if (value && typeof value === 'object') {
      const safe = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (/(?:password|passwd|token|secret|cookie|authorization|sessionid|viewstate|eventvalidation)/i.test(key)) continue;
        safe[key] = sanitize(item, depth + 1);
      }
      return safe;
    }
    return value;
  }
  function receive(raw, url, stage='network', headerNames=[]) {
    if (!enabled || typeof raw !== 'string' || raw.length > 8 * 1024 * 1024) return;
    try {
      const parsedURL = new URL(url, location.href);
      if (parsedURL.origin !== location.origin || /(?:captcha|consent|login|auth|signin)/i.test(parsedURL.pathname)) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const data = sanitize(parsed), size = new Blob([JSON.stringify(data)]).size;
      if (bytes + size > MAX_BYTES || captures.length >= 200) { skipped++;status.textContent=`${captures.length} réponses · limite atteinte (${skipped} ignorées)`;return; }
      captures.push({path:parsedURL.pathname,receivedAt:new Date().toISOString(),stage,headerNames,data});bytes += size;
      const processed=captures.filter(c=>c.stage==='application').length;
      status.textContent=`${captures.length-processed} réponses réseau · ${processed} états client · ${(bytes/1024).toFixed(0)} Ko`;
      download.disabled = false;
    } catch { /* Non-JSON responses are intentionally ignored. */ }
  }
  const originalFetch = window.fetch;
  async function captureFetch(...args) {
    const response = await originalFetch.apply(this,args);
    try {
      const length = Number(response.headers.get('Content-Length'));
      const type = response.headers.get('Content-Type') || '';
      if (enabled && response.ok && length <= 8 * 1024 * 1024 && /json/i.test(type)) {
        const clone=response.clone();
        const reader=clone.body?.getReader();
        if(reader){
          void (async()=>{const chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>8*1024*1024){await reader.cancel();return;}chunks.push(value);}const buffer=new Uint8Array(total);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}receive(new TextDecoder().decode(buffer),response.url,'network',[...response.headers.keys()]);}catch{}})();
        }
      }
    } catch { /* Do not change the application's request outcome. */ }
    return response;
  }
  const prototype=XMLHttpRequest.prototype,originalOpen=prototype.open,originalSend=prototype.send;
  const urls=new WeakMap();
  function captureOpen(method,url,...args) {urls.set(this,String(url));return originalOpen.call(this,method,url,...args);}
  function captureSend(...args) {
    if(enabled)this.addEventListener('load',()=>{
      try {
        if(this.status<200||this.status>=300)return;
        const type=this.getResponseHeader('Content-Type')||'';
        if(!/json/i.test(type))return;
        const names=this.getAllResponseHeaders().split(/\r?\n/).filter(Boolean).map(line=>line.split(':',1)[0].trim());
        if(this.responseType==='json')receive(JSON.stringify(this.response),this.responseURL||urls.get(this),'network',names);
        else if(!this.responseType||this.responseType==='text')receive(this.responseText,this.responseURL||urls.get(this),'network',names);
      }catch{}
    },{once:true});
    return originalSend.apply(this,args);
  }
  window.fetch=captureFetch;prototype.open=captureOpen;prototype.send=captureSend;
  // jQuery fires this after application success callbacks. Delay serialization so that
  // an in-place client transformation can finish; the data are not decoded by this tool.
  const jquery=window.jQuery;
  let ajaxObserver=null;
  if(jquery?.fn?.jquery){
    ajaxObserver=(_event,_xhr,options,data)=>{
      try {
        const u=new URL(options?.url || '',location.href);
        if(u.origin!==location.origin||!u.pathname.startsWith('/mapSvc/api/timeseries/v1/stations/'))return;
        setTimeout(()=>{if(enabled)try{receive(JSON.stringify(data),u.href,'application');}catch{}},100);
      }catch{}
    };
    try{jquery(document).on('ajaxSuccess.remanenceCapture',ajaxObserver);}catch{ajaxObserver=null;}
  }
  download.addEventListener('click',()=>{
    const bundle={format:'remap-capture-v1',toolVersion:2,capturedAt:new Date().toISOString(),client,resources:captures};
    const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`remap-capture-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  root.getElementById('stop').addEventListener('click',()=>{
    enabled=false;
    if(window.fetch===captureFetch)window.fetch=originalFetch;
    if(prototype.open===captureOpen)prototype.open=originalOpen;
    if(prototype.send===captureSend)prototype.send=originalSend;
    if(ajaxObserver)try{jquery(document).off('ajaxSuccess.remanenceCapture',ajaxObserver);}catch{}
    host.remove();delete window.__remanenceCapture;
  });
  window.__remanenceCapture={show:()=>{host.style.display='block';}};
})();
