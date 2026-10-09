import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataset, parseCSV, parseTimestamp, serializeDataset, summarizeCapture } from '../src/data.js';

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
  assert.throws(()=>normalizeDataset({format:'remap-capture-v1',resources:[]}),/réponses réseau seules/);
});
const areaPath='/mapSvc/api/timeseries/v1/stations/20261002000000/20261009183216/area';
const seriesPath='/mapSvc/api/timeseries/v1/stations/timeseries/20261002000000/20261009183216';
test('une capture encodée est diagnostiquée sans inventer de coordonnées ou de mesures',()=>{
  const capture={format:'remap-capture-v1',resources:[
    {path:areaPath,data:{data:[{code:'\u0378\u036c',lat:8444,long:-300,name:'encoded'}]}},
    {path:seriesPath,data:[{code:'\u0378\u036c',date:observation.time,value:59772}]}
  ]};
  const summary=summarizeCapture(capture);assert.equal(summary.stationResponses,1);assert.equal(summary.measurementRows,1);assert.equal(summary.usableStationRows,0);
  assert.throws(()=>normalizeDataset(capture),error=>error.captureSummary?.seriesResponses===1&&/encodés/.test(error.message));
});
test('des données après traitement par le client sont associées par code et dédupliquées',()=>{
  const capture={format:'remap-capture-v1',resources:[
    {path:areaPath,stage:'application',data:{data:[{code:'FR001',lat:48,long:-3,name:'Test',country:'FR'}]}},
    {path:seriesPath,stage:'application',data:[{code:'FR001',date:observation.time,value:100}]},
    {path:seriesPath,stage:'application',data:[{code:'FR001',date:observation.time,value:100},{code:'FR999',date:observation.time,value:120}]}
  ]};
  const d=normalizeDataset(capture);assert.equal(d.stations[0].id,'FR001');assert.equal(d.stations[0].lon,-3);assert.equal(d.observations[0].value,100);
  assert.equal(d.duplicates,1);assert.equal(d.captureSummary.unmatchedMeasurements,1);assert.equal(d.synthetic,false);
});
test('les réponses réseau ne sont pas utilisées comme des données déjà converties',()=>{
  const capture={format:'remap-capture-v1',resources:[
    {path:areaPath,data:{data:[{code:'FR001',lat:48,long:-3}]}},
    {path:seriesPath,data:[{code:'FR001',date:observation.time,value:100}]}
  ]};
  assert.throws(()=>normalizeDataset(capture),/réponses réseau seules/);
});
