import fs from 'node:fs/promises';import path from 'node:path';
import {importCollection} from '../collection-import.mjs';
const [folder,destination]=process.argv.slice(2);if(!folder||!destination)throw new Error('Usage : node tools/prepare-hosted-dataset.mjs dossier-source dossier-sortie');
const files=(await fs.readdir(folder)).filter(name=>name.endsWith('.json')).map(name=>({name,webkitRelativePath:path.basename(folder)+'/'+name,text:()=>fs.readFile(path.join(folder,name),'utf8')}));
const {meta,values}=await importCollection(files);meta.sourceKind='online';delete meta.ignoredFiles;
await fs.mkdir(destination,{recursive:true});await fs.writeFile(path.join(destination,'meta.json'),JSON.stringify(meta));await fs.writeFile(path.join(destination,'values.bin'),Buffer.from(values.buffer));
console.log(JSON.stringify({start:meta.start,end:meta.end,stations:meta.N,hours:meta.T,observations:meta.rawCount,coverage:meta.coverage,validLots:meta.validLots,plannedLots:meta.plannedLots,missing:meta.missingLots,invalid:meta.invalidLots,duplicates:meta.duplicateCount,binaryBytes:values.byteLength}));
