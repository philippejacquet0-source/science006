import {GIFEncoder,quantize,applyPalette} from './vendor/gifenc.mjs';
import {hull} from './engine.mjs';
import {framePlan,europeView,gifSize} from './gif-plan.mjs';
import {HOUR,frameAt,cellBounds,forecastEligible} from './weather-engine.mjs';

const ink='#233f39',muted='#66786d',orange='#b85e31',green='#547962',paper='#f5f5ed',water='#e4eeef';
const mapBox={x:28,y:164,w:910,h:640};
const number=v=>v.toLocaleString('fr-FR',{maximumFractionDigits:0});
function text(ctx,value,x,y,size=16,color=ink,weight='normal'){ctx.font=`${weight} ${size}px sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y);}
function dot(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function pathGeometry(ctx,g,project){
 const line=(points,close=false)=>{points.forEach(([lon,lat],i)=>{const [x,y]=project(lon,lat);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});if(close)ctx.closePath();};
 if(g.type==='Polygon')g.coordinates.forEach(p=>line(p,true));
 else if(g.type==='MultiPolygon')g.coordinates.forEach(p=>p.forEach(r=>line(r,true)));
 else if(g.type==='LineString')line(g.coordinates);
 else if(g.type==='MultiLineString')g.coordinates.forEach(p=>line(p));
}
function drawFeatures(ctx,features,project,{fill,stroke,width=1}={}){
 ctx.lineWidth=width;for(const f of features){ctx.beginPath();pathGeometry(ctx,f.geometry,project);if(fill){ctx.fillStyle=fill;ctx.fill('evenodd');}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
}
function clipMap(ctx){ctx.beginPath();ctx.rect(mapBox.x,mapBox.y,mapBox.w,mapBox.h);ctx.clip();}
function wrapped(ctx,value,x,y,width,size=15,lineHeight=22,color=muted){
 ctx.font=`${size}px sans-serif`;let line='';for(const word of value.split(' ')){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){text(ctx,line,x,y,size,color);y+=lineHeight;line=word;}else line=next;}if(line)text(ctx,line,x,y,size,color);return y+lineHeight;
}
function date(origin,t){return new Date(origin+t*3600000).toLocaleString('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function legend(ctx,x,y,color,label,r=3){dot(ctx,x+4,y-5,r,color);text(ctx,label,x+18,y,14,muted);}

function makeBackground(model,geo,world,view,plan){
 const {event:e,meta,stations,settings}=model,canvas=new OffscreenCanvas(gifSize.width,gifSize.height),ctx=canvas.getContext('2d');
 ctx.fillStyle=paper;ctx.fillRect(0,0,canvas.width,canvas.height);
 text(ctx,'Bouffi',28,43,28,ink,'bold');text(ctx,model.weather?'EAU & PRÉCIPITATIONS GFS · MESURES REMAP':'ÉVOLUTION TERRITORIALE · DONNÉES REMAP',155,42,14,muted);
 text(ctx,`Cluster ${String(e.id).padStart(2,'0')} · ${e.countries.length} pays`,28,91,32,ink,'bold');
 text(ctx,`${date(meta.origin,e.start)} → ${date(meta.origin,e.end)} ${new Date(meta.origin).getUTCFullYear()} · UTC`,28,125,19,muted);
 text(ctx,'3 secondes · lecture en boucle',970,49,17,muted);text(ctx,`${e.duration} cases horaires`,970,79,17,ink,'bold');
 ctx.save();clipMap(ctx);ctx.fillStyle=water;ctx.fillRect(mapBox.x,mapBox.y,mapBox.w,mapBox.h);
 drawFeatures(ctx,geo.countries,view.project,{fill:'#f6f4e9',stroke:'#b5bfb3',width:.8});
 drawFeatures(ctx,geo.regions,view.project,{stroke:'#d6d9ca',width:.55});
 drawFeatures(ctx,geo.lakes,view.project,{fill:water,stroke:'#cadbdf',width:.5});
 drawFeatures(ctx,geo.rivers,view.project,{stroke:'#c2d6dc',width:.8});
 const occupied=[];
 function label(value,p,size,color,weight='normal'){
  const [x,y]=view.project(...p);ctx.font=`${weight} ${size}px sans-serif`;const w=ctx.measureText(value).width,rect=[x-w/2-4,y-size-2,x+w/2+4,y+3];
  if(!view.visible([rect[0],rect[1]])||!view.visible([rect[2],rect[3]])||occupied.some(r=>rect[0]<r[2]&&rect[2]>r[0]&&rect[1]<r[3]&&rect[3]>r[1]))return;
  occupied.push(rect);ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#f6f4e9';ctx.strokeText(value,x,y);text(ctx,value,x,y,size,color,weight);ctx.textAlign='left';
 }
 for(const f of geo.countries)label(f.properties.name,f.properties.label,13,'#849285');
 for(const f of geo.cities){const p=f.geometry.coordinates,[x,y]=view.project(...p);if(view.visible([x,y])){dot(ctx,x,y,1.6,'#a2aaa0');label(f.properties.name,[p[0],p[1]+.3],11,'#85918a');}}
 for(const p of stations){const [x,y]=view.project(p.lon,p.lat);dot(ctx,x,y,1.15,'#84968d');}
 for(const s of e.ids){const p=stations[s],[x,y]=view.project(p.lon,p.lat);dot(ctx,x,y,1.7,'#65816d');}
 ctx.restore();ctx.strokeStyle='#ced7cc';ctx.strokeRect(mapBox.x,mapBox.y,mapBox.w,mapBox.h);
 // Metric scale: inverse spherical Mercator at the scale bar's latitude.
 const a=view.project(10,50),b=view.project(11,50),pixels500=Math.abs(b[0]-a[0])*500/(111.195*Math.cos(50*Math.PI/180));
 ctx.fillStyle='#fffffff0';ctx.fillRect(46,748,220,40);ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(58,770);ctx.lineTo(58+pixels500,770);ctx.stroke();text(ctx,'500 km à 50° N',58,762,12,muted);
 text(ctx,'Natural Earth 1:50m · domaine public',mapBox.x+mapBox.w-290,792,12,muted);
 const sx=966;let y=190;
 text(ctx,`${number(e.ids.length)} balises`,sx,y,27,ink,'bold');text(ctx,'distinctes dans le cluster',sx,y+25,15,muted);y+=72;
 text(ctx,`${number(e.travel)} km`,sx,y,27,ink,'bold');text(ctx,'déplacement net d’une branche',sx,y+25,15,muted);y+=65;
 text(ctx,`${e.branches} séparations · ${e.mergers} fusions`,sx,y,16,ink,'bold');y+=37;
 legend(ctx,sx,y,'#84968d','Réseau complet');y+=25;legend(ctx,sx,y,'#65816d','Balises du cluster');y+=25;legend(ctx,sx,y,orange,'Balises actives à cette heure',4);y+=26;
 text(ctx,'Pointillés : deux heures précédentes',sx,y,13,muted);y+=22;text(ctx,'Traits : liaisons entre zones',sx,y,13,muted);y+=30;
 text(ctx,'CRITÈRES DE RECHERCHE',sx,y,13,ink,'bold');y+=23;
 y=wrapped(ctx,`Sensibilité ${settings.z===6?'faible':settings.z===3?'haute':'moyenne'} · au moins ${settings.minStations} balises · voisinage ${settings.radius} km · liaison ${settings.maxSpeed} km par heure · progression ≥ ${settings.minHours} h · déplacement ≥ ${settings.minTravel} km`,sx,y,280,14,21);
 y+=15;text(ctx,`RÉSEAU : ${number(stations.length)} BALISES`,sx,y,13,ink,'bold');
 const wb={x:sx,y:y+14,w:278,h:108},worldProject=(lon,lat)=>[wb.x+(lon+180)/360*wb.w,wb.y+(90-lat)/180*wb.h];
 ctx.fillStyle=water;ctx.fillRect(wb.x,wb.y,wb.w,wb.h);ctx.save();ctx.beginPath();ctx.rect(wb.x,wb.y,wb.w,wb.h);ctx.clip();drawFeatures(ctx,world.features,worldProject,{fill:'#f6f4e9',stroke:'#cbd4cb',width:.3});
 for(const p of stations){const [x,y]=worldProject(p.lon,p.lat);dot(ctx,x,y,.7,'#718b7e');}for(const s of e.ids){const p=stations[s],[x,y]=worldProject(p.lon,p.lat);dot(ctx,x,y,1,orange);}ctx.restore();
 text(ctx,'Repère mondial · sites hors Europe inclus',sx,wb.y+wb.h+19,12,muted);
 // The full curve provides temporal context, including hours with no zone.
 ctx.fillStyle='#fff';ctx.fillRect(28,824,1224,138);text(ctx,'BALISES ACTIVES DANS LE CLUSTER',48,850,13,muted,'bold');
 const chart={x:50,y:875,w:1080,h:52},series=new Map(e.series.map(p=>[p.t,p])),step=chart.w/e.duration;
 for(let t=e.start;t<=e.end;t++){const h=(series.get(t)?.count||0)/Math.max(1,e.maxCount)*chart.h;ctx.fillStyle='#b6c7af';ctx.fillRect(chart.x+(t-e.start)*step,chart.y+chart.h-h,Math.max(1,step*.72),h);}
 text(ctx,date(meta.origin,e.start),50,949,13,muted);ctx.textAlign='right';text(ctx,date(meta.origin,e.end),1130,949,13,muted);ctx.textAlign='left';
 text(ctx,`${e.maxCount}`,1155,890,25,ink,'bold');text(ctx,'maximum',1155,913,13,muted);
 const sampled=plan.length<e.duration?`${plan.length} instants horaires sur ${e.duration}`:'Toutes les cases horaires du cluster';
 const partial=new Date(meta.end).getTime()<meta.origin+(e.end+1)*3600000?' · dernière case partielle':'';
 text(ctx,`${sampled}${partial} · sans interpolation · UTC · clusters descriptifs, sans attribution de cause`,28,988,13,muted);
 return {canvas,chart};
}

function drawFrame(ctx,background,model,view,t,outlines){
 const {event:e,meta}=model;ctx.drawImage(background.canvas,0,0);ctx.save();clipMap(ctx);
 if(model.weather){
  const {pack,mode,opacity,lead}=model.weather,epoch=meta.origin+t*HOUR;
  const frame=forecastEligible(pack,epoch)?frameAt(pack,epoch+lead*HOUR):null;
  if(frame)for(let i=0;i<frame.rain.length;i++){
   const bounds=cellBounds(pack.grid,i),a=view.project(bounds[0][1],bounds[1][0]),b=view.project(bounds[1][1],bounds[0][0]);
   const w=frame.water[i],r=frame.rain[i];
   if(mode!=='rain'&&w!==null){const f=Math.min(1,Math.max(0,w/45));ctx.fillStyle=`rgba(${Math.round(215-140*f)},${Math.round(226-150*f)},${Math.round(240-65*f)},${opacity*.62})`;ctx.fillRect(a[0],a[1],b[0]-a[0]+.6,b[1]-a[1]+.6);}
   if(mode!=='water'&&r!==null&&r>=.05){const f=Math.min(1,Math.log1p(r)/Math.log(6));ctx.fillStyle=`rgba(${Math.round(45+100*f)},${Math.round(161-95*f)},${Math.round(190+30*f)},${opacity*(.35+.6*f)})`;ctx.fillRect(a[0],a[1],b[0]-a[0]+.6,b[1]-a[1]+.6);}
  }
 }
 const byId=new Map(e.nodes.map(n=>[n.id,n]));
 ctx.lineWidth=1.8;ctx.strokeStyle=green;ctx.globalAlpha=.6;
 for(const link of e.links){const a=byId.get(link.from),b=byId.get(link.to);if(b.t>t||b.t<t-5)continue;const pa=view.project(a.center.lon,a.center.lat),pb=view.project(b.center.lon,b.center.lat);ctx.beginPath();ctx.moveTo(...pa);ctx.lineTo(...pb);ctx.stroke();}
 for(const n of e.nodes.filter(n=>n.t>=t-2&&n.t<t)){ctx.beginPath();outlines.get(n.id).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.setLineDash([4,4]);ctx.strokeStyle=green;ctx.lineWidth=1;ctx.stroke();}
 ctx.setLineDash([]);ctx.globalAlpha=1;
 for(const n of e.nodes.filter(n=>n.t===t)){
  ctx.beginPath();outlines.get(n.id).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle='#ba71352b';ctx.fill();ctx.strokeStyle=orange;ctx.lineWidth=1.3;ctx.stroke();
  for(const s of n.ids){const p=model.stations[s],[x,y]=view.project(p.lon,p.lat);dot(ctx,x,y,3.8,'#fff');dot(ctx,x,y,2.8,orange);}
 }
 ctx.restore();const at=e.series.find(p=>p.t===t),count=at?.count||0;
 ctx.fillStyle='#fffffff2';ctx.fillRect(46,182,380,81);text(ctx,date(meta.origin,t)+' UTC',62,211,22,ink,'bold');
 text(ctx,`${count} balises actives · ${at?.zones||0} ${(at?.zones||0)===1?'zone':'zones'}`,62,242,17,muted);
 if(model.weather){
  const {pack,lead}=model.weather,epoch=meta.origin+t*HOUR,available=forecastEligible(pack,epoch)&&frameAt(pack,epoch+lead*HOUR);
  ctx.fillStyle='#fffffff0';ctx.fillRect(46,274,620,57);
  text(ctx,available?`${pack.source.kind==='forecast'?'PRÉVISION MÉTÉO':'RECONSTITUTION MÉTÉO'}${lead?` +${lead} H`:''} · ${date(meta.origin,t+lead)} UTC`:'MÉTÉO ABSENTE OU CALCUL TROP RÉCENT À CET INSTANT',58,294,13,'#365969','bold');
  text(ctx,`Violet : eau précipitable · bleu : pluie · NOAA GFS / Open-Meteo · grille ${pack.grid.step}°`,58,316,12,muted);
 }
 // Dynamic values occupy a fixed strip above the temporal chart.
 const excess=Number.isFinite(at?.excess)?`+${at.excess.toLocaleString('fr-FR',{maximumFractionDigits:1})} nSv/h`:'—';
 text(ctx,`Excès médian : ${excess}`,550,850,15,orange,'bold');
 const {chart}=background,x=chart.x+(t-e.start+.5)/e.duration*chart.w;ctx.strokeStyle=orange;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,867);ctx.lineTo(x,932);ctx.stroke();
}

self.onmessage=async ({data:model})=>{try{
 if(typeof OffscreenCanvas==='undefined')throw new Error('Ce navigateur ne permet pas cet export GIF. Utilisez une version récente de Chrome, Edge ou Firefox.');
 self.postMessage({type:'progress',message:'Chargement du fond européen détaillé…'});
 const responses=await Promise.all([fetch('./data/europe-export.geojson'),fetch('./data/countries.geojson')]);if(responses.some(r=>!r.ok))throw new Error('Le fond cartographique est indisponible. Réessayez après le chargement de la page.');
 const [geo,world]=await Promise.all(responses.map(r=>r.json())),plan=framePlan(model.event.start,model.event.end),view=europeView(model.stations,model.event,mapBox);
 const background=makeBackground(model,geo,world,view,plan),canvas=new OffscreenCanvas(gifSize.width,gifSize.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const outlines=new Map(model.event.nodes.map(n=>[n.id,hull(n.ids.map(s=>model.stations[s])).map(([lon,lat])=>view.project(lon,lat))]));
 const gif=GIFEncoder();let palette;
 for(let i=0;i<plan.length;i++){
  drawFrame(ctx,background,model,view,plan[i].t,outlines);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  if(!palette)palette=quantize(pixels,256);
  gif.writeFrame(applyPalette(pixels,palette),canvas.width,canvas.height,{palette:i===0?palette:undefined,delay:plan[i].delay,repeat:0});
  self.postMessage({type:'progress',message:`Création du GIF : ${i+1} / ${plan.length} images`,completed:i+1,total:plan.length});
 }
 gif.finish();const bytes=gif.bytes();self.postMessage({type:'done',buffer:bytes.buffer,frames:plan.length,width:gifSize.width,height:gifSize.height},[bytes.buffer]);
}catch(error){self.postMessage({type:'error',message:error.message});}};
