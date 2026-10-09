import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, normalizeDataset } from '../src/data.js';
import { analyze, DEFAULT_SETTINGS, haversine } from '../src/detection.js';
import { createDemo, DEMO_START, DEMO_END } from '../src/demo.js';

const start=Date.parse('2026-10-06T00:00:00Z');
function fixture(patterns,coordinates) {
  const stations=patterns.map((_,i)=>({id:`S${i}`,name:`Site ${i}`,lat:coordinates?.[i]?.lat??48+i*.1,lon:coordinates?.[i]?.lon??-3}));
  const observations=[];
  for(const [i,station] of stations.entries()) {
    for(let hour=-24;hour<0;hour++)observations.push({stationId:station.id,time:start+hour*HOUR,value:100+(hour%2?1:-1)});
    for(const [hour,value] of patterns[i].entries())if(value!==null)observations.push({stationId:station.id,time:start+hour*HOUR,value});
  }
  return normalizeDataset({stations,observations,unit:'nSv/h'});
}
const settings={...DEFAULT_SETTINGS,start,end:start+5*HOUR};

test('une pointe isolée ne satisfait pas la persistance',()=>{
  const r=analyze(fixture([[100,125,100,100,100,100]]),settings);
  assert.deepEqual(r.activity,[0,0,0,0,0,0]);assert.equal(r.events.length,0);
  assert.ok(r.stations[0].scores[1]>4);
});
test('trois balises voisines pendant trois heures forment un épisode',()=>{
  const r=analyze(fixture(Array.from({length:3},()=>[100,125,126,127,100,100])),settings);
  assert.equal(r.events.length,1);assert.equal(r.events[0].durationHours,3);
  assert.deepEqual(r.activity,[0,3,3,3,0,0]);assert.equal(r.events[0].stationIds.length,3);
  assert.equal(r.events[0].maxExcess,27);
});
test('un trou de mesure interrompt la séquence',()=>{
  const r=analyze(fixture([[125,null,125,100,100,100]]),settings);
  assert.deepEqual(r.activity,[0,0,0,0,0,0]);assert.equal(r.stations[0].values[1],null);
});
test('des balises éloignées ne forment pas un groupe',()=>{
  const r=analyze(fixture([[125,125],[125,125],[125,125]],[{lat:48,lon:-4},{lat:52,lon:15},{lat:64,lon:28}]),settings);
  assert.equal(r.activity[0],3);assert.equal(r.events.length,0);
});
test('une hausse durable ne modifie pas la référence figée',()=>{
  const r=analyze(fixture([[150,150,150,150,150,150]]),settings);
  assert.equal(r.stations[0].baseline,100);assert.equal(r.stations[0].referenceCount,24);
  assert.ok(r.stations[0].active.every(Boolean));
});
test('un historique insuffisant exclut la balise de la détection',()=>{
  const data=fixture([[125,125,125]]);data.observations=data.observations.filter(o=>o.time>=start-10*HOUR);
  const r=analyze(data,settings);assert.equal(r.referenceCount,0);assert.equal(r.stations[0].baseline,null);assert.equal(r.activity[0],0);
});
test('une heure sans groupe sépare les épisodes',()=>{
  const r=analyze(fixture(Array.from({length:3},()=>[125,125,100,125,125,100])),settings);
  assert.equal(r.events.length,2);assert.equal(r.events[0].endIndex,1);assert.equal(r.events[1].startIndex,3);
});
test('le rayon est une distance réelle en kilomètres',()=>{
  assert.ok(Math.abs(haversine({lat:0,lon:0},{lat:0,lon:1})-111.195)<.01);
  assert.equal(haversine({lat:48,lon:-4},{lat:48,lon:-4}),0);
});
test('la démonstration produit des épisodes et reste explicitement synthétique',()=>{
  const d=createDemo(),r=analyze(d,{...DEFAULT_SETTINGS,start:DEMO_START,end:DEMO_END});
  assert.equal(d.synthetic,true);assert.equal(d.stations.length,96);assert.ok(r.events.length>=1);
  assert.ok(r.activity.some(n=>n>=3));assert.equal(r.referenceCount,96);
  assert.ok(r.stations.some(s=>s.values.includes(null)));
  assert.ok(r.stations.filter(s=>s.country==='FR').some(s=>s.active.slice(0,24).some(Boolean)));
  assert.ok(r.stations.filter(s=>s.country==='FI').some(s=>s.active.slice(-24).some(Boolean)));
});
