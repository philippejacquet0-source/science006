import { HOUR, readDataset, serializeDataset } from './data.js';
import { DEFAULT_SETTINGS } from './detection.js';
import { createDemo, DEMO_START, DEMO_END } from './demo.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const nf = new Intl.NumberFormat('fr-FR', {maximumFractionDigits:1});
const shortDate = new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',timeZone:'UTC'});
const fullDate = new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});
const date = t => `${fullDate.format(t)} UTC`;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function svg(tag,attrs={}) { const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el; }
function text(x,y,value,attrs={}) { const el=svg('text',{x,y,...attrs});el.textContent=value;return el; }
let dataset, result, settings={...DEFAULT_SETTINGS,start:DEMO_START,end:DEMO_END}, cursor=0,selectedId,selectedEventId=null,playing=null,toastTimer;
let zoom=1,panX=0,panY=0,drag=null,requestId=0;
let pendingWorker=null;
let worker;
try { worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'}); }
catch { worker=null; }
if(worker) {
  worker.onmessage=({data})=>{ if(pendingWorker?.id!==data.id)return;const pending=pendingWorker;pendingWorker=null;data.error?pending.reject(new Error(data.error)):pending.resolve(data.result); };
  worker.onerror=()=>{ if(pendingWorker){pendingWorker.reject(new Error('Le calcul dans le navigateur a échoué. Rechargez la page.'));pendingWorker=null;} };
}
function compute(data,opts) {
  if(!worker)return import('./detection.js').then(({analyze})=>analyze(data,opts));
  return new Promise((resolve,reject)=>{const id=++requestId;pendingWorker={id,resolve,reject};worker.postMessage({id,dataset:data,settings:opts});});
}
function loading(show,label='Analyse des séries…') { $('loading').hidden=!show;$('loading-label').textContent=label; }
function toast(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000); }
function stopPlaying() { if(playing)clearInterval(playing);playing=null;$('play-button').innerHTML='<span class="play-icon" aria-hidden="true"></span><span>Lecture</span>';$('play-button').setAttribute('aria-label','Lancer l’animation'); }

async function loadDataset(next,opts,sourceName) {
  stopPlaying();loading(true);
  try {
    const analyzed=await compute(next,opts);
    dataset=next;result=analyzed;settings={...analyzed.settings};
    cursor=dataset.synthetic?Math.min(12,result.timestamps.length-1):result.timestamps.length-1;
    selectedEventId=result.events[0]?.id??null;
    selectedId=result.stations.find(s=>s.active[cursor])?.id??result.stations[0].id;
    const source=sourceName||dataset.name;
    $('source-banner').classList.toggle('imported',!dataset.synthetic);
    $('source-title').textContent=dataset.synthetic?'Scénario de démonstration':source;
    $('source-detail').textContent=dataset.synthetic?'Données synthétiques · aucune observation REMAP':`${nf.format(dataset.observations.length)} mesures · ${dataset.stations.length} balises · traitement local`;
    $('source-tag').textContent=dataset.synthetic?'SIMULATION':'FICHIER LOCAL';
    $('map-watermark').textContent=dataset.synthetic?'SCÉNARIO SYNTHÉTIQUE':'MESURES IMPORTÉES';
    $('map-caption').textContent=dataset.synthetic?'Balises fictives · sélectionnez un point pour explorer sa courbe':'Sélectionnez une balise pour explorer ses mesures';
    $('stat-events').textContent=result.events.length;
    $('event-count').textContent=result.events.length;
    $('stat-reference').textContent=`${result.referenceCount} / ${dataset.stations.length}`;
    $('stat-reference-note').textContent=`Au moins 24 heures sur ${settings.baselineDays} jours antérieurs`;
    $('time-slider').max=result.timestamps.length-1;$('time-slider').value=cursor;
    $('timeline-start').textContent=date(result.timestamps[0]);$('timeline-end').textContent=date(result.timestamps.at(-1));
    $('station-select').replaceChildren(...result.stations.map(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;return o;}));
    makeStations();resetZoom();renderEvents();drawActivity();renderTime();
    if(!result.referenceCount)toast('Pas de référence suffisante : ajoutez au moins 24 heures d’historique avant la période d’analyse.');
  } finally {loading(false);}
}

