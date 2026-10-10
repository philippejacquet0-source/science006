import {analyse,distance} from './engine.mjs';
export const clusterDefaults={baselineHours:72,minBaseline:48,z:4,noise:1.5,minExcess:5,duration:2,radius:120,minStations:4,minArea:0,peakSeparation:6,peakProminence:10,maxSpeed:40,minTravel:1000,minHours:8,minCoherence:.55};
const median=a=>{const b=[...a].sort((x,y)=>x-y),i=b.length>>1;return b.length%2?b[i]:(b[i-1]+b[i])/2;};
function cells(ids,stations){const groups=new Map();for(const s of ids){const p=stations[s],key=`${Math.floor(p.lat*111.195/50)}|${Math.floor(p.lon*111.195*Math.cos(p.lat*Math.PI/180)/50)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}return [...groups.entries()].map(([key,ps])=>({key,lat:median(ps.map(p=>p.lat)),lon:median(ps.map(p=>p.lon))}));}
function proximity(a,b,reach){let nearA=0,nearB=0,min=Infinity;const inB=new Set();for(const p of a.cells){let near=false;for(let j=0;j<b.cells.length;j++){const d=distance(p,b.cells[j]);min=Math.min(min,d);if(d<=reach){near=true;inB.add(j);}}if(near)nearA++;}nearB=inB.size;return {a:nearA/a.cells.length,b:nearB/b.cells.length,nearA,nearB,min};}
function union(n){const parents=Array.from({length:n},(_,i)=>i),find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};return {find,join:(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;}};}
export function clusterNetwork(meta,values,settings={}){
 const p={...clusterDefaults,...settings};if(p.maxSpeed<=0||p.minTravel<0||p.minHours<1||p.minCoherence<0||p.minCoherence>1)throw new Error('Paramètres de déplacement incompatibles.');
 // Amplitude and persistence only. No profile matching and no individual peak
 // selection contributes to zone detection or temporal links.
 const detection=analyse(meta,values,p),nodes=detection.events.flatMap(e=>e.nodes).sort((a,b)=>a.t-b.t||a.id-b.id).map((n,i)=>{const occupied=cells(n.ids,meta.stations);return {...n,id:i,cells:occupied,center:{lat:occupied.reduce((s,c)=>s+c.lat,0)/occupied.length,lon:occupied.reduce((s,c)=>s+c.lon,0)/occupied.length},parents:[],children:[]};});
 const byHour=Array.from({length:meta.T},()=>[]);for(const n of nodes)byHour[n.t].push(n);
 const dsu=union(nodes.length),links=[];
 for(let t=p.baselineHours+1;t<meta.T;t++)for(const a of byHour[t-1])for(const b of byHour[t]){
  const bIds=new Set(b.ids),shared=a.ids.filter(s=>bIds.has(s)).length,cover=proximity(a,b,p.maxSpeed);
  // Majority coverage of at least one footprint allows a split or merger.
  // An isolated close edge is insufficient to join two broad distant zones.
  const linked=shared>=2?Math.max(cover.a,cover.b)>=.6:Math.max(cover.a,cover.b)>=.6&&Math.min(cover.a,cover.b)>=.2&&Math.min(cover.nearA,cover.nearB)>=1;
  if(!linked)continue;
  const link={from:a.id,to:b.id,shared,coverageA:cover.a,coverageB:cover.b,centerStep:distance(a.center,b.center)};
  links.push(link);a.children.push(b.id);b.parents.push(a.id);dsu.join(a.id,b.id);
 }
 const components=new Map();for(const node of nodes){const root=dsu.find(node.id);if(!components.has(root))components.set(root,[]);components.get(root).push(node);}
 const events=[...components.values()].map(ns=>{
  const ids=[...new Set(ns.flatMap(n=>n.ids))],nodeIds=new Set(ns.map(n=>n.id)),eventLinks=links.filter(l=>nodeIds.has(l.from)),series=[];
  for(const t of [...new Set(ns.map(n=>n.t))]){const at=ns.filter(n=>n.t===t),stations=[...new Set(at.flatMap(n=>n.ids))];series.push({t,count:stations.length,zones:at.length,area:at.reduce((s,n)=>s+n.area,0),excess:median(stations.map(s=>values[s*meta.T+t]-detection.refs[s])),maxExcess:Math.max(...stations.map(s=>values[s*meta.T+t]-detection.refs[s]))});}
  // Moving centroids can jump during a split or merger. Measure progress of
  // newly activated 50 km cells instead, restricted to temporal zone ancestry.
  // Cells that activate simultaneously cannot generate a travelling route.
  const first=new Map();for(const n of ns)for(const c of n.cells)if(!first.has(c.key))first.set(c.key,{...c,t:n.t,nodeId:n.id});
  const arrivals=[...first.values()].sort((a,b)=>a.t-b.t),reachCache=new Map();
  const descends=(a,b)=>{if(!reachCache.has(a)){const set=new Set([a]),queue=[a];for(let i=0;i<queue.length;i++)for(const id of nodes[queue[i]].children)if(!set.has(id)){set.add(id);queue.push(id);}reachCache.set(a,set);}return reachCache.get(a).has(b);};
  const next=arrivals.map(()=>[]);for(let i=0;i<arrivals.length;i++)for(let j=i+1;j<arrivals.length;j++){const dt=arrivals[j].t-arrivals[i].t;if(dt>6)break;if(dt<1)continue;const step=distance(arrivals[i],arrivals[j]);if(step<=p.maxSpeed*dt&&descends(arrivals[i].nodeId,arrivals[j].nodeId))next[i].push({j,step});}
  let route=null;
  for(let start=0;start<arrivals.length;start++){const costs=new Map([[start,0]]),previous=new Map();for(let end=start;end<arrivals.length;end++){const cost=costs.get(end);if(cost===undefined)continue;
    if(arrivals[end].t-arrivals[start].t+1>=p.minHours){const net=distance(arrivals[start],arrivals[end]),coherence=cost>0?Math.min(1,net/cost):0;
     if(coherence>=p.minCoherence&&(!route||net>route.travel)){const path=[];for(let id=end;id!==undefined;id=previous.get(id))path.push(arrivals[id]);path.reverse();if(path.length>=3)route={travel:net,pathLength:cost,coherence,start:arrivals[start].t,end:arrivals[end].t,points:path,nodeIds:path.map(n=>n.nodeId)};}}
    for(const edge of next[end]){const newCost=cost+edge.step;if(!costs.has(edge.j)||newCost<costs.get(edge.j)){costs.set(edge.j,newCost);previous.set(edge.j,end);}}
   }}
  const reasons=[];if(!route)reasons.push('aucune route assez longue et directionnelle');else if(route.travel<p.minTravel)reasons.push(`déplacement ${Math.round(route.travel)} km < ${p.minTravel} km`);
  const peakTime=series.reduce((a,b)=>a.count>=b.count?a:b).t;
  return {nodes:ns,links:eventLinks,ids,countries:[...new Set(ids.map(s=>meta.stations[s].country))].sort(),start:ns[0].t,end:ns.at(-1).t,duration:ns.at(-1).t-ns[0].t+1,series,peaks:[],arrivals,route,travel:route?.travel||0,selected:reasons.length===0,reasons,branches:ns.filter(n=>n.children.length>1).length,mergers:ns.filter(n=>n.parents.length>1).length,maxZones:Math.max(...series.map(s=>s.zones)),maxCount:Math.max(...series.map(s=>s.count)),maxArea:Math.max(...series.map(s=>s.area)),maxExcess:Math.max(...series.map(s=>s.maxExcess)),peakTime,integral:series.reduce((s,n)=>s+n.count,0)};
 }).sort((a,b)=>b.integral-a.integral).map((e,i)=>({...e,id:i+1}));
 return {...detection,settings:p,events:events.filter(e=>e.selected),allEvents:events,links,zoneCount:nodes.length};
}
