export const defaults={baselineHours:72,minBaseline:48,z:4,noise:1.5,minExcess:10,duration:2,radius:70,minStations:4,minArea:0,peakSeparation:6,peakProminence:10};
const median=a=>{if(!a.length)return NaN;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
export function distance(a,b){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function hull(stations){
 const points=[...new Map(stations.map(s=>[`${s.lon}|${s.lat}`,[s.lon,s.lat]])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 if(points.length<3)return points;
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],hi=[];
 for(const p of points){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
 for(const p of [...points].reverse()){while(hi.length>=2&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}lo.pop();hi.pop();return lo.concat(hi);
}
export function hullArea(stations){const poly=hull(stations);if(poly.length<3)return 0;const lat=stations.reduce((n,s)=>n+s.lat,0)/stations.length,scale=Math.cos(lat*Math.PI/180);let area=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];area+=(a[0]*b[1]-b[0]*a[1])*111.195**2*scale;}return Math.abs(area)/2;}
function uf(n){const parent=Array.from({length:n},(_,i)=>i);const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};return {find,join:(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;}};}
export function spatialGroups(indices,stations,radius){
 const dsu=uf(indices.length),grid=new Map(),cell=radius/111.195;
 indices.forEach((s,i)=>{const p=stations[s],gx=Math.floor(p.lon/cell),gy=Math.floor(p.lat/cell),width=Math.ceil(1/Math.max(.04,Math.cos(p.lat*Math.PI/180)))+1;
  for(let x=gx-width;x<=gx+width;x++)for(let y=gy-1;y<=gy+1;y++)for(const j of grid.get(`${x}|${y}`)||[])if(distance(p,stations[indices[j]])<=radius)dsu.join(i,j);
  const key=`${gx}|${gy}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);
 });
 const groups=new Map();indices.forEach((s,i)=>{const root=dsu.find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(s);});return [...groups.values()];
}
export function findPeaks(series,separation,prominence){
 const candidates=[];
 // Peaks refer to the event's hourly median excess. No smoothing or interpolation.
 for(let i=1;i<series.length-1;i++){
  const p=series[i],left=series[i-1],right=series[i+1];
  if(p.t-left.t!==1||right.t-p.t!==1||p.excess<left.excess||p.excess<=right.excess)continue;
  const lo=series.filter(q=>q.t>=p.t-separation&&q.t<p.t),hi=series.filter(q=>q.t>p.t&&q.t<=p.t+separation);
  const floor=Math.max(Math.min(...lo.map(q=>q.excess)),Math.min(...hi.map(q=>q.excess)));
  if(p.excess-floor>=prominence)candidates.push({...p,prominence:p.excess-floor});
 }
 const peaks=[];for(const p of candidates.sort((a,b)=>b.excess-a.excess))if(peaks.every(q=>Math.abs(q.t-p.t)>=separation))peaks.push(p);return peaks.sort((a,b)=>a.t-b.t);
}
export function analyse(meta,values,settings={}){
 const p={...defaults,...settings},T=meta.T,N=meta.N,stations=meta.stations;
 if(p.baselineHours>=T||p.minBaseline>p.baselineHours||p.radius<=0||p.duration<1||p.minStations<2||p.noise<=0||p.z<=0)throw new Error('Paramètres incompatibles avec la période ou la méthode.');
 const refs=new Float64Array(N).fill(NaN),sigmas=new Float64Array(N).fill(NaN),coverage=new Uint16Array(N),active=new Uint8Array(N*T),stationRuns=[];
 for(let s=0;s<N;s++){
  const baseline=[];for(let t=0;t<T;t++){const v=values[s*T+t];if(Number.isFinite(v)){coverage[s]++;if(t<p.baselineHours)baseline.push(v);}}
  if(baseline.length<p.minBaseline)continue;
  refs[s]=median(baseline);sigmas[s]=Math.max(p.noise,1.4826*median(baseline.map(v=>Math.abs(v-refs[s]))));
  let begin=-1;const flush=end=>{if(begin>=0&&end-begin>=p.duration){for(let t=begin;t<end;t++)active[s*T+t]=1;stationRuns.push({s,start:begin,end:end-1});}begin=-1;};
  for(let t=p.baselineHours;t<T;t++){const v=values[s*T+t],excess=v-refs[s];if(Number.isFinite(v)&&excess>p.z*sigmas[s]&&excess>=p.minExcess){if(begin<0)begin=t;}else flush(t);}flush(T);
 }
 const nodes=[],byHour=Array.from({length:T},()=>[]),activity=new Uint16Array(T);
 for(let t=p.baselineHours;t<T;t++){
  const indices=[];for(let s=0;s<N;s++)if(active[s*T+t])indices.push(s);activity[t]=indices.length;
  for(const ids of spatialGroups(indices,stations,p.radius)){
   if(ids.length<p.minStations)continue;const members=ids.map(i=>stations[i]),area=hullArea(members);if(area<p.minArea)continue;
   const excesses=ids.map(s=>values[s*T+t]-refs[s]);const node={id:nodes.length,t,ids,area,center:{lat:median(members.map(s=>s.lat)),lon:median(members.map(s=>s.lon))},excess:median(excesses),maxExcess:Math.max(...excesses)};nodes.push(node);byHour[t].push(node);
  }
 }
 const links=[],dsu=uf(nodes.length);
 for(let t=p.baselineHours+1;t<T;t++)for(const a of byHour[t-1])for(const b of byHour[t]){
  const common=a.ids.filter(s=>b.ids.includes(s)).length;
  // Temporal continuity requires a shared station. No inferred path between disjoint territories.
  if(common){dsu.join(a.id,b.id);links.push([a.id,b.id]);}
 }
 const components=new Map();for(const node of nodes){const r=dsu.find(node.id);if(!components.has(r))components.set(r,[]);components.get(r).push(node);}
 const events=[...components.values()].map(ns=>{
  ns.sort((a,b)=>a.t-b.t);const ids=[...new Set(ns.flatMap(n=>n.ids))],series=[];
  for(const t of [...new Set(ns.map(n=>n.t))]){const at=ns.filter(n=>n.t===t),ss=[...new Set(at.flatMap(n=>n.ids))];series.push({t,count:ss.length,area:at.reduce((sum,n)=>sum+n.area,0),excess:median(ss.map(s=>values[s*T+t]-refs[s])),maxExcess:Math.max(...ss.map(s=>values[s*T+t]-refs[s]))});}
  const peak=findPeaks(series,p.peakSeparation,p.peakProminence),countries=[...new Set(ids.map(s=>stations[s].country))].sort();
  const maxPoint=series.reduce((a,b)=>a.maxExcess>=b.maxExcess?a:b);
  return {start:ns[0].t,end:ns.at(-1).t,duration:ns.at(-1).t-ns[0].t+1,ids,countries,nodes:ns,series,peaks:peak,maxCount:Math.max(...series.map(v=>v.count)),maxArea:Math.max(...series.map(v=>v.area)),maxExcess:maxPoint.maxExcess,peakTime:maxPoint.t,integral:series.reduce((sum,s)=>sum+s.count,0)};
 }).sort((a,b)=>b.integral-a.integral).map((e,i)=>({...e,id:i+1}));
 return {settings:p,events,refs,sigmas,coverage,active,activity,referenceCount:[...refs].filter(Number.isFinite).length,stationRunCount:stationRuns.length};
}
