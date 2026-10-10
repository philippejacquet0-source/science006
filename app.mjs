import {hull} from './engine.mjs';
import {clusterDefaults as defaults} from './cluster-engine.mjs';
const $=id=>document.getElementById(id),fmt=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('fr-FR',{maximumFractionDigits:d}):'—';
const escape=t=>String(t??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const countryNames=new Intl.DisplayNames(['fr'],{type:'region'});
const country=c=>{try{return countryNames.of(c)||c;}catch{return c;}};
let meta,values,result,selected,stationIndex,instant=0,worker,request=0,timer=null,networkOn=false,detailed=false;
const map=L.map('map',{preferCanvas:true,zoomControl:false,minZoom:2,maxZoom:17}).setView([52,12],4);
L.control.zoom({position:'topright'}).addTo(map);L.control.scale({position:'bottomright',imperial:false}).addTo(map);
const renderer=L.canvas({padding:.5}),networkLayer=L.layerGroup(),eventLayer=L.layerGroup().addTo(map),currentLayer=L.layerGroup().addTo(map),labelLayer=L.layerGroup().addTo(map);
const offline=L.layerGroup().addTo(map);let basemap;
const svg=(tag,attrs,children='')=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${children}</${tag}>`;
const when=t=>new Date(meta.origin+t*3600000);
const timeLabel=t=>when(t).toLocaleString('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const dayLabel=t=>when(t).toLocaleDateString('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short'});
const dateISO=t=>when(t).toISOString();
const title=e=>e.countries.length>=5?`Europe · ${e.countries.length} pays`:e.countries.map(country).join(' · ');
function notify(text,error=false){$('load-status').textContent=text;$('load-status').classList.toggle('error',error);}
async function setupMap(){
 try{const geo=await (await fetch('./data/countries.geojson')).json();L.geoJSON(geo,{style:{color:'#ccd4c8',weight:.8,fillColor:'#f4f3e9',fillOpacity:1},interactive:false}).addTo(offline);
  for(const f of geo.features){const shape=L.geoJSON(f),center=shape.getBounds().getCenter();if(center.lat>30&&center.lat<73&&center.lng>-25&&center.lng<50)L.marker(center,{interactive:false,icon:L.divIcon({className:'country-label',html:escape(f.properties.name),iconSize:[100,15],iconAnchor:[50,7]})}).addTo(labelLayer);}
  map.attributionControl.addAttribution('Natural Earth · domaine public');
 }catch{notify('Le fond local n’a pas pu être chargé. Les données restent accessibles.',true);}
}
function toggleBasemap(){
 detailed=!detailed;$('basemap').setAttribute('aria-pressed',detailed);
 if(detailed){if(!basemap){basemap=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19});let failures=0;basemap.on('tileerror',()=>{failures++;if(failures>=4&&detailed){toggleBasemap();notify('Fond distant indisponible : retour au fond local.');}});}
  map.removeLayer(offline);map.removeLayer(labelLayer);basemap.addTo(map);$('tile-note').textContent='Fond détaillé · OpenStreetMap (accès internet)';
 }else{if(basemap)map.removeLayer(basemap);offline.addTo(map);labelLayer.addTo(map);$('tile-note').textContent='Fond local · Natural Earth';}
}
function drawNetwork(){networkLayer.clearLayers();for(let s=0;s<meta.N;s++){const station=meta.stations[s];L.circleMarker([station.lat,station.lon],{renderer,radius:2.2,color:'#899b8c',weight:.5,fillOpacity:.35}).on('click',()=>chooseStation(s)).addTo(networkLayer);}}
function spark(e){const max=Math.max(...e.series.map(p=>p.count),1),length=Math.max(1,e.end-e.start);return `<svg class="sparkline" viewBox="0 0 240 26" aria-hidden="true"><path d="${e.series.map((p,i)=>`${i?'L':'M'}${(p.t-e.start)/length*238+1},${24-p.count/max*20}`).join(' ')}" fill="none" stroke="#8a9b73" stroke-width="1.5"/></svg>`;}
function renderList(){
 if(!result)return;const q=$('search').value.trim().toLocaleLowerCase('fr'),key=$('sort').value;
 const events=result.events.filter(e=>!q||`${e.id} ${title(e)} ${e.countries.map(country).join(' ')} ${e.countries.join(' ')} ${e.ids.map(s=>meta.stations[s].id).join(' ')}`.toLocaleLowerCase('fr').includes(q)).sort((a,b)=>key==='start'?a.start-b.start:b[key]-a[key]);
 $('event-count').textContent=events.length;
 $('events').innerHTML=events.length?events.map(e=>`<button class="event-card ${selected?.id===e.id?'selected':''}" data-event="${e.id}" aria-pressed="${selected?.id===e.id}"><div class="event-kicker"><span>CLUSTER ${String(e.id).padStart(2,'0')}</span><span>${e.branches} SÉPARATIONS</span></div><div class="event-title">${escape(title(e))}</div><div class="event-period">${timeLabel(e.start)} → ${timeLabel(e.end)}</div><div class="event-numbers"><span><strong>${fmt(e.ids.length)}</strong>balises distinctes</span><span><strong>${fmt(e.travel)} km</strong>déplacement</span><span><strong>${e.duration} h</strong>durée</span></div>${spark(e)}</button>`).join(''):`<div class="empty">Aucun cluster avec cette sélection. Réduisez la distance minimale, augmentez la sensibilité ou changez le filtre. Les mesures restent consultables.</div>`;
 for(const button of $('events').querySelectorAll('[data-event]'))button.onclick=()=>selectEvent(Number(button.dataset.event));
}
function updateFacts(){
 const e=selected;if(!e)return;const at=e.series.find(p=>p.t===instant);
 $('event-facts').innerHTML=`<div><strong>${at?.count||0}<small> / ${e.maxCount}</small></strong><span>balises actives / maximum</span></div><div><strong>${at?.zones||0}<small> / ${e.maxZones}</small></strong><span>zones simultanées / maximum</span></div><div><strong>${fmt(e.travel)} <small>km</small></strong><span>déplacement net d’une branche</span></div><div><strong>${e.branches}<small> / ${e.mergers}</small></strong><span>séparations / fusions</span></div>`;
}
function frameSelected(){if(!selected)return;const bounds=L.latLngBounds(selected.ids.map(s=>[meta.stations[s].lat,meta.stations[s].lon]));map.fitBounds(bounds.pad(.05),{maxZoom:9,padding:[25,25],animate:false});}
function selectEvent(id){
 selected=result.events.find(e=>e.id===id);if(!selected)return;stop();instant=selected.start;
 $('map-context').textContent=`CLUSTER ${String(id).padStart(2,'0')} · ${selected.ids.length} BALISES DISTINCTES`;$('map-title').textContent=title(selected);
 $('timeline-title').textContent=`${timeLabel(selected.start)} → ${timeLabel(selected.end)} · ${selected.duration} heures`;
 $('station-select').innerHTML=selected.ids.map(s=>`<option value="${s}">${escape(meta.stations[s].id)}</option>`).join('');
 const atPeak=selected.nodes.filter(n=>n.t===instant).flatMap(n=>n.ids);
 stationIndex=atPeak.reduce((a,b)=>values[a*meta.T+instant]-result.refs[a]>=values[b*meta.T+instant]-result.refs[b]?a:b,atPeak[0]);
 $('station-select').value=stationIndex;
 renderList();drawEventFootprint();frameSelected();renderTime();chooseStation(stationIndex);
}
function drawEventFootprint(){
 eventLayer.clearLayers();if(!selected)return;
 for(const s of selected.ids){const p=meta.stations[s];L.circleMarker([p.lat,p.lon],{renderer,radius:2.3,color:'#9fab9a',weight:.3,fillColor:'#b9c5b2',fillOpacity:.25}).on('click',()=>chooseStation(s)).addTo(eventLayer);}
}
function renderTime(){
 if(!meta)return;$('time').value=instant;$('map-time-label').textContent=timeLabel(instant)+' UTC';currentLayer.clearLayers();
 if(selected){
  if($('tracks')?.getAttribute('aria-pressed')==='true'){
   const nodeMap=new Map(selected.nodes.map(n=>[n.id,n]));
   for(const link of selected.links){const a=nodeMap.get(link.from),b=nodeMap.get(link.to);if(b.t>instant||b.t<instant-5)continue;
    L.polyline([[a.center.lat,a.center.lon],[b.center.lat,b.center.lon]],{renderer,color:'#426b5a',weight:2,opacity:.55,interactive:false}).addTo(currentLayer);
   }
  }
  for(const n of selected.nodes.filter(n=>n.t>=instant-2&&n.t<instant)){const outline=hull(n.ids.map(s=>meta.stations[s]));if(outline.length>=3)L.polygon(outline.map(p=>[p[1],p[0]]),{renderer,color:'#7b987c',weight:1,dashArray:'4 4',fill:false,opacity:.45,interactive:false}).addTo(currentLayer);}
  for(const node of selected.nodes.filter(n=>n.t===instant)){
   const poly=hull(node.ids.map(s=>meta.stations[s]));if(poly.length>=3)L.polygon(poly.map(p=>[p[1],p[0]]),{renderer,color:'#b6703e',weight:1.2,fillColor:'#be7d44',fillOpacity:.12,interactive:false}).addTo(currentLayer);
   for(const s of node.ids){const p=meta.stations[s],excess=values[s*meta.T+instant]-result.refs[s],color=excess>50?'#ad4529':excess>25?'#c67438':'#d59853';
    const marker=L.circleMarker([p.lat,p.lon],{renderer,radius:6+Math.min(3,excess/50),color:'#fff',weight:1.1,fillColor:color,fillOpacity:.95}).on('click',()=>chooseStation(s));
    marker.bindTooltip(`<strong>${escape(p.id)}</strong><br>${fmt(values[s*meta.T+instant],2)} nSv/h · excès +${fmt(excess,2)}`,{direction:'top'});marker.addTo(currentLayer);
   }
  }
 }
 updateFacts();drawEventChart();drawStationChart();drawLineage();
}
function drawEventChart(){
 const e=selected,W=1100,H=170,LX=50,RX=1050,top=16,bottom=132,start=e?Math.max(result.settings.baselineHours,e.start-4):result?.settings.baselineHours||0,end=e?Math.min(meta.T-1,e.end+4):meta.T-1;
 const series=e?e.series:[...result.activity].map((count,t)=>({t,count,excess:0})).filter(p=>p.t>=start),maxC=Math.max(1,...series.map(p=>p.count)),maxE=Math.max(1,...series.map(p=>p.excess||0));
 const x=t=>LX+(t-start)/Math.max(1,end-start)*(RX-LX),yC=v=>bottom-v/maxC*(bottom-top),yE=v=>bottom-v/maxE*(bottom-top),bw=Math.max(2,(RX-LX)/(end-start+1)*.72);
 let content='';for(let j=0;j<=3;j++){const y=bottom-j/3*(bottom-top);content+=svg('line',{x1:LX,x2:RX,y1:y,y2:y,stroke:'#edf0e8'})+svg('text',{x:LX-10,y:y+3,'text-anchor':'end',class:'chart-axis'},fmt(maxC*j/3))+svg('text',{x:RX+8,y:y+3,class:'chart-axis'},fmt(maxE*j/3));}
 for(const p of series)content+=svg('rect',{x:x(p.t)-bw/2,y:yC(p.count),width:bw,height:bottom-yC(p.count),fill:p.t===instant?'#758c63':'#c4d1bb',rx:1});
 let last=null;const paths=[];for(const p of series){if(last!==null&&p.t!==last+1)paths.push('');if(!paths.length)paths.push('');paths[paths.length-1]+=`${paths.at(-1)?' L':'M'}${x(p.t)},${yE(p.excess||0)}`;last=p.t;}for(const d of paths)content+=svg('path',{d,fill:'none',stroke:'#b36637','stroke-width':2});
 for(const peak of e?.peaks||[])content+=svg('path',{d:`M${x(peak.t)},${yE(peak.excess)-6} l4,4 l-4,4 l-4,-4 Z`,fill:'#bf823e'});
 if(instant>=start&&instant<=end)content+=svg('line',{x1:x(instant),x2:x(instant),y1:top,y2:bottom,stroke:'#355744','stroke-width':1,'stroke-dasharray':'3 3'});
 const ticks=new Set([start,end,...Array.from({length:5},(_,i)=>Math.round(start+(end-start)*i/4))]);for(const t of ticks)content+=svg('text',{x:x(t),y:162,'text-anchor':'middle',class:'chart-axis'},timeLabel(t));
 $('event-chart').innerHTML=content;$('event-chart').setAttribute('aria-label',e?`Cluster ${e.id} : ${e.maxCount} balises simultanées au maximum, jusqu’à ${e.maxZones} zones simultanées.`:'Activité globale des balises');
 $('time').min=start;$('time').max=end;$('time').value=Math.max(start,Math.min(end,instant));
 $('peak-note').textContent=e?`${e.ids.length} balises distinctes · jusqu’à ${e.maxZones} zones simultanées · ${e.countries.length} pays`:'';
}
function drawLineage(){
 if(!$('lineage')||!selected)return;const e=selected,W=Math.max(900,e.duration*23),H=Math.max(210,e.maxZones*29+70),left=40,right=W-30,x=t=>left+(t-e.start)/Math.max(1,e.end-e.start)*(right-left),positions=new Map();
 for(const t of [...new Set(e.nodes.map(n=>n.t))]){const at=e.nodes.filter(n=>n.t===t).sort((a,b)=>a.center.lon-b.center.lon||a.center.lat-b.center.lat);at.forEach((n,i)=>positions.set(n.id,{x:x(t),y:35+(i+.5)/Math.max(1,at.length)*(H-80)}));}
 let html=svg('line',{x1:x(instant),x2:x(instant),y1:15,y2:H-30,stroke:'#d5decf','stroke-width':2});
 for(const l of e.links){const a=positions.get(l.from),b=positions.get(l.to);html+=svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#a9b9a3','stroke-width':1.6});}
 for(const n of e.nodes){const p=positions.get(n.id);html+=svg('circle',{cx:p.x,cy:p.y,r:n.t===instant?5:3.5,fill:n.t===instant?'#b5723e':'#60836b','data-zone-time':n.t,style:'cursor:pointer'},svg('title',{},`${timeLabel(n.t)} UTC · ${n.ids.length} balises · ${n.children.length} zones suivantes`));}
 for(let t=e.start;t<=e.end;t+=6)html+=svg('text',{x:x(t),y:H-10,'text-anchor':'middle',class:'chart-axis'},timeLabel(t));
 $('lineage').setAttribute('viewBox',`0 0 ${W} ${H}`);$('lineage').style.width=`${W}px`;$('lineage').innerHTML=html;$('lineage').parentElement.scrollLeft=Math.max(0,x(instant)-$('lineage').parentElement.clientWidth*.45);for(const dot of $('lineage').querySelectorAll('[data-zone-time]'))dot.onclick=()=>{stop();instant=Number(dot.dataset.zoneTime);renderTime();};
 $('lineage').setAttribute('aria-label',`${e.nodes.length} zones horaires, ${e.branches} séparations, ${e.mergers} fusions dans le cluster ${e.id}.`);
 $('route-note').textContent=e.route?`Progression des nouveaux territoires activés : ${fmt(e.travel)} km entre ${timeLabel(e.route.start)} et ${timeLabel(e.route.end)} UTC. Cette distance concerne une route de cellules reliées ; elle n’est pas la taille simultanée de la zone. Pays du cluster : ${e.countries.map(country).join(', ')}.`:'';
}
function chooseStation(s){
 stationIndex=s;if(!meta)return;const p=meta.stations[s];
 if(!$('station-select').querySelector(`option[value="${s}"]`))$('station-select').insertAdjacentHTML('beforeend',`<option value="${s}">${escape(p.id)}</option>`);
 $('station-select').value=s;$('station-title').textContent=p.name?`${p.name} · ${p.id}`:p.id;
 $('station-meta').textContent=`${country(p.country)} · ${fmt(p.lat,2)}°, ${fmt(p.lon,2)}° · ${result.coverage[s]}/${meta.T} heures mesurées · référence ${fmt(result.refs[s],2)} nSv/h`;
 drawStationChart();
}
function drawStationChart(){
 if(stationIndex===undefined||!result)return;const s=stationIndex,T=meta.T,LX=50,RX=1050,top=14,bottom=175,x=t=>LX+t/(T-1)*(RX-LX),ref=result.refs[s],threshold=ref+Math.max(result.settings.z*result.sigmas[s],result.settings.minExcess),measurements=[...values.slice(s*T,(s+1)*T)].filter(Number.isFinite);
 if(!measurements.length){$('station-chart').innerHTML=svg('text',{x:70,y:90,class:'chart-axis'},'Aucune mesure disponible.');return;}
 const lo=Math.max(0,Math.min(...measurements,Number.isFinite(ref)?ref:Infinity)-4),hi=Math.max(...measurements,Number.isFinite(threshold)?threshold:-Infinity)+4,y=v=>bottom-(v-lo)/Math.max(1,hi-lo)*(bottom-top);
 let content=svg('rect',{x:LX,y:top,width:x(result.settings.baselineHours)-LX,height:bottom-top,fill:'#f0f1ea'});
 for(let j=0;j<=4;j++){const v=lo+j/4*(hi-lo);content+=svg('line',{x1:LX,x2:RX,y1:y(v),y2:y(v),stroke:'#ebeee5'})+svg('text',{x:LX-8,y:y(v)+3,'text-anchor':'end',class:'chart-axis'},fmt(v,1));}
 for(let t=0;t<T;t++)if(result.active[s*T+t])content+=svg('rect',{x:x(t)-2,y:top,width:Math.max(3,(RX-LX)/(T-1)),height:bottom-top,fill:'#f4d5b3','fill-opacity':.35});
 if(Number.isFinite(ref))content+=svg('line',{x1:LX,x2:RX,y1:y(ref),y2:y(ref),stroke:'#7c9874','stroke-dasharray':'5 4'});
 if(Number.isFinite(threshold))content+=svg('line',{x1:LX,x2:RX,y1:y(threshold),y2:y(threshold),stroke:'#b18b50','stroke-dasharray':'3 4'});
 let d='',prev=false;for(let t=0;t<T;t++){const v=values[s*T+t];if(Number.isFinite(v)){d+=`${prev?' L':' M'}${x(t)},${y(v)}`;prev=true;}else prev=false;}content+=svg('path',{d,fill:'none',stroke:'#b36536','stroke-width':1.8});
 const v=values[s*T+instant];content+=svg('line',{x1:x(instant),x2:x(instant),y1:top,y2:bottom,stroke:'#355744','stroke-dasharray':'3 3'});
 if(Number.isFinite(v))content+=svg('circle',{cx:x(instant),cy:y(v),r:4,fill:'#ad592f'})+svg('text',{x:Math.min(RX-100,x(instant)+9),y:Math.max(top+12,y(v)-10),fill:'#974728','font-size':11},`${fmt(v,2)} nSv/h`);
 for(let t=0;t<T;t+=24)content+=svg('text',{x:x(t),y:199,'text-anchor':'middle',class:'chart-axis'},dayLabel(t));
 $('station-chart').innerHTML=content;$('station-chart').setAttribute('aria-label',`${meta.stations[s].id} : référence ${fmt(ref,2)} nSv/h. Mesure à ${timeLabel(instant)} : ${fmt(v,2)} nSv/h.`);
}
function stop(){if(timer)clearInterval(timer);timer=null;$('play').textContent='▶ Lecture';$('play').setAttribute('aria-label','Lancer l’animation');}
function play(){if(timer){stop();return;}$('play').textContent='Ⅱ Pause';$('play').setAttribute('aria-label','Mettre en pause');if(instant>=Number($('time').max))instant=Number($('time').min);timer=setInterval(()=>{instant++;if(instant>Number($('time').max)){stop();return;}renderTime();},Number($('speed').value));}
function recalculate(settings,initial=false){
 stop();request++;$('settings-open').disabled=true;$('settings-form').querySelector('[type=submit]').disabled=true;notify('Calcul local des références, des persistances et des groupes territoriaux…');
 worker.postMessage({type:initial?'init':'analyse',meta:initial?meta:undefined,buffer:initial?values.buffer.slice(0):undefined,settings,request});
}
function populateMethod(){
 $('method-content').innerHTML=`<h3>1 · Une variation remarquable à chaque balise</h3><p>La référence est la médiane des 72 premières heures, avec au moins 48 heures mesurées. La variabilité est le maximum de 1,4826 × MAD et de 1,5 nSv/h. Une variation positive doit dépasser le seuil de sensibilité et persister 2 heures. Les lacunes interrompent la persistance.</p><h3>2 · Des zones simultanées</h3><p>Les balises actives sont regroupées par proximité à chaque heure. Une zone contient au moins le nombre de balises demandé. Le voisinage peut se prolonger par chaînage ; l’enveloppe convexe relie les balises, sans représenter une surface contaminée.</p><h3>3 · Un cluster avec ses branches</h3><p>Deux emprises consécutives sont liées si une part suffisante de leurs cellules actives se trouve à proximité. La liaison ne nécessite pas les mêmes balises. Plusieurs liens sortants décrivent une séparation ; plusieurs liens entrants une fusion. Le cluster conserve toutes ces branches.</p><h3>4 · Un déplacement, et pas seulement une grande étendue</h3><p>Le suivi des cellules de 50 km nouvellement actives recherche une progression dans l’ordre temporel, compatible avec les liaisons des zones. Une activation simultanée de tout le territoire ne suffit pas. Une route doit durer au moins 6 heures et son déplacement net représenter au moins 55 % de sa longueur. La distance minimale demandée filtre ces routes.</p><h3>Portée du résultat</h3><p>Les liens décrivent une continuité spatiale et temporelle, sans prouver une origine physique commune. Des fusions accidentelles et des branches dues aux seuils restent possibles ; examinez la carte et les mesures, et comparez les sensibilités. ${meta.missingLots.length} lots sont absents, avec ${fmt(meta.coverage*100,1)} % de couverture horaire. Le seuil ne constitue pas un test de significativité.</p><p>Les données et calculs restent locaux. Le fond détaillé charge des tuiles OpenStreetMap ; aucune mesure ne lui est transmise.</p><p><a href="CLUSTERS.md" target="_blank">Lire le protocole complet ↗</a></p>`;
}
function exportEvent(){
 if(!selected)return;const ids=new Set(selected.ids),observations=[];
 for(const s of ids)for(let t=0;t<meta.T;t++){const v=values[s*meta.T+t];if(Number.isFinite(v))observations.push({stationId:meta.stations[s].id,time:dateISO(t),value:v});}
 const event={...selected,nodes:selected.nodes.map(n=>({id:n.id,time:dateISO(n.t),stationIds:n.ids.map(s=>meta.stations[s].id),center:n.center,parents:n.parents,children:n.children,area:n.area})),ids:selected.ids.map(s=>meta.stations[s].id),start:dateISO(selected.start),end:dateISO(selected.end),peakTime:dateISO(selected.peakTime),series:selected.series.map(p=>({...p,time:dateISO(p.t)})),route:selected.route?{...selected.route,points:selected.route.points.map(p=>({...p,time:dateISO(p.t)}))}:null};
 const bundle={schema:'remanence-clusters-v2',name:`Cluster descriptif ${selected.id}`,unit:'nSv/h',synthetic:false,stations:[...ids].map(s=>meta.stations[s]),observations,analysisSettings:result.settings,event,provenance:{source:'Capture locale REMAP',missingLots:meta.missingLots,method:'CLUSTERS.md'}};
 const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`remap-evenement-${selected.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('search').oninput=renderList;$('sort').onchange=renderList;$('fit').onclick=frameSelected;$('basemap').onclick=toggleBasemap;
if($('tracks'))$('tracks').onclick=()=>{$('tracks').setAttribute('aria-pressed',$('tracks').getAttribute('aria-pressed')!=='true');renderTime();};
if($('restart'))$('restart').onclick=()=>{if(!selected)return;stop();instant=selected.start;renderTime();};
function showNamedStation(){if(!meta||!result)return;const s=meta.stations.findIndex(p=>p.id.toUpperCase()===$('station-find').value.trim().toUpperCase());if(s<0){notify('Cette balise est absente du jeu local.',true);return;}const e=result.events.find(e=>e.ids.includes(s));if(e&&e.id!==selected?.id)selectEvent(e.id);if(e){stop();const times=e.nodes.filter(n=>n.ids.includes(s)).map(n=>n.t);instant=times.reduce((a,b)=>values[s*meta.T+a]>=values[s*meta.T+b]?a:b,times[0]);renderTime();}chooseStation(s);}
if($('station-find')){$('station-find').onchange=showNamedStation;$('station-find').onkeydown=e=>{if(e.key==='Enter')showNamedStation();};}if($('station-go'))$('station-go').onclick=showNamedStation;
$('network').onclick=()=>{networkOn=!networkOn;$('network').setAttribute('aria-pressed',networkOn);if(networkOn){if(!networkLayer.getLayers().length)drawNetwork();networkLayer.addTo(map);}else map.removeLayer(networkLayer);};
$('time').oninput=()=>{stop();instant=Number($('time').value);renderTime();};$('previous').onclick=()=>{stop();instant=Math.max(Number($('time').min),instant-1);renderTime();};$('next').onclick=()=>{stop();instant=Math.min(Number($('time').max),instant+1);renderTime();};$('play').onclick=play;$('speed').onchange=()=>{if(timer){stop();play();}};
$('station-select').onchange=()=>chooseStation(Number($('station-select').value));$('export').onclick=exportEvent;
$('settings-open').onclick=()=>{$('settings-error').textContent='';$('settings').showModal();};$('method-open').onclick=()=>{$('method').showModal();};for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
 $('reset').onclick=()=>{for(const [key,value] of Object.entries(defaults)){const control=$('settings-form').elements[key];if(control)control.value=value;}$('sensitivity').value='normal';};
$('settings-form').onsubmit=event=>{event.preventDefault();const settings=Object.fromEntries([...new FormData(event.target)].map(([k,v])=>[k,Number(v)])),presets={high:{z:3,minExcess:3},normal:{z:4,minExcess:5},low:{z:6,minExcess:10}};Object.assign(settings,presets[$('sensitivity').value]);if(settings.minBaseline>settings.baselineHours||settings.baselineHours>=meta.T){$('settings-error').textContent='La période de référence doit être plus courte que le jeu de données et contenir le minimum d’heures demandé.';return;}recalculate(settings);};
try{
 await setupMap();const responses=await Promise.all([fetch('./data/meta.json'),fetch('./data/values.bin')]);if(responses.some(r=>!r.ok))throw new Error('Données locales introuvables.');meta=await responses[0].json();values=new Float64Array(await responses[1].arrayBuffer());
 if(values.length!==meta.N*meta.T)throw new Error('Dimensions du jeu local incohérentes.');
 $('data-stations').textContent=fmt(meta.N);$('data-measures').textContent=fmt(meta.rawCount);$('data-coverage').textContent=fmt(meta.coverage*100,1)+' %';$('time').max=meta.T-1;populateMethod();
 worker=new Worker('./worker.mjs',{type:'module'});worker.onmessage=event=>{const m=event.data;if(m.request!==request)return;$('settings-open').disabled=false;$('settings-form').querySelector('[type=submit]').disabled=false;
  if(m.type==='error'){$('settings-error').textContent=m.message;notify(m.message,true);return;}
  result=m.result;$('settings').close();$('criteria-note').textContent=`Au moins ${result.settings.minStations} balises par zone · déplacement ≥ ${result.settings.minTravel} km · durée ≥ ${result.settings.minHours} h`;
  notify(`${result.events.length} ${result.events.length===1?'cluster en déplacement retenu':'clusters en déplacement retenus'} sur ${result.allEvents.length} ensembles · ${fmt(result.zoneCount)} zones horaires · recherche sur tout le réseau · ${meta.missingLots.length} lots absents`);
  if(result.events.length)selectEvent(result.events[0].id);else{selected=null;eventLayer.clearLayers();currentLayer.clearLayers();renderList();instant=result.settings.baselineHours;renderTime();$('map-title').textContent='Aucun événement avec ces critères';$('timeline-title').textContent='Activité globale · ajustez les critères pour regrouper les écarts';$('event-facts').innerHTML='';if($('lineage'))$('lineage').innerHTML='';if($('route-note'))$('route-note').textContent='Aucun cluster satisfait ces critères de déplacement. Les mesures restent consultables.';$('station-select').innerHTML=meta.stations.map((s,i)=>`<option value="${i}">${escape(s.id)}</option>`).join('');chooseStation(0);}
 };
 worker.onerror=()=>{notify('Le calcul a échoué. Consultez les réglages et rechargez si nécessaire.',true);$('settings-open').disabled=false;$('settings-form').querySelector('[type=submit]').disabled=false;};recalculate(defaults,true);
}catch(error){notify(error.message,true);}
