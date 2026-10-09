import { analyze } from './detection.js';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,result:analyze(data.dataset,data.settings)}); }
  catch(error) { self.postMessage({id:data.id,error:error.message}); }
};