// A Mercator projection with one scale for both axes, centered on Europe.
const merc=lat=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360));
function project(lon,lat) { return [500+(lon-12)*Math.PI/180*575,380-(merc(lat)-merc(55))*575]; }
function geometryPath(geometry) {
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
  return polygons.flatMap(poly=>poly.map(ring=>ring.map(([lon,lat],i)=>{const [x,y]=project(lon,lat);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('')+'Z')).join('');
}
async function loadBasemap() {
  try {
    const response=await fetch('./data/europe.geojson');if(!response.ok)throw new Error('Fond géographique indisponible');const data=await response.json();
    $('countries').replaceChildren(...data.features.map(f=>{const path=svg('path',{d:geometryPath(f.geometry),class:'country'});const title=svg('title');title.textContent=f.properties.name;path.append(title);return path;}));
  } catch {toast('Le fond de carte ne s’est pas chargé. Les balises restent consultables.');}
  const labels=[['FRANCE',2,46],['ESPAGNE',-4,40],['ALLEMAGNE',10.5,50.5],['POLOGNE',20,52],['SUÈDE',15.5,64],['FINLANDE',27.5,65.5],['NORVÈGE',6.5,63],['ITALIE',12.5,43],['ROYAUME-UNI',-3,54]];
  for(const [label,lon,lat]of labels){const [x,y]=project(lon,lat);$('map-labels').append(text(x,y,label,{'text-anchor':'middle',class:'city-label'}));}
  const [x,y]=project(-13,48);$('map-labels').append(text(x,y,'Atlantique',{'text-anchor':'middle',class:'sea-label'}));
}
const stationElements=new Map();
function makeStations() {
  stationElements.clear();$('stations').replaceChildren();
  for(const station of result.stations) {
    const [cx,cy]=project(station.lon,station.lat);
    const circle=svg('circle',{cx,cy,r:3.4,class:'station-dot',tabindex:0,role:'button','aria-label':station.name});
    const title=svg('title');title.textContent=station.name;circle.append(title);
    circle.addEventListener('click',event=>{if(drag?.moved)return;event.stopPropagation();selectStation(station.id);});
    circle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectStation(station.id);}});
    circle.addEventListener('pointerenter',event=>showTooltip(station,event));circle.addEventListener('pointerleave',()=>$('map-tooltip').hidden=true);
    circle.addEventListener('focus',()=>{circle.style.stroke='#173c46';});circle.addEventListener('blur',()=>circle.style.stroke='');
    stationElements.set(station.id,circle);$('stations').append(circle);
  }
  $('stations').append(svg('circle',{id:'selection-ring',r:8,class:'selection-ring'}));
}
function showTooltip(station,event) {
  const value=station.values[cursor];$('map-tooltip').textContent=`${station.name} · ${value===null?'Donnée absente':`${nf.format(value)} nSv/h`}`;
  const box=$('map-container').getBoundingClientRect();$('map-tooltip').hidden=false;
  const width=$('map-tooltip').offsetWidth;
  $('map-tooltip').style.left=`${Math.max(5,Math.min(event.clientX-box.left+12,box.width-width-5))}px`;
  $('map-tooltip').style.top=`${Math.max(5,Math.min(event.clientY-box.top-36,box.height-45))}px`;
}
function state(station) {
  if(station.values[cursor]===null)return {css:'missing',label:'Donnée absente'};
  if(!station.validReference)return {css:'unreferenced',label:'Référence insuffisante'};
  if(station.active[cursor])return {css:'active',label:'Écart persistant'};
  if(station.scores[cursor]>settings.threshold)return {css:'brief',label:'Écart bref'};
  return {css:'normal',label:'Dans la référence'};
}
function renderTime() {
  $('time-slider').value=cursor;
  const time=result.timestamps[cursor];$('current-date').textContent=date(time);$('timeline-date').textContent=date(time);
  const active=result.stations.filter(s=>s.active[cursor]);$('stat-active').textContent=active.length;
  const observed=result.stations.filter(s=>s.values[cursor]!==null&&s.validReference);
  const maxExcess=observed.length?Math.max(0,...observed.map(s=>s.values[cursor]-s.baseline)):null;
  $('stat-excess').innerHTML=maxExcess===null?'—':`${nf.format(maxExcess)} <span class="unit">nSv/h</span>`;
  $('stat-active-note').textContent=`${result.stations.filter(s=>s.values[cursor]!==null).length} balises mesurées à cet instant`;
  for(const station of result.stations) {const circle=stationElements.get(station.id);circle.setAttribute('class',`station-dot ${state(station).css}`);circle.setAttribute('r',station.active[cursor]?4.5+Math.min(3,Math.max(0,station.scores[cursor]-settings.threshold)/5):3.3);circle.setAttribute('aria-label',`${station.name} : ${state(station).label}`);}
  $('map-tooltip').hidden=true;
  drawTrails();drawSelection();renderStation();updateEventStates();
}
function selectStation(id) {selectedId=id;$('station-select').value=id;drawSelection();renderStation();}
function drawSelection() {const station=result.stations.find(s=>s.id===selectedId);if(!station)return;const [cx,cy]=project(station.lon,station.lat);const ring=$('selection-ring');ring.setAttribute('cx',cx);ring.setAttribute('cy',cy);ring.setAttribute('r',station.active[cursor]?10:7);$('station-select').value=selectedId;}
function drawTrails() {
  $('event-trails').replaceChildren();
  const events=selectedEventId===null?result.events:result.events.filter(e=>e.id===selectedEventId);
  for(const event of events) {
    const points=event.points.filter(p=>p.index<=cursor);
    if(points.length<2)continue;
    const path=points.map((point,i)=>{const [x,y]=project(point.centroid.lon,point.centroid.lat);return `${i?'L':'M'}${x},${y}`;}).join('');
    $('event-trails').append(svg('path',{d:path,class:'event-trail'}));
  }
}
function renderEvents() {
  $('event-list').replaceChildren();
  if(!result.events.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<strong>Aucun épisode avec ces critères.</strong>Consultez les courbes et ajustez la période, la durée ou la proximité.';$('event-list').append(empty);return;}
  for(const event of result.events) {
    const button=document.createElement('button');button.className=`event-item${selectedEventId===event.id?' selected':''}`;button.dataset.eventId=event.id;
    const first=event.firstStation.replace(/ ·.*$/,''),last=event.lastStation.replace(/ ·.*$/,'');
    const name=first===last?first:`${first} → ${last}`;
    button.innerHTML=`<span class="event-item-top"><span class="event-num">ÉPISODE ${String(event.id+1).padStart(2,'0')}</span><span class="event-state" data-state></span></span><strong>${escape(name)}</strong><span class="event-time">${escape(shortDate.format(event.startTime))} — ${escape(shortDate.format(event.endTime))} · ${event.durationHours} h</span><span class="event-metrics"><span>${event.stationIds.length} balises</span><span>max. <b>+${nf.format(event.maxExcess)}</b> nSv/h</span></span>`;
    button.setAttribute('aria-pressed',String(selectedEventId===event.id));
    button.addEventListener('click',()=>{stopPlaying();selectedEventId=event.id;cursor=event.startIndex;const ids=event.points[0].ids;selectedId=ids[0];renderEvents();renderTime();});
    $('event-list').append(button);
  }
  updateEventStates();
}
function updateEventStates() {
  for(const button of $('event-list').querySelectorAll('[data-event-id]')) {
    const event=result.events[Number(button.dataset.eventId)],label=button.querySelector('[data-state]');
    const active=cursor>=event.startIndex&&cursor<=event.endIndex;label.textContent=active?'À cet instant':cursor<event.startIndex?'À venir':'Terminé';label.classList.toggle('past',!active);
  }
}
function drawActivity() {
  const canvas=$('activity-chart'),ratio=window.devicePixelRatio||1;
  const width=Math.max(200,canvas.getBoundingClientRect().width);canvas.width=width*ratio;canvas.height=43*ratio;
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const max=Math.max(1,...result.activity),step=width/result.activity.length;
  for(let i=0;i<result.activity.length;i++){const height=Math.max(2,result.activity[i]/max*37);ctx.fillStyle=result.activity[i]?'#cca178':'#46646a';ctx.fillRect(i*step,43-height,Math.max(1,step-2),height);}
}
function renderStation() {
  const station=result.stations.find(s=>s.id===selectedId);if(!station)return;
  $('station-title').textContent=station.name;
  const value=station.values[cursor],excess=value!==null&&station.validReference?value-station.baseline:null,score=station.scores[cursor];
  const status=state(station);
  $('station-summary').innerHTML=`<div>Mesure à cet instant<strong>${value===null?'—':nf.format(value)} <small>nSv/h</small></strong></div><div>Écart à la référence<strong>${excess===null?'—':`${excess>0?'+':''}${nf.format(excess)}`} <small>nSv/h</small></strong></div><div>Score robuste<strong>${score===null?'—':nf.format(score)} <small>seuil ${nf.format(settings.threshold)}</small></strong></div><div>Couverture de la période<strong>${Math.round(station.coverage*100)} <small>%</small></strong><span class="status-pill ${status.css}">${status.label}</span></div>`;
  drawStationChart(station);
}
function drawStationChart(station) {
  const chart=$('station-chart');chart.replaceChildren();
  const width=Math.max(320,chart.getBoundingClientRect().width);
  chart.setAttribute('viewBox',`0 0 ${width} 245`);
  const left=43,right=width-15,top=16,bottom=202,w=right-left,h=bottom-top;
  const valid=station.values.filter(v=>v!==null),references=station.validReference?[station.baseline,station.baseline+settings.threshold*station.scale]:[];
  if(!valid.length){chart.append(text(width/2,125,'Aucune mesure dans cette période',{'text-anchor':'middle',fill:'#7c8f8d','font-size':11}));return;}
  const all=[...valid,...references],low=Math.min(...all),high=Math.max(...all),pad=Math.max(2,(high-low)*.16);
  const min=Math.max(0,low-pad),max=high+pad;
  const x=i=>left+i/Math.max(1,station.values.length-1)*w,y=v=>bottom-(v-min)/(max-min)*h;
  for(const run of station.runs){const step=w/Math.max(1,station.values.length-1),begin=Math.max(left,x(run.start)-step/2),finish=Math.min(right,x(run.end)+step/2);chart.append(svg('rect',{x:begin,y:top,width:finish-begin,height:h,fill:'#f7ecdc'}));}
  for(let i=0;i<=4;i++){const value=min+(max-min)/4*i,py=y(value);chart.append(svg('line',{x1:left,y1:py,x2:right,y2:py,stroke:'#e7ebe3','stroke-width':1}));chart.append(text(left-8,py+3,nf.format(value),{'text-anchor':'end',fill:'#7f918d','font-size':10}));}
  chart.append(text(left,9,'nSv/h',{fill:'#849590','font-size':9}));
  if(station.validReference) {
    chart.append(svg('line',{x1:left,y1:y(station.baseline),x2:right,y2:y(station.baseline),stroke:'#9fae9f','stroke-dasharray':'5 4','stroke-width':1.2}));
    chart.append(svg('line',{x1:left,y1:y(station.baseline+settings.threshold*station.scale),x2:right,y2:y(station.baseline+settings.threshold*station.scale),stroke:'#be8c53','stroke-dasharray':'4 4','stroke-width':1.2}));
  }
  let d='',segment=false;
  for(let i=0;i<station.values.length;i++) {const value=station.values[i];if(value===null){segment=false;continue;}d+=`${segment?'L':'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`;segment=true;}
  chart.append(svg('path',{d,fill:'none',stroke:'#2b7c81','stroke-width':1.8,'stroke-linejoin':'round'}));
  // Dots also make one-hour datasets and isolated values visible.
  for(let i=0;i<station.values.length;i++)if(station.values[i]!==null&&(station.values.length===1||(station.values[i-1]===null&&station.values[i+1]===null)))chart.append(svg('circle',{cx:x(i),cy:y(station.values[i]),r:2.5,fill:'#2b7c81'}));
  chart.append(svg('line',{x1:x(cursor),y1:top,x2:x(cursor),y2:bottom,stroke:'#405c5e','stroke-width':1,'stroke-dasharray':'2 3'}));
  if(station.values[cursor]!==null)chart.append(svg('circle',{cx:x(cursor),cy:y(station.values[cursor]),r:4,fill:station.active[cursor]?'#d98b4c':'#2b7c81',stroke:'#fff','stroke-width':2}));
  const ticks=Math.min(width<500?3:5,station.values.length);
  for(let j=0;j<ticks;j++){const i=Math.round(j/Math.max(1,ticks-1)*(station.values.length-1));chart.append(text(x(i),bottom+22,`${shortDate.format(result.timestamps[i])} ${String(new Date(result.timestamps[i]).getUTCHours()).padStart(2,'0')}h`,{'text-anchor':j===0?'start':j===ticks-1?'end':'middle',fill:'#81928e','font-size':10}));}
  chart.setAttribute('aria-label',`Courbe de ${station.name}, du ${date(result.timestamps[0])} au ${date(result.timestamps.at(-1))}. ${station.validReference?`Référence ${nf.format(station.baseline)} nSv/h.`:'Référence insuffisante.'}`);
}

function applyZoom(){ $('map-content').setAttribute('transform',`translate(${500*(1-zoom)+panX},${380*(1-zoom)+panY}) scale(${zoom})`); }
function resetZoom(){zoom=1;panX=0;panY=0;applyZoom();}
$('zoom-in').addEventListener('click',()=>{zoom=Math.min(4,zoom*1.25);applyZoom();});
$('zoom-out').addEventListener('click',()=>{zoom=Math.max(.7,zoom/1.25);applyZoom();});$('zoom-reset').addEventListener('click',resetZoom);
function mapPoint(event){const pt=new DOMPoint(event.clientX,event.clientY);return pt.matrixTransform($('map').getScreenCTM().inverse());}
$('map').addEventListener('pointerdown',event=>{if(event.target.classList.contains('station-dot'))return;const point=mapPoint(event);drag={id:event.pointerId,x:point.x,y:point.y,panX,panY,moved:false};$('map').setPointerCapture(event.pointerId);$('map').classList.add('dragging');});
$('map').addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const point=mapPoint(event);drag.moved ||=Math.hypot(point.x-drag.x,point.y-drag.y)>5;panX=drag.panX+point.x-drag.x;panY=drag.panY+point.y-drag.y;applyZoom();});
function endDrag(){drag=null;$('map').classList.remove('dragging');}
$('map').addEventListener('pointerup',endDrag);$('map').addEventListener('pointercancel',endDrag);

