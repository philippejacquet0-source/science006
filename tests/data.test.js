import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataset, parseCSV, parseTimestamp, serializeDataset } from '../src/data.js';

const station={id:'A',name:'Test',lat:48,lon:-3};
const observation={stationId:'A',time:'2026-10-06T00:00:00Z',value:100};
const sample=(extra={})=>({stations:[station],observations:[observation],unit:'nSv/h',...extra});
test('les unités µSv/h sont converties en nSv/h',()=>{
  const d=normalizeDataset(sample({unit:'µSv/h',observations:[{...observation,value:.12}]}));
  assert.equal(d.observations[0].value,120);assert.equal(d.unit,'nSv/h');
});
test('une unité manquante et un fuseau manquant sont refusés',()=>{
  assert.throws(()=>normalizeDataset(sample({unit:undefined})),/Unité/);
  assert.throws(()=>parseTimestamp('2026-10-06T00:00:00'),/fuseau/);
  assert.equal(parseTimestamp('2026-10-06T02:00:00+02:00'),parseTimestamp(observation.time));
});
test('les dates impossibles ne sont pas normalisées silencieusement',()=>{
  assert.throws(()=>parseTimestamp('2026-02-30T12:00:00Z'),/impossible/);
  assert.throws(()=>parseTimestamp('2026-10-06T24:00:00Z'),/impossible/);
});
test('les doublons identiques sont retirés, les contradictions refusées',()=>{
  const d=normalizeDataset(sample({observations:[observation,observation]}));assert.equal(d.duplicates,1);assert.equal(d.observations.length,1);
  assert.throws(()=>normalizeDataset(sample({observations:[observation,{...observation,value:120}]})),/contradictoires/);
});
test('CSV avec guillemets, virgule dans le nom et décimales françaises',()=>{
  const d=parseCSV('station_id;station_name;latitude;longitude;timestamp;value;unit\r\nA;"Brest, sud";48,4;-4,5;2026-10-06T00:00:00Z;0,12;µSv/h\r\n');
  assert.equal(d.stations[0].name,'Brest, sud');assert.equal(d.stations[0].lat,48.4);assert.equal(d.observations[0].value,120);
});
test('CSV mal formé, coordonnées contradictoires et valeurs vides sont refusés',()=>{
  assert.throws(()=>parseCSV('station_id,value\nA,100'),/manquante/);
  const h='station_id,latitude,longitude,timestamp,value,unit\n';
  assert.throws(()=>parseCSV(h+'A,48,-3,2026-10-06T00:00:00Z,,nSv/h'),/manquant/);
  assert.throws(()=>parseCSV(h+'A,48,-3,2026-10-06T00:00:00Z,100,nSv/h\nA,49,-3,2026-10-06T01:00:00Z,100,nSv/h'),/Coordonnées contradictoires/);
});
test('les balises inconnues et valeurs négatives sont refusées',()=>{
  assert.throws(()=>normalizeDataset(sample({observations:[{...observation,stationId:'B'}]})),/inconnue/);
  assert.throws(()=>normalizeDataset(sample({observations:[{...observation,value:-1}]})),/négatif/);
});
test('un export et réimport préservent les valeurs et le marqueur synthétique',()=>{
  const d=normalizeDataset(sample({synthetic:true})),back=normalizeDataset(JSON.parse(serializeDataset(d)));
  assert.equal(back.synthetic,true);assert.deepEqual(back.observations,d.observations);assert.deepEqual(back.stations,d.stations);
});
test('une capture brute REMAP est distinguée d’un jeu de mesures',()=>{
  assert.throws(()=>normalizeDataset({format:'remap-capture-v1',resources:[]}),/réponses JSON brutes/);
});
