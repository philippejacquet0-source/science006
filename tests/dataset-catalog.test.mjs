import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateCatalogue,validateHourly} from '../dataset-catalog.mjs';
const root=new URL('../',import.meta.url),catalogue=JSON.parse(fs.readFileSync(new URL('data/catalogue.json',root)));
test('le catalogue conserve les deux périodes et charge la plus récente par défaut',()=>{
 const c=validateCatalogue(catalogue);assert.equal(c.defaultDataset,'2026-10-13_2026-10-20');assert.deepEqual(new Set(c.datasets.map(d=>d.id)),new Set(['2026-10-13_2026-10-20','2026-10-02_2026-10-09']));
});
test('un catalogue ambigu ou avec une destination externe est refusé',()=>{
 assert.throws(()=>validateCatalogue({...catalogue,defaultDataset:'absent'}));assert.throws(()=>validateCatalogue({...catalogue,datasets:[catalogue.datasets[0],catalogue.datasets[0]]}));assert.throws(()=>validateCatalogue({...catalogue,datasets:[{...catalogue.datasets[0],values:'https://example.org/values.bin'}]}));
});
for(const d of catalogue.datasets)test('cohérence du jeu publié '+d.id,()=>{
 const meta=JSON.parse(fs.readFileSync(new URL(d.meta,root))),b=fs.readFileSync(new URL(d.values,root)),values=new Float64Array(b.buffer,b.byteOffset,b.length/8);validateHourly(meta,values);
 let measured=0;for(const v of values)if(Number.isFinite(v))measured++;assert.equal(meta.measured,measured);assert.equal(meta.coverage,measured/(meta.N*meta.T));assert.equal(new Set(meta.stations.map(s=>s.id)).size,meta.N);
 assert.equal(meta.validLots+meta.missingLots.length+meta.invalidLots.length,meta.plannedLots);
 if(d.id==='2026-10-13_2026-10-20'){assert.equal(meta.N,5955);assert.equal(meta.T,180);assert.equal(meta.rawCount,966761);assert.equal(meta.validLots,1192);assert.deepEqual(meta.missingLots,[]);assert.deepEqual(meta.invalidLots,[]);assert.ok(fs.statSync(new URL(d.archive,root)).size>0);}
});
test('les matrices de périodes différentes ne peuvent pas être mélangées',()=>{
 const a=JSON.parse(fs.readFileSync(new URL(catalogue.datasets[0].meta,root))),b=fs.readFileSync(new URL(catalogue.datasets[1].values,root));assert.throws(()=>validateHourly(a,new Float64Array(b.buffer,b.byteOffset,b.length/8)),/incohérent/);
});
