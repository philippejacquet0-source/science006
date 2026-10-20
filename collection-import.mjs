const HOUR=3600000, WEEK=168*HOUR;
export function timestamp(value){
 const m=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
 if(!m)throw new Error('Horodatage ISO avec fuseau explicite attendu.');
 const [y,month,day,h,min,s]=m.slice(1,7).map(Number),days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
 const ms=Date.parse(value);if(month<1||month>12||day<1||day>days[month-1]||h>23||min>59||s>59||!Number.isFinite(ms))throw new Error('Horodatage impossible.');return ms;
}
export function collectionPlan(state){
 if(state?.format!=='remanence-collection-v1'||!['pilot','all'].includes(state.mode)||!Array.isArray(state.stations)||!state.stations.length)throw new Error('Manifeste de collecte REMAP incompatible.');
 const start=timestamp(state.start),end=timestamp(state.end);if(end<=start)throw new Error('Période du manifeste invalide.');
 const N=state.stations.length,origin=Math.floor(start/HOUR)*HOUR,T=Math.ceil((end-origin)/HOUR);
 if(N*T>12000000)throw new Error('Ce dossier dépasse la capacité actuelle de 12 millions de cases horaires. Choisissez une période plus courte.');
 const ids=new Set();for(const p of state.stations){if(typeof p.id!=='string'||!p.id||p.id.length>256||ids.has(p.id)||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||(p.country!==undefined&&(typeof p.country!=='string'||!/^([A-Z]{2})?$/.test(p.country)))||(p.name!==undefined&&typeof p.name!=='string'))throw new Error('Inventaire des balises invalide ou contradictoire.');ids.add(p.id);}
 const jobs=[];let w=0;for(let begin=start;begin<end;begin=Math.min(begin+WEEK,end),w++)for(let offset=0;offset<N;offset+=10)jobs.push({id:`w${String(w).padStart(2,'0')}-b${String(offset/10).padStart(4,'0')}`,stations:state.stations.slice(offset,offset+10),start:begin,end:Math.min(begin+WEEK,end)});
 return {jobs,N,T,origin};
}
export function validatePart(part,job){
 const p=part?.provenance;
 if(part?.schema!=='remanence-v1'||part.synthetic!==false||part.unit!=='nSv/h'||!Array.isArray(part.stations)||!Array.isArray(part.observations)||!p||!Array.isArray(p.requestedStations)||!Array.isArray(p.missingSeries))throw new Error('Structure ou unité du lot incompatible.');
 if(timestamp(p.start)!==job.start||timestamp(p.endExclusive)!==job.end)throw new Error('Période du lot incohérente.');
 if(!Number.isInteger(p.requestStamp)||p.requestStamp<5||p.requestStamp>1000)throw new Error('Provenance du lot absente ou invalide.');
 const expected=new Map(job.stations.map(s=>[s.id,s])),requested=new Set(p.requestedStations),actual=new Set();
 if(requested.size!==expected.size||p.requestedStations.length!==expected.size||[...expected.keys()].some(id=>!requested.has(id)))throw new Error('Balises demandées incohérentes.');
 for(const s of part.stations){const original=expected.get(s.id);if(!original||actual.has(s.id)||['lat','lon','country','name'].some(k=>s[k]!==original[k]))throw new Error('Métadonnées du lot incohérentes.');actual.add(s.id);}
 const seen=new Map(),present=new Set();let duplicates=0;
 for(const r of part.observations){const ms=timestamp(r.time),key=r.stationId+'|'+ms;
  if(!requested.has(r.stationId)||!actual.has(r.stationId)||ms<job.start||ms>=job.end||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0)throw new Error('Observation invalide ou hors période.');
  if(seen.has(key)){if(seen.get(key)!==r.value)throw new Error('Doublon contradictoire.');duplicates++;}else seen.set(key,r.value);present.add(r.stationId);
 }
 if(actual.size!==present.size)throw new Error('Métadonnées sans observation.');
 const missing=[...expected.keys()].filter(id=>!present.has(id)).sort();
 if(JSON.stringify(missing)!==JSON.stringify([...p.missingSeries].sort()))throw new Error('Absences de séries incohérentes.');
 return {duplicates};
}
export async function importCollection(files,onProgress=()=>{}){
 const list=Array.from(files),manifests=list.filter(f=>f.name==='manifest.json');
 if(manifests.length!==1)throw new Error('Sélectionnez le dossier contenant un seul manifest.json et ses lots, sans son dossier parent.');
 const manifest=manifests[0],path=f=>f.webkitRelativePath||f.name,prefix=path(manifest).slice(0,-manifest.name.length),byName=new Map();
 for(const f of list){const relative=path(f);if(!relative.startsWith(prefix))continue;const name=relative.slice(prefix.length);if(name.includes('/'))continue;if(byName.has(name))throw new Error('Plusieurs fichiers portent le même nom : '+name);byName.set(name,f);}
 let state;try{state=JSON.parse(await manifest.text());}catch{throw new Error('manifest.json ne contient pas un JSON valide.');}
 const {jobs,N,T,origin}=collectionPlan(state),values=new Float64Array(N*T).fill(NaN),counts=new Uint32Array(N*T),index=new Map(state.stations.map((s,i)=>[s.id,i]));
 const missingLots=[],invalidLots=[];let rawCount=0,validLots=0,duplicateCount=0;
 for(let j=0;j<jobs.length;j++){
  const job=jobs[j],file=byName.get(job.id+'.json');
  if(!file)missingLots.push(job.id);else{
   let part,check;try{part=JSON.parse(await file.text());check=validatePart(part,job);}catch(e){invalidLots.push({id:job.id,error:e.message});}
   if(check){const seen=new Set();for(const r of part.observations){const ms=timestamp(r.time),key=r.stationId+'|'+ms;if(seen.has(key))continue;seen.add(key);const i=index.get(r.stationId)*T+Math.floor((ms-origin)/HOUR);if(!counts[i])values[i]=0;values[i]+=r.value;counts[i]++;rawCount++;}validLots++;duplicateCount+=check.duplicates;}
  }
  if(j%20===0||j===jobs.length-1)onProgress({completed:j+1,total:jobs.length,validLots,observations:rawCount});
 }
 if(!rawCount)throw new Error('Aucune observation valide dans ce dossier. '+invalidLots.length+' lot(s) invalide(s).');
 let measured=0;for(let i=0;i<values.length;i++)if(counts[i]){values[i]/=counts[i];measured++;}
 const folder=prefix.split('/').filter(Boolean).at(-1)||'Dossier local',planned=new Set(['manifest.json',...jobs.map(j=>j.id+'.json')]);
 const meta={format:'remap-hourly-v1',unit:'nSv/h',origin,N,T,stations:state.stations,start:state.start,end:state.end,rawCount,measured,coverage:measured/(N*T),validLots,plannedLots:jobs.length,missingLots,invalidLots,duplicateCount,ignoredFiles:[...byName.keys()].filter(n=>!planned.has(n)),manifestStatus:state.collectionStatus,sourceName:folder,sourceKind:'local',preparedAt:new Date().toISOString()};
 return {meta,values};
}
