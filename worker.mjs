import {clusterNetwork as analyse} from './cluster-engine.mjs';
let meta,values;
self.onmessage=event=>{const m=event.data;try{if(m.type==='init'){meta=m.meta;values=new Float64Array(m.buffer);}const result=analyse(meta,values,m.settings);self.postMessage({type:'result',result,request:m.request});}catch(e){self.postMessage({type:'error',message:e.message,request:m.request});}};
