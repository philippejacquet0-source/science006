import {clusterNetwork as analyse} from './cluster-engine.mjs?v=defaults-20261020';
import {importCollection} from './collection-import.mjs';
let meta,values;
self.onmessage=async event=>{const m=event.data;try{
 if(m.type==='import'){
  const candidate=await importCollection(m.files,progress=>self.postMessage({type:'progress',...progress,request:m.request}));
  if(candidate.meta.T<=m.settings.baselineHours)throw new Error(`La recherche exige une période de plus de ${m.settings.baselineHours} heures pour établir la référence. Ce dossier ne contient que ${candidate.meta.T} cases horaires.`);
  const result=analyse(candidate.meta,candidate.values,m.settings);meta=candidate.meta;values=candidate.values;
  const buffer=values.buffer.slice(0);self.postMessage({type:'imported',meta,buffer,result,request:m.request},[buffer]);return;
 }
 if(m.type==='init'){meta=m.meta;values=new Float64Array(m.buffer);}
 const result=analyse(meta,values,m.settings);self.postMessage({type:'result',result,request:m.request});
}catch(e){self.postMessage({type:'error',message:e.message,request:m.request});}};
