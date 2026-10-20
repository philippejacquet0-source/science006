/* User-launched REMAP collector. Uses the already loaded client's API and transform.
 * Experimental: network-wide collection has not yet been validated on REMAP.
 */
(() => {
  'use strict';
  if(location.hostname!=='remap.jrc.ec.europa.eu'||/\/Consent\//i.test(location.pathname)){
    alert('Ouvrez la carte REMAP après votre passage manuel du CAPTCHA.');return;
  }
  if(window.__remanenceCollector){window.__remanenceCollector.show();return;}
  const host=document.createElement('div');
  host.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>section{font:14px system-ui;background:white;color:#193f48;width:390px;padding:20px;border:1px solid #9aa;border-radius:12px;box-shadow:0 5px 30px #0003}h2{margin:0 0 12px;font-size:19px}p{line-height:1.5;font-size:12px}button{font:inherit;padding:8px;margin:4px;cursor:pointer}pre{white-space:pre-wrap;font-size:12px;max-height:200px;overflow:auto}</style><section><h2>Bouffi · collecte REMAP</h2><p>Nouvelle collecte : période du curseur REMAP. Reprise : période du manifeste sauvegardé, sans réglage du curseur.</p><p>Les requêtes restent successives. Le client REMAP assure l'authentification ; un nouveau CAPTCHA reste manuel.</p><button id="load">Reprendre un dossier existant</button><button id="pilot">Pilote · 2 balises</button><button id="all">Nouveau réseau complet</button><button id="pause" disabled>Pause</button><button id="resume" disabled>Démarrer / continuer</button><button id="close">Fermer</button><pre id="status">Prêt. Aucune requête de collecte lancée.</pre></section>`;
  document.documentElement.append(host);
  const ui=id=>root.getElementById(id);
  let running=false,paused=false,closing=false,state=null,directory=null,client=null,needsReconcile=false;
  const report=text=>{ui('status').textContent=text;};
  function findClient(){
    const seen=new Set(),candidates=[];
    const visit=vm=>{
      if(!vm||seen.has(vm))return;seen.add(vm);
      if(vm.$api?.getStationsDataBetween&&vm.$api?.getStationsTimeseries&&vm.$decrypt?.response&&vm.from?.clone&&vm.to?.clone&&typeof vm.type==='string')candidates.push(vm);
      for(const child of vm.$children||[])visit(child);
    };
    for(const node of document.querySelectorAll('*'))if(node.__vue__)visit(node.__vue__.$root||node.__vue__);
    if(candidates.length!==1)throw new Error(`Client de carte attendu : 1 ; trouvé : ${candidates.length}. Aucune collecte lancée.`);
    return candidates[0];
  }
  const stampOf=response=>{
    const key=Number(response?.config?.headers?.stamp);
    if(!Number.isInteger(key)||key<5||key>1000)throw new Error('stamp absent ou invalide. Réponse refusée.');
    return key;
  };
  async function readJSON(name){try{return JSON.parse(await (await (await directory.getFileHandle(name)).getFile()).text());}catch(error){if(error.name==='NotFoundError')return undefined;throw error;}}
  async function writeJSON(name,value){const file=await directory.getFileHandle(name,{create:true});const stream=await file.createWritable();try{await stream.write(JSON.stringify(value));await stream.close();}catch(error){try{await stream.abort();}catch{}throw error;}}
  // BEGIN RECOVERY CORE — also exercised directly by the local tests.
  function validateSavedState(saved){
    if(saved?.format!=='remanence-collection-v1'||!['pilot','all'].includes(saved.mode)||!Array.isArray(saved.stations)||!saved.stations.length||!Array.isArray(saved.completed)||!Array.isArray(saved.errors))throw new Error('Manifeste incompatible.');
    const start=Date.parse(saved.start),end=Date.parse(saved.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Période du manifeste invalide.');
    const ids=new Set();
    for(const station of saved.stations){
      if(typeof station.id!=='string'||!station.id||!/^[\x20-\x7e]+$/.test(station.id)||ids.has(station.id)||!Number.isFinite(station.lat)||Math.abs(station.lat)>90||!Number.isFinite(station.lon)||Math.abs(station.lon)>180)throw new Error('Inventaire sauvegardé invalide.');
      ids.add(station.id);
    }
    return saved;
  }
  function savedPlan(saved){
    validateSavedState(saved);
    const plan=[],end=Date.parse(saved.end),step=7*24*3600000;
    let w=0;
    for(let start=Date.parse(saved.start);start<end;start=Math.min(start+step,end),w++){
      for(let offset=0;offset<saved.stations.length;offset+=10)plan.push({id:`w${String(w).padStart(2,'0')}-b${String(offset/10).padStart(4,'0')}`,stations:saved.stations.slice(offset,offset+10),start:new Date(start),end:new Date(Math.min(start+step,end))});
    }
    return plan;
  }
  function validateSavedPart(part,job){
    const p=part?.provenance;
    if(part?.schema!=='remanence-v1'||part.synthetic!==false||part.unit!=='nSv/h'||!Array.isArray(part.observations)||!Array.isArray(part.stations)||!p||!Array.isArray(p.requestedStations)||!Array.isArray(p.missingSeries))throw new Error('Structure du lot invalide.');
    if(Date.parse(p.start)!==job.start.valueOf()||Date.parse(p.endExclusive)!==job.end.valueOf())throw new Error('Période du lot incohérente.');
    if(!Number.isInteger(p.requestStamp)||p.requestStamp<5||p.requestStamp>1000)throw new Error('stamp du lot invalide.');
    const expected=job.stations.map(s=>s.id),requested=new Set(p.requestedStations);
    if(p.requestedStations.length!==expected.length||requested.size!==expected.length||expected.some(id=>!requested.has(id)))throw new Error('Balises demandées incohérentes.');
    const metadata=new Map(job.stations.map(s=>[s.id,s])),actualMetadata=new Set();
    for(const s of part.stations){const original=metadata.get(s.id);if(!original||actualMetadata.has(s.id)||s.lat!==original.lat||s.lon!==original.lon||s.country!==original.country||s.name!==original.name)throw new Error('Métadonnées du lot incohérentes.');actualMetadata.add(s.id);}
    const seen=new Set(),present=new Set();
    for(const row of part.observations){
      const ms=Date.parse(row.time),id=row.stationId+'|'+ms;
      if(!requested.has(row.stationId)||!actualMetadata.has(row.stationId)||!Number.isFinite(ms)||typeof row.time!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(row.time)||ms<job.start.valueOf()||ms>=job.end.valueOf()||!Number.isFinite(row.value)||seen.has(id))throw new Error('Observation invalide ou dupliquée.');
      seen.add(id);present.add(row.stationId);
    }
    if(actualMetadata.size!==present.size)throw new Error('Balises sans observation dans les métadonnées du lot.');
    const missing=expected.filter(id=>!present.has(id)).sort();
    if(JSON.stringify(missing)!==JSON.stringify([...p.missingSeries].sort()))throw new Error('Absences de séries incohérentes.');
    return {id:job.id,file:job.id+'.json',requested:expected.length,returned:present.size,observations:part.observations.length,missingSeries:missing};
  }
  // END RECOVERY CORE
  function lockPreparation(){for(const id of ['pilot','all','load'])ui(id).disabled=true;}
  async function reconcile(){
    const plan=jobs(),completed=[],invalid=[],missing=[];
    for(let index=0;index<plan.length;index++){
      if(closing)throw new Error('Vérification interrompue.');
      const job=plan[index],filename=job.id+'.json';
      if(index%20===0)report(`Vérification locale ${index}/${plan.length} lots. Aucune requête REMAP.`);
      try{
        const part=await readJSON(filename);
        if(part===undefined){missing.push(job.id);continue;}
        completed.push(validateSavedPart(part,job));
      }catch(error){
        // Preserve a malformed or inconsistent file before a future replacement.
        let text;
        try{text=await (await (await directory.getFileHandle(filename)).getFile()).text();}catch(readError){if(readError.name==='NotFoundError'){missing.push(job.id);continue;}throw readError;}
        const backup=filename+'.invalid-'+Date.now()+'.txt';
        const stream=await (await directory.getFileHandle(backup,{create:true})).createWritable();
        try{await stream.write(text);await stream.close();}catch(writeError){try{await stream.abort();}catch{}throw writeError;}
        invalid.push({id:job.id,reason:error.message,backup});
      }
    }
    state.completed=completed;state.observations=completed.reduce((total,item)=>total+item.observations,0);state.currentJob=null;
    state.recovery={checkedAt:new Date().toISOString(),planned:plan.length,valid:completed.length,missing:missing.length,invalid};
    state.collectionStatus=completed.length===plan.length?'finished':'paused';
    await writeJSON('manifest.json',state);needsReconcile=false;
    report(`Période sauvegardée : ${state.start} → ${state.end}\n${completed.length}/${plan.length} lots valides · ${state.observations} observations\n${missing.length} manquants · ${invalid.length} invalides sauvegardés\nCliquez « Démarrer / continuer » pour demander uniquement les lots restants.`);
  }
  async function loadExisting(){
    if(running||state)return;
    try{
      if(!window.showDirectoryPicker)throw new Error('Choix de dossier indisponible : utilisez Chrome sur ordinateur.');
      directory=await window.showDirectoryPicker({mode:'readwrite'});
      const saved=await readJSON('manifest.json');validateSavedState(saved);client=findClient();
      await writeJSON('manifest-before-resume-'+Date.now()+'.json',saved);
      state=saved;lockPreparation();needsReconcile=true;
      await reconcile();ui('resume').disabled=false;
    }catch(error){report('Reprise non lancée : '+error.message);if(!state){directory=null;client=null;}else ui('resume').disabled=false;}
  }
  function metadata(rows){
    if(!Array.isArray(rows))throw new Error('Inventaire inattendu.');
    const seen=new Set();
    return rows.map(row=>{
      if(typeof row.code!=='string'||!row.code||!/^[\x20-\x7e]+$/.test(row.code)||seen.has(row.code)||!Number.isFinite(row.lat)||Math.abs(row.lat)>90||!Number.isFinite(row.long)||Math.abs(row.long)>180)throw new Error('Inventaire incomplet ou incohérent.');
      seen.add(row.code);return {id:row.code,name:row.name,country:row.country,lat:row.lat,lon:row.long};
    });
  }
  async function prepare(mode){
    if(running||state)return;
    try{
      if(!window.showDirectoryPicker)throw new Error('Choix de dossier indisponible : utilisez Chrome sur ordinateur.');
      // The user explicitly selects and grants write access to the output folder.
      const selected=await window.showDirectoryPicker({mode:'readwrite'});
      client=findClient();
      const end=client.to.clone().utc(),start=client.from.clone().utc();
      if(!start.isValid()||!end.isValid()||!start.isBefore(end))throw new Error('Période du curseur invalide.');
      const key=`remap-${start.format('YYYYMMDDHHmmss')}-${end.format('YYYYMMDDHHmmss')}-${mode}`;
      directory=await selected.getDirectoryHandle(key,{create:true});
      report('Lecture du plan de reprise…');
      state=await readJSON('manifest.json');
      if(state){
        if(state.format!=='remanence-collection-v1'||state.start!==start.toISOString()||state.end!==end.toISOString()||state.mode!==mode)throw new Error('Plan de reprise incompatible.');
        validateSavedState(state);await writeJSON('manifest-before-resume-'+Date.now()+'.json',state);needsReconcile=true;
      }else{
        report('Chargement de l’inventaire par le client REMAP…');
        const response=await client.$api.getStationsDataBetween(client.type,start.clone(),end.clone());
        stampOf(response);
        const stations=metadata(client.$decrypt.response(response,'code','country','lat','long','name','value'));
        if(!stations.length)throw new Error('Inventaire vide.');
        state={format:'remanence-collection-v1',mode,start:start.toISOString(),end:end.toISOString(),inventoryType:client.type,inventoryCount:stations.length,stations:mode==='pilot'?stations.slice(0,2):stations,completed:[],errors:[],observations:0,collectionStatus:'prepared',createdAt:new Date().toISOString()};
        await writeJSON('manifest.json',state);
      }
      lockPreparation();
      ui('resume').disabled=false;
      if(needsReconcile){await reconcile();return;}
      await collect();
    }catch(error){report('Collecte non lancée ou interrompue : '+error.message);if(!state){directory=null;client=null;}}
  }
  function jobs(){
    const parse=date=>client.to.clone().utc().date(1).set({year:date.getUTCFullYear(),month:date.getUTCMonth(),date:date.getUTCDate(),hour:date.getUTCHours(),minute:date.getUTCMinutes(),second:date.getUTCSeconds(),millisecond:date.getUTCMilliseconds()});
    return savedPlan(state).map(job=>({...job,start:parse(job.start),end:parse(job.end)}));
  }
  async function collect(){
    if(running||!state)return;
    running=true;paused=false;ui('pause').disabled=false;ui('resume').disabled=true;
    state.collectionStatus='running';
    try{
      if(needsReconcile)await reconcile();
      const plan=jobs(),done=new Set(state.completed.map(item=>item.id));
      for(const job of plan){
        if(done.has(job.id))continue;
        if(paused||closing)break;
        report(`${state.mode==='pilot'?'Pilote':'Réseau'} : ${state.stations.length} balises prévues\n${done.size}/${plan.length} lots terminés · ${state.observations} observations\nRequête ${job.id}`);
        state.currentJob=job.id;await writeJSON('manifest.json',state);
        const response=await client.$api.getStationsTimeseries(job.stations.map(s=>s.id),job.start.clone(),job.end.clone());
        if(response?.status!==200)throw new Error('Réponse HTTP non exploitable.');
        const stamp=stampOf(response);
        const rows=client.$decrypt.response(response,'code','value');
        if(!Array.isArray(rows))throw new Error('Structure de série inattendue.');
        const requested=new Set(job.stations.map(s=>s.id)),seen=new Map(),present=new Set();
        const observations=[];
        for(const row of rows){
          const ms=Date.parse(row.date);
          if(!requested.has(row.code)||!Number.isFinite(ms)||!/(Z|[+-]\d\d:\d\d)$/.test(row.date)||!Number.isFinite(row.value))throw new Error('Observation inattendue : lot refusé.');
          // Half-open windows avoid duplicating shared boundaries.
          if(ms<job.start.valueOf()||ms>=job.end.valueOf())continue;
          const id=row.code+'|'+row.date;
          if(seen.has(id)){if(seen.get(id)!==row.value)throw new Error('Doublon contradictoire.');continue;}
          seen.set(id,row.value);present.add(row.code);observations.push({stationId:row.code,time:row.date,value:row.value});
        }
        const filename=job.id+'.json';
        await writeJSON(filename,{schema:'remanence-v1',name:`REMAP ${job.id}`,synthetic:false,unit:'nSv/h',stations:job.stations.filter(s=>present.has(s.id)),observations,provenance:{collector:'experimental-client-api-v1',requestStamp:stamp,requestedStations:[...requested],start:job.start.toISOString(),endExclusive:job.end.toISOString(),missingSeries:[...requested].filter(code=>!present.has(code)),capturedAt:new Date().toISOString()}});
        const item={id:job.id,file:filename,requested:requested.size,returned:present.size,observations:observations.length,missingSeries:[...requested].filter(code=>!present.has(code))};
        state.completed.push(item);state.observations+=observations.length;state.currentJob=null;done.add(job.id);
        await writeJSON('manifest.json',state);
        if(!paused&&!closing)await new Promise(resolve=>setTimeout(resolve,3000));
      }
      state.collectionStatus=done.size===plan.length?'finished':'paused';
      await writeJSON('manifest.json',state);
      report(`${state.collectionStatus==='finished'?'Collecte terminée':'Collecte en pause'}\n${done.size}/${plan.length} lots · ${state.observations} observations\nLes balises sans série sont documentées dans le manifeste. « Terminé » ne signifie pas couverture complète des mesures.`);
    }catch(error){
      needsReconcile=true;
      state.collectionStatus='error';state.errors.push({job:state.currentJob||null,at:new Date().toISOString(),message:error.message});
      try{await writeJSON('manifest.json',state);}catch{}
      report('Arrêt sur erreur : '+error.message+'\nLes lots déjà enregistrés sont conservés. Reprendre ne relance que les lots non terminés.');
    }finally{running=false;ui('pause').disabled=true;ui('resume').disabled=false;if(closing){host.remove();delete window.__remanenceCollector;}}
  }
  ui('pilot').onclick=()=>prepare('pilot');ui('all').onclick=()=>prepare('all');
  ui('load').onclick=()=>loadExisting();
  ui('pause').onclick=()=>{paused=true;report('Pause demandée. La requête en cours peut terminer ; aucun lot suivant ne sera lancé.');};
  ui('resume').onclick=()=>collect();
  ui('close').onclick=()=>{closing=paused=true;if(!running){host.remove();delete window.__remanenceCollector;}else report('Fermeture après la requête en cours.');};
  window.__remanenceCollector={show:()=>{host.style.display='block';}};
})();
