import {WeatherUI} from './weather-ui.mjs?v=water-20261021b';
import {hull} from './engine.mjs';
import {clusterDefaults as defaults} from './cluster-engine.mjs?v=defaults-20261020';
import {validateCatalogue,validateHourly} from './dataset-catalog.mjs';
const $=id=>document.getElementById(id),fmt=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('fr-FR',{maximumFractionDigits:d}):'—';
const escape=t=>String(t??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const countryNames=new Intl.DisplayNames(['fr'],{type:'region'});
const country=c=>{try{return countryNames.of(c)||c;}catch{return c;}};
let meta,values,result,selected,stationIndex,instant=0,worker,request=0,timer=null,networkOn=false,detailed=false;
let importWorker=null,busy=false,sourceEpoch=0,catalogue=null;
let gifWorker=null,gifUrl=null;
const map=L.map('map',{preferCanvas:true,zoomControl:false,minZoom:2,maxZoom:17,zoomSnap:.25,zoomDelta:.5}).setView([52,12],4);
L.control.zoom({position:'topright'}).addTo(map);L.control.scale({position:'bottomright',imperial:false}).addTo(map);
map.createPane('radioPane').style.zIndex=450;
const renderer=L.canvas({padding:.5,pane:'radioPane'}),networkLayer=L.layerGroup(),eventLayer=L.layerGroup().addTo(map),currentLayer=L.layerGroup().addTo(map),labelLayer=L.layerGroup().addTo(map);
const offline=L.layerGroup().addTo(map);let basemap;
const weather=new WeatherUI(map);
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
function drawNetwork(){networkLayer.clearLayers();for(let s=0;s<meta.N;s++){const station=meta.stations[s];L.circleMarker([station.lat,station.lon],{renderer,radius:2.2,color:'#899b8c',weight:.5,fillOpacity:.35}).on('click',()=>inspectStation(s)).addTo(networkLayer);}}
function spark(e){const max=Math.max(...e.series.map(p=>p.count),1),length=Math.max(1,e.end-e.start);return `<svg class="sparkline" viewBox="0 0 240 26" aria-hidden="true"><path d="${e.series.map((p,i)=>`${i?'L':'M'}${(p.t-e.start)/length*238+1},${24-p.count/max*20}`).join(' ')}" fill="none" stroke="#8a9b73" stroke-width="1.5"/></svg>`;}
function orderedEvents(){const key=$('sort').value;return [...result.events].sort((a,b)=>key==='start'?a.start-b.start:b[key]-a[key]);}
function renderList(){
 if(!result)return;const q=$('search').value.trim().toLocaleLowerCase('fr');
 const events=orderedEvents().filter(e=>!q||`${e.id} ${title(e)} ${e.countries.map(country).join(' ')} ${e.countries.join(' ')} ${e.ids.map(s=>meta.stations[s].id).join(' ')}`.toLocaleLowerCase('fr').includes(q));
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
 for(const s of selected.ids){const p=meta.stations[s];L.circleMarker([p.lat,p.lon],{renderer,radius:2.3,color:'#9fab9a',weight:.3,fillColor:'#b9c5b2',fillOpacity:.25}).on('click',()=>inspectStation(s)).addTo(eventLayer);}
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
    const marker=L.circleMarker([p.lat,p.lon],{renderer,radius:6+Math.min(3,excess/50),color:'#fff',weight:1.1,fillColor:color,fillOpacity:.95}).on('click',()=>inspectStation(s));
    marker.bindTooltip(`<strong>${escape(p.id)}</strong><br>${fmt(values[s*meta.T+instant],2)} nSv/h · excès +${fmt(excess,2)}`,{direction:'top'});marker.addTo(currentLayer);
   }
  }
 }
 updateFacts();drawEventChart();drawStationChart();drawLineage();weather.update({meta,selected,instant});
}
function drawEventChart(){
 const e=selected,W=1100,H=130,LX=50,RX=1050,top=10,bottom=96,start=e?Math.max(result.settings.baselineHours,e.start-4):result?.settings.baselineHours||0,end=e?Math.min(meta.T-1,e.end+4):meta.T-1;
 const series=e?e.series:[...result.activity].map((count,t)=>({t,count,excess:0})).filter(p=>p.t>=start),maxC=Math.max(1,...series.map(p=>p.count)),maxE=Math.max(1,...series.map(p=>p.excess||0));
 const x=t=>LX+(t-start)/Math.max(1,end-start)*(RX-LX),yC=v=>bottom-v/maxC*(bottom-top),yE=v=>bottom-v/maxE*(bottom-top),bw=Math.max(2,(RX-LX)/(end-start+1)*.72);
 let content='';for(let j=0;j<=3;j++){const y=bottom-j/3*(bottom-top);content+=svg('line',{x1:LX,x2:RX,y1:y,y2:y,stroke:'#edf0e8'})+svg('text',{x:LX-10,y:y+3,'text-anchor':'end',class:'chart-axis'},fmt(maxC*j/3))+svg('text',{x:RX+8,y:y+3,class:'chart-axis'},fmt(maxE*j/3));}
 for(const p of series)content+=svg('rect',{x:x(p.t)-bw/2,y:yC(p.count),width:bw,height:bottom-yC(p.count),fill:p.t===instant?'#758c63':'#c4d1bb',rx:1});
 let last=null;const paths=[];for(const p of series){if(last!==null&&p.t!==last+1)paths.push('');if(!paths.length)paths.push('');paths[paths.length-1]+=`${paths.at(-1)?' L':'M'}${x(p.t)},${yE(p.excess||0)}`;last=p.t;}for(const d of paths)content+=svg('path',{d,fill:'none',stroke:'#b36637','stroke-width':2});
 for(const peak of e?.peaks||[])content+=svg('path',{d:`M${x(peak.t)},${yE(peak.excess)-6} l4,4 l-4,4 l-4,-4 Z`,fill:'#bf823e'});
 if(instant>=start&&instant<=end)content+=svg('line',{x1:x(instant),x2:x(instant),y1:top,y2:bottom,stroke:'#355744','stroke-width':1,'stroke-dasharray':'3 3'});
 const ticks=new Set([start,end,...Array.from({length:5},(_,i)=>Math.round(start+(end-start)*i/4))]);for(const t of ticks)content+=svg('text',{x:x(t),y:122,'text-anchor':'middle',class:'chart-axis'},timeLabel(t));
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
function inspectStation(s){$('station-details').open=true;chooseStation(s);$('station-details').scrollIntoView({block:'nearest',behavior:'smooth'});}
function chooseStation(s){
 stationIndex=s;if(!meta)return;const p=meta.stations[s];weather.inspectStation(p);
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
 stop();request++;setBusy(true);notify('Calcul local des références, des persistances et des groupes territoriaux…');
 worker.postMessage({type:initial?'init':'analyse',meta:initial?meta:undefined,buffer:initial?values.buffer.slice(0):undefined,settings,request});
}
function populateMethod(){
 $('method-content').innerHTML=`<h3>1 · Une variation remarquable à chaque balise</h3><p>La référence est la médiane des 72 premières heures, avec au moins 48 heures mesurées. La variabilité est le maximum de 1,4826 × MAD et de 1,5 nSv/h. Une variation positive doit dépasser le seuil de sensibilité et persister 2 heures. Les lacunes interrompent la persistance.</p><h3>2 · Des zones simultanées</h3><p>Les balises actives sont regroupées par proximité à chaque heure. Une zone contient au moins le nombre de balises demandé. Le voisinage peut se prolonger par chaînage ; l’enveloppe convexe relie les balises, sans représenter une surface contaminée.</p><h3>3 · Un cluster avec ses branches</h3><p>Deux emprises consécutives sont liées si une part suffisante de leurs cellules actives se trouve à proximité. La liaison ne nécessite pas les mêmes balises. Plusieurs liens sortants décrivent une séparation ; plusieurs liens entrants une fusion. Le cluster conserve toutes ces branches.</p><h3>4 · Un déplacement, et pas seulement une grande étendue</h3><p>Le suivi des cellules de 50 km nouvellement actives recherche une progression dans l’ordre temporel, compatible avec les liaisons des zones. Une activation simultanée de tout le territoire ne suffit pas. Une route doit durer au moins ${result?.settings?.minHours??defaults.minHours} heures et son déplacement net représenter au moins 55 % de sa longueur. La distance minimale demandée filtre ces routes.</p><h3>Portée du résultat</h3><p>Les liens décrivent une continuité spatiale et temporelle, sans prouver une origine physique commune. Des fusions accidentelles et des branches dues aux seuils restent possibles ; examinez la carte et les mesures, et comparez les sensibilités. ${meta.missingLots.length} lots sont absents, avec ${fmt(meta.coverage*100,1)} % de couverture horaire. Le seuil ne constitue pas un test de significativité.</p><p>Les calculs sont exécutés dans votre navigateur. Les fichiers importés ne sont transmis à aucun serveur. Le fond détaillé charge des tuiles OpenStreetMap ; aucune mesure ne lui est transmise.</p><p><a href="CLUSTERS.md" target="_blank">Lire le protocole complet ↗</a></p>`;
}
function exportEvent(){
 if(!selected)return;const ids=new Set(selected.ids),observations=[];
 for(const s of ids)for(let t=0;t<meta.T;t++){const v=values[s*meta.T+t];if(Number.isFinite(v))observations.push({stationId:meta.stations[s].id,time:dateISO(t),value:v});}
 const event={...selected,nodes:selected.nodes.map(n=>({id:n.id,time:dateISO(n.t),stationIds:n.ids.map(s=>meta.stations[s].id),center:n.center,parents:n.parents,children:n.children,area:n.area})),ids:selected.ids.map(s=>meta.stations[s].id),start:dateISO(selected.start),end:dateISO(selected.end),peakTime:dateISO(selected.peakTime),series:selected.series.map(p=>({...p,time:dateISO(p.t)})),route:selected.route?{...selected.route,points:selected.route.points.map(p=>({...p,time:dateISO(p.t)}))}:null};
 const bundle={schema:'remanence-clusters-v2',name:`Cluster descriptif ${selected.id}`,unit:'nSv/h',synthetic:false,stations:[...ids].map(s=>meta.stations[s]),observations,analysisSettings:result.settings,event,provenance:{source:meta.sourceKind==='local'?'Dossier local REMAP':'Jeu en ligne REMAP',sourceName:meta.sourceName,datasetId:meta.datasetId,datasetLabel:meta.datasetLabel,start:meta.start,end:meta.end,validLots:meta.validLots,plannedLots:meta.plannedLots,missingLots:meta.missingLots,invalidLots:meta.invalidLots||[],duplicateCount:meta.duplicateCount||0,method:'CLUSTERS.md'}};
 const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`remap-evenement-${selected.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cancelGif(){gifWorker?.terminate();gifWorker=null;$('gif-cancel').hidden=true;$('gif-generate').disabled=false;$('gif-generate').textContent=gifUrl?'Recréer le GIF':'Générer le GIF · 3 secondes';}
function clearGif(){cancelGif();$('gif-preview').removeAttribute('src');$('gif-result').hidden=true;if(gifUrl)URL.revokeObjectURL(gifUrl);gifUrl=null;}
function openExport(){
 if(!selected||busy)return;stop();clearGif();$('export-title').textContent=`Exporter le cluster ${String(selected.id).padStart(2,'0')}`;
 $('gif-status').textContent='Le GIF parcourt tout le cluster en 3 secondes, en boucle. La vue européenne comprend le réseau, les zones horaires, leurs liaisons et la courbe d’activité. Un repère mondial conserve les sites hors Europe.';
 $('gif-generate').textContent='Générer le GIF · 3 secondes';$('export-dialog').showModal();
}
function generateGif(){
 if(!selected||gifWorker||busy)return;clearGif();
 const event={...selected},snapshot={event,stations:meta.stations,settings:result.settings,weather:weather.gifSnapshot(),meta:{origin:meta.origin,start:meta.start,end:meta.end,coverage:meta.coverage,missingLots:meta.missingLots.length}};
 const filename=`bouffi-cluster-${event.id}-${new Date(meta.origin+event.start*3600000).toISOString().slice(0,10)}.gif`;
 $('gif-generate').disabled=true;$('gif-cancel').hidden=false;$('gif-status').textContent='Préparation de la carte et de l’animation…';
 const target=new Worker('./gif-worker.mjs?v=weather-20261021',{type:'module'});gifWorker=target;
 target.onmessage=({data:m})=>{if(gifWorker!==target)return;
  if(m.type==='progress'){$('gif-status').textContent=m.message;return;}
  if(m.type==='error'){cancelGif();$('gif-status').textContent='Export non généré : '+m.message;return;}
  if(m.type==='done'){
   gifUrl=URL.createObjectURL(new Blob([m.buffer],{type:'image/gif'}));$('gif-preview').src=gifUrl;$('gif-preview').alt=`Évolution du cluster ${event.id} sur la carte de l’Europe, du ${timeLabel(event.start)} au ${timeLabel(event.end)} UTC.`;
   $('gif-download').href=gifUrl;$('gif-download').download=filename;$('gif-result').hidden=false;
   $('gif-status').textContent=`GIF prêt · 3 secondes · ${m.width} × ${m.height} pixels · ${m.frames} images · ${fmt(m.buffer.byteLength/1048576,1)} Mo. Généré dans votre navigateur.`;cancelGif();
  }
 };
 target.onerror=()=>{if(gifWorker!==target)return;cancelGif();$('gif-status').textContent='La création du GIF a échoué. Réessayez ; les données du cluster restent disponibles en JSON.';};
 target.postMessage(snapshot);
}
$('gif-generate').onclick=generateGif;$('gif-cancel').onclick=()=>{cancelGif();$('gif-status').textContent='Génération annulée.';};$('export-json').onclick=exportEvent;
$('export-dialog').onclose=clearGif;
$('search').oninput=renderList;$('sort').onchange=renderList;$('fit').onclick=frameSelected;$('basemap').onclick=toggleBasemap;
if($('tracks'))$('tracks').onclick=()=>{$('tracks').setAttribute('aria-pressed',$('tracks').getAttribute('aria-pressed')!=='true');renderTime();};
if($('restart'))$('restart').onclick=()=>{if(!selected)return;stop();instant=selected.start;renderTime();};
function showNamedStation(){if(!meta||!result)return;const s=meta.stations.findIndex(p=>p.id.toUpperCase()===$('station-find').value.trim().toUpperCase());if(s<0){notify('Cette balise est absente du jeu local.',true);return;}const e=result.events.find(e=>e.ids.includes(s));if(e&&e.id!==selected?.id)selectEvent(e.id);if(e){stop();const times=e.nodes.filter(n=>n.ids.includes(s)).map(n=>n.t);instant=times.reduce((a,b)=>values[s*meta.T+a]>=values[s*meta.T+b]?a:b,times[0]);renderTime();}chooseStation(s);}
if($('station-find')){$('station-find').onchange=showNamedStation;$('station-find').onkeydown=e=>{if(e.key==='Enter')showNamedStation();};}if($('station-go'))$('station-go').onclick=showNamedStation;
$('network').onclick=()=>{networkOn=!networkOn;$('network').setAttribute('aria-pressed',networkOn);if(networkOn){if(!networkLayer.getLayers().length)drawNetwork();networkLayer.addTo(map);}else map.removeLayer(networkLayer);};
$('time').oninput=()=>{stop();instant=Number($('time').value);renderTime();};$('previous').onclick=()=>{stop();instant=Math.max(Number($('time').min),instant-1);renderTime();};$('next').onclick=()=>{stop();instant=Math.min(Number($('time').max),instant+1);renderTime();};$('play').onclick=play;$('speed').onchange=()=>{if(timer){stop();play();}};
$('station-select').onchange=()=>chooseStation(Number($('station-select').value));$('export').onclick=exportEvent;
$('gif-export').onclick=()=>{if(!selected||busy)return;openExport();generateGif();};
$('lineage-details').ontoggle=()=>{if($('lineage-details').open)drawLineage();};
$('settings-open').onclick=()=>{$('settings-error').textContent='';$('settings').showModal();};$('method-open').onclick=()=>{$('method').showModal();};for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
 $('reset').onclick=()=>{for(const [key,value] of Object.entries(defaults)){const control=$('settings-form').elements[key];if(control)control.value=value;}$('sensitivity').value='low';};
function currentSettings(){const settings=Object.fromEntries([...new FormData($('settings-form'))].map(([k,v])=>[k,Number(v)])),presets={high:{z:3,minExcess:3},normal:{z:4,minExcess:5},low:{z:6,minExcess:10}};return Object.assign(settings,presets[$('sensitivity').value]);}
$('settings-form').onsubmit=event=>{event.preventDefault();const settings=currentSettings();if(settings.minBaseline>settings.baselineHours||settings.baselineHours>=meta.T){$('settings-error').textContent='La période de référence doit être plus courte que le jeu de données et contenir le minimum d’heures demandé.';return;}recalculate(settings);};
function setBusy(value){busy=value;$('settings-open').disabled=value||!meta;$('settings-form').querySelector('[type=submit]').disabled=value;for(const id of ['import-folder','source-select','online-dataset','load-online'])$(id).disabled=value;for(const id of ['export','gif-export'])$(id).disabled=value||!selected;}
function updateSourceControls(){const local=$('source-select').value==='local';$('local-controls').hidden=!local;$('online-controls').hidden=local;}
function updateDataset(){
 weather.loadDataset(meta.datasetId);
 $('data-stations').textContent=fmt(meta.N);$('data-measures').textContent=fmt(meta.rawCount);$('data-coverage').textContent=fmt(meta.coverage*100,1)+' %';$('time').max=meta.T-1;
 const dates=`${timeLabel(0)} → ${new Date(meta.end).toLocaleString('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} UTC`;
 $('dataset-period').textContent=`RECHERCHE SUR TOUT LE RÉSEAU · ${new Date(meta.start).toLocaleDateString('fr-FR',{timeZone:'UTC'})} — ${new Date(meta.end).toLocaleDateString('fr-FR',{timeZone:'UTC'})}`;
 $('data-summary').textContent=meta.sourceKind==='local'?`Dossier local · ${meta.sourceName}`:`En ligne · ${meta.datasetLabel||'collecte REMAP'}`;
 $('data-origin').textContent=(meta.sourceKind==='local'?`Dossier local : ${meta.sourceName}`:`Jeu en ligne : ${meta.datasetLabel||'collecte REMAP'}`)+' · '+dates;
 $('source-select').value=meta.sourceKind==='local'?'local':'online';if(meta.datasetId)$('online-dataset').value=meta.datasetId;updateSourceControls();$('import-report').hidden=false;
 const entry=catalogue?.datasets.find(d=>d.id===meta.datasetId);$('download-collection').hidden=!entry?.archive;if(entry?.archive)$('download-collection').href=entry.archive;
 const lines=[`${meta.validLots} / ${meta.plannedLots} lots valides`,`${meta.missingLots.length} lots absents · ${(meta.invalidLots||[]).length} lots invalides exclus`,`${fmt(meta.rawCount)} observations · ${fmt(meta.coverage*100,1)} % de couverture horaire`];
 if(meta.duplicateCount)lines.push(`${meta.duplicateCount} doublons identiques retirés`);
 for(const id of meta.missingLots)lines.push(`Absent : ${id}`);for(const p of meta.invalidLots||[])lines.push(`Exclu : ${p.id} — ${p.error}`);
 $('import-diagnostic').textContent=lines.join('\n');
}
function displayResult(next){
 result=next;populateMethod();$('settings').close();$('criteria-note').textContent=`Au moins ${result.settings.minStations} balises par zone · déplacement ≥ ${result.settings.minTravel} km · durée ≥ ${result.settings.minHours} h`;
 notify(`${result.events.length} ${result.events.length===1?'cluster en déplacement retenu':'clusters en déplacement retenus'} sur ${result.allEvents.length} ensembles · ${fmt(result.zoneCount)} zones horaires · ${meta.missingLots.length} lots absents · ${(meta.invalidLots||[]).length} lots invalides exclus`);
 if(result.events.length)selectEvent(orderedEvents()[0].id);else{selected=null;eventLayer.clearLayers();currentLayer.clearLayers();renderList();instant=Math.min(meta.T-1,result.settings.baselineHours);renderTime();$('map-context').textContent='RÉSEAU IMPORTÉ';$('map-title').textContent='Aucun événement avec ces critères';$('timeline-title').textContent='Activité globale · ajustez les critères pour regrouper les écarts';$('event-facts').innerHTML='';$('lineage').innerHTML='';$('route-note').textContent='Aucun cluster satisfait ces critères de déplacement. Les mesures restent consultables.';$('station-select').innerHTML=meta.stations.map((s,i)=>`<option value="${i}">${escape(s.id)}</option>`).join('');chooseStation(0);}
 for(const id of ['export','gif-export'])$(id).disabled=busy||!selected;
}
function bindWorker(target){target.onmessage=event=>{const m=event.data;if(m.request!==request)return;setBusy(false);if(m.type==='error'){$('settings-error').textContent=m.message;notify(m.message,true);return;}displayResult(m.result);};target.onerror=()=>{setBusy(false);notify('Le calcul a échoué. Rechargez les données ou ajustez les critères.',true);};}
function clearDatasetView(){stop();selected=null;result=null;stationIndex=undefined;instant=0;eventLayer.clearLayers();currentLayer.clearLayers();networkLayer.clearLayers();$('search').value='';$('station-find').value='';$('lineage').innerHTML='';$('station-chart').innerHTML='';}
function importFinished(){importWorker=null;$('cancel-import').hidden=true;setBusy(false);}
$('import-folder').onclick=()=>{$('folder-input').value='';$('folder-input').click();};
$('cancel-import').onclick=()=>{importWorker?.terminate();importFinished();$('import-status').textContent='Import annulé. Les données affichées sont conservées.';};
$('folder-input').onchange=()=>{
 const files=[...$('folder-input').files];if(!files.length||busy)return;stop();setBusy(true);$('cancel-import').hidden=false;$('import-status').textContent='Lecture locale du manifeste et vérification des lots…';
 const candidate=new Worker('./worker.mjs?v=defaults-20261020',{type:'module'});importWorker=candidate;
 candidate.onmessage=event=>{const m=event.data;if(importWorker!==candidate)return;
  if(m.type==='progress'){$('import-status').textContent=`Vérification : ${fmt(m.completed)} / ${fmt(m.total)} lots · ${fmt(m.observations)} observations lues${m.completed===m.total?' · calcul des événements…':''}`;return;}
  if(m.type==='error'){candidate.terminate();importFinished();$('import-status').textContent='Import non chargé : '+m.message;return;}
  if(m.type!=='imported')return;
  worker?.terminate();worker=candidate;sourceEpoch++;request=m.request;clearDatasetView();meta=m.meta;values=new Float64Array(m.buffer);bindWorker(worker);updateDataset();displayResult(m.result);if(networkOn)drawNetwork();importFinished();$('import-status').textContent='Dossier importé dans cet onglet. Aucun fichier transmis ; réimportez-le après un rechargement de la page.';
 };
 candidate.onerror=()=>{if(importWorker!==candidate)return;candidate.terminate();importFinished();$('import-status').textContent='L’import a échoué. Les données affichées sont conservées.';};
 candidate.postMessage({type:'import',files,settings:result?.settings||currentSettings(),request:request+1});
};
async function loadOnline(){
 if(busy)return;const entry=catalogue?.datasets.find(d=>d.id===$('online-dataset').value);if(!entry){$('import-status').textContent='Aucun jeu en ligne disponible. Vous pouvez importer un dossier local.';return;}
 const epoch=++sourceEpoch,nextRequest=request+1;let candidate;setBusy(true);stop();$('import-status').textContent=`Chargement : ${entry.label}…`;
 try{const responses=await Promise.all([fetch(entry.meta),fetch(entry.values)]);if(responses.some(r=>!r.ok))throw new Error('Ce jeu en ligne est indisponible. Les données précédentes sont conservées.');
  const nextMeta=await responses[0].json(),nextValues=new Float64Array(await responses[1].arrayBuffer());validateHourly(nextMeta,nextValues);if(epoch!==sourceEpoch)return;
  nextMeta.sourceKind='online';nextMeta.datasetId=entry.id;nextMeta.datasetLabel=entry.label;
  candidate=new Worker('./worker.mjs?v=defaults-20261020',{type:'module'});$('import-status').textContent=`Calcul des événements : ${entry.label}…`;
  candidate.onmessage=event=>{const m=event.data;if(epoch!==sourceEpoch)return;if(m.type==='error'){candidate.terminate();setBusy(false);$('import-status').textContent=m.message;return;}
   worker?.terminate();worker=candidate;request=nextRequest;clearDatasetView();meta=nextMeta;values=nextValues;bindWorker(worker);updateDataset();displayResult(m.result);if(networkOn)drawNetwork();setBusy(false);$('import-status').textContent='Jeu disponible en ligne, analysé dans votre navigateur. Vous pouvez changer de période ou importer une collecte depuis votre ordinateur.';
  };
  candidate.onerror=()=>{if(epoch!==sourceEpoch)return;candidate.terminate();setBusy(false);$('import-status').textContent='Le calcul du jeu en ligne a échoué. Les données précédentes sont conservées.';};
  candidate.postMessage({type:'init',meta:nextMeta,buffer:nextValues.buffer.slice(0),settings:result?.settings||currentSettings(),request:nextRequest});
 }catch(e){if(epoch===sourceEpoch){candidate?.terminate();setBusy(false);$('import-status').textContent=e.message;notify(e.message,true);}}
}
$('source-select').onchange=updateSourceControls;$('load-online').onclick=loadOnline;
setBusy(true);await setupMap();
try{setBusy(true);const response=await fetch('./data/catalogue.json?v=online-catalogue-20261020');if(!response.ok)throw new Error('Catalogue indisponible. Vous pouvez importer un dossier local.');catalogue=validateCatalogue(await response.json());$('online-dataset').innerHTML=catalogue.datasets.map(d=>`<option value="${escape(d.id)}">${escape(d.label)}</option>`).join('');$('online-dataset').value=catalogue.defaultDataset;setBusy(false);await loadOnline();}
catch(e){setBusy(false);$('import-status').textContent=e.message;notify(e.message,true);}
