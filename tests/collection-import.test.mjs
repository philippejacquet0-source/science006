import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {collectionPlan,importCollection,timestamp} from '../collection-import.mjs';
const station={id:'FRTEST',name:'Essai',country:'FR',lat:48,lon:2};
const manifest={format:'remanence-collection-v1',mode:'all',start:'2026-10-01T00:00:00Z',end:'2026-10-09T00:00:00Z',stations:[station],completed:[],errors:[]};
const part=(rows=[{stationId:'FRTEST',time:'2026-10-01T00:00:00Z',value:100}])=>({schema:'remanence-v1',synthetic:false,unit:'nSv/h',stations:rows.length?[station]:[],observations:rows,provenance:{start:manifest.start,endExclusive:'2026-10-08T00:00:00Z',requestStamp:745,requestedStations:['FRTEST'],missingSeries:rows.length?[]:['FRTEST']}});
const file=(name,data)=>({name,webkitRelativePath:'collecte/'+name,text:async()=>JSON.stringify(data)});
const load=(data=part(),extra=[])=>importCollection([file('manifest.json',manifest),file('w00-b0000.json',data),...extra]);
test('lecture des lots réellement présents malgré un manifeste interrompu, moyennes horaires et lacunes',async()=>{
 const rows=[{stationId:'FRTEST',time:'2026-10-01T00:05:00Z',value:100},{stationId:'FRTEST',time:'2026-10-01T00:35:00Z',value:120}];const {meta,values}=await load(part(rows));
 assert.equal(meta.rawCount,2);assert.equal(values[0],110);assert.ok(Number.isNaN(values[1]));assert.equal(meta.coverage,1/192);assert.equal(meta.sourceKind,'local');assert.equal(meta.sourceName,'collecte');assert.deepEqual(meta.missingLots,['w01-b0000']);
});
test('doublons identiques dédupliqués, doublons contradictoires exclus sans contamination',async()=>{
 const p=part();p.observations.push({...p.observations[0]});const r=await load(p);assert.equal(r.meta.rawCount,1);assert.equal(r.meta.duplicateCount,1);
 p.observations[1].value=999;const later=part([{stationId:'FRTEST',time:'2026-10-08T00:00:00Z',value:200}]);later.provenance.start='2026-10-08T00:00:00Z';later.provenance.endExclusive=manifest.end;
 const result=await load(p,[file('w01-b0000.json',later)]);assert.equal(result.meta.invalidLots.length,1);assert.equal(result.meta.rawCount,1);assert.ok(Number.isNaN(result.values[0]));assert.equal(result.values[168],200);
});
test('lot encodé, valeur non numérique, coordonnées contradictoires et unité inconnue ne sont pas importés',async()=>{
 for(const modify of [p=>p.unit='µSv/h',p=>p.stations[0]={...station,lat:49},p=>p.observations[0].value='100',p=>p.synthetic=true]){const p=part();modify(p);await assert.rejects(load(p),/Aucune observation valide/);}
});
test('horodatages impossibles et absence de fuseau refusés, limite temporelle exclusive',async()=>{
 assert.throws(()=>timestamp('2026-02-30T00:00:00Z'),/impossible/);assert.throws(()=>timestamp('2026-10-01T00:00:00'),/fuseau/);assert.equal(timestamp('2026-10-01T02:00:00+02:00'),timestamp(manifest.start));
 const p=part([{stationId:'FRTEST',time:'2026-10-08T00:00:00Z',value:100}]);await assert.rejects(load(p),/Aucune observation valide/);
});
test('un dossier vide, ambigu ou sans manifeste est refusé sans autre lecture',async()=>{
 await assert.rejects(importCollection([]),/manifest/);await assert.rejects(importCollection([file('manifest.json',manifest),file('manifest.json',manifest)]),/manifest/);
 assert.throws(()=>collectionPlan({...manifest,stations:[station,station]}),/Inventaire/);
});
test('les sauvegardes, audits et lots imbriqués ne remplacent pas les lots du dossier choisi',async()=>{
 const backup=file('w01-b0000.json',part());backup.webkitRelativePath='collecte/sauvegarde/w01-b0000.json';const r=await load(part(),[backup,file('audit.json',{})]);assert.equal(r.meta.validLots,1);assert.deepEqual(r.meta.ignoredFiles,['audit.json']);assert.equal(r.meta.missingLots.length,1);
});
test('régression réelle : le dossier utilisateur reproduit l’instantané horaire publié',async t=>{
 const folder=new URL('../../data/remap-20261002000000-20261009192421-all/',import.meta.url);if(!fs.existsSync(folder)){t.skip('Dossier brut local non publié ; tests de format exécutés séparément.');return;}
 const files=fs.readdirSync(folder).filter(n=>n.endsWith('.json')).map(name=>({name,webkitRelativePath:'collecte/'+name,text:async()=>fs.readFileSync(new URL(name,folder),'utf8')}));
 const r=await importCollection(files),expected=JSON.parse(fs.readFileSync(new URL('../data/meta.json',import.meta.url))),bytes=fs.readFileSync(new URL('../data/values.bin',import.meta.url)),matrix=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.length/8);
 for(const key of ['N','T','rawCount','measured','validLots','plannedLots'])assert.equal(r.meta[key],expected[key],key);
 assert.deepEqual(r.meta.missingLots,expected.missingLots);assert.deepEqual(r.meta.invalidLots,[]);assert.equal(r.values.length,matrix.length);
 for(let i=0;i<matrix.length;i++)assert.ok(Object.is(r.values[i],matrix[i]),'Case horaire '+i);
});