$('time-slider').addEventListener('input',event=>{stopPlaying();cursor=Number(event.target.value);renderTime();});
function startPlaying(){stopPlaying();if(cursor===result.timestamps.length-1)cursor=0;$('play-button').innerHTML='<span class="pause-icon" aria-hidden="true"></span><span>Pause</span>';$('play-button').setAttribute('aria-label','Mettre l’animation en pause');playing=setInterval(()=>{cursor++;if(cursor>=result.timestamps.length){cursor=result.timestamps.length-1;stopPlaying();}renderTime();},Number($('play-speed').value));}
$('play-button').addEventListener('click',()=>playing?stopPlaying():startPlaying());$('play-speed').addEventListener('change',()=>{if(playing)startPlaying();});
$('station-select').addEventListener('change',event=>selectStation(event.target.value));
$('demo-button').addEventListener('click',async()=>{try{await loadDataset(createDemo(),{...DEFAULT_SETTINGS,start:DEMO_START,end:DEMO_END});}catch(error){toast(error.message);}});
$('import-button').addEventListener('click',()=>$('import-dialog').showModal());$('guide-button').addEventListener('click',()=>$('guide-dialog').showModal());
for(const button of document.querySelectorAll('.close-dialog'))button.addEventListener('click',()=>button.closest('dialog').close());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('import-form').addEventListener('submit',async event=>{
  event.preventDefault();$('import-error').hidden=true;$('capture-summary').hidden=true;const file=$('data-file').files[0];if(!file)return;
  $('import-submit').disabled=true;
  try {
    if(file.size>20*1024*1024)throw new Error('Le fichier dépasse 20 Mo. Sélectionnez une région ou une période plus courte.');
    const next=readDataset(await file.text(),file.name);next.name=file.name;
    const end=Math.floor(next.maxTime/HOUR)*HOUR,min=Math.floor(next.minTime/HOUR)*HOUR;
    const start=Math.min(end,Math.max(min+24*HOUR,end-72*HOUR));
    await loadDataset(next,{...DEFAULT_SETTINGS,start,end},file.name);$('import-dialog').close();
    toast(`${next.observations.length.toLocaleString('fr-FR')} mesures importées${next.duplicates?` · ${next.duplicates} doublons identiques retirés`:''}${next.captureSummary?.unmatchedMeasurements?` · ${next.captureSummary.unmatchedMeasurements} points de capture non importés`:''}.`);
  }catch(error){
    $('import-error').textContent=error.message;$('import-error').hidden=false;
    if(error.captureSummary){
      const summary=error.captureSummary;
      const lines=[`${summary.resources} réponses · ${summary.stationResponses} listes de balises · ${summary.seriesResponses} séries temporelles`,`${summary.measurementRows} points reçus ; les valeurs encodées ne sont pas tracées.`];
      for(const [i,series]of summary.series.entries())lines.push(`Série ${i+1} : ${series.count} points${series.start!==null?` · ${date(series.start)} — ${date(series.end)}`:''}`);
      $('capture-summary').replaceChildren(...lines.map(line=>{const p=document.createElement('p');p.textContent=line;return p;}));$('capture-summary').hidden=false;
    }
  }
  finally{$('import-submit').disabled=false;}
});
const settingInputs={threshold:'threshold-setting',minDuration:'duration-setting',radiusKm:'radius-setting',minStations:'count-setting',baselineDays:'baseline-setting',noiseFloor:'noise-setting'};
$('settings-button').addEventListener('click',()=>{
  for(const [key,id]of Object.entries(settingInputs))$(id).value=settings[key];
  $('analysis-start').value=new Date(settings.start).toISOString().slice(0,16);$('analysis-end').value=new Date(settings.end).toISOString().slice(0,16);
  $('settings-error').hidden=true;$('settings-dialog').showModal();
});
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();$('settings-error').hidden=true;
  try{
    const next={};for(const [key,id]of Object.entries(settingInputs))next[key]=Number($(id).value);
    next.start=Date.parse($('analysis-start').value+'Z');next.end=Date.parse($('analysis-end').value+'Z');
    if(next.start>next.end)throw new Error('La fin doit suivre le début de l’analyse.');
    if(next.end<dataset.minTime||next.start>dataset.maxTime)throw new Error('Cette période ne contient aucune mesure du fichier.');
    await loadDataset(dataset,next);$('settings-dialog').close();toast('Paramètres appliqués ; épisodes recalculés.');
  }catch(error){$('settings-error').textContent=error.message;$('settings-error').hidden=false;}
});
$('export-button').addEventListener('click',()=>{
  const payload=JSON.parse(serializeDataset(dataset));payload.analysisSettings=settings;
  const blob=new Blob([JSON.stringify(payload)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=dataset.synthetic?'remanence-simulation.json':'remanence-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Fichier exporté : mesures, balises et paramètres de l’analyse.');
});
const resizeObserver=new ResizeObserver(()=>{if(result){drawActivity();renderStation();}$('map').setAttribute('viewBox',window.innerWidth<=760?'260 15 660 730':'0 0 1000 760');});resizeObserver.observe($('activity-chart'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlaying();});
await loadBasemap();
try{await loadDataset(createDemo(),settings);}catch(error){loading(false);toast(`Initialisation impossible : ${error.message}`);}
