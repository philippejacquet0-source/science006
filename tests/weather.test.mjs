import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {validateWeather,frameAt,gridIndex,associateRain,followRain,nullschoolUrl,forecastEligible,HOUR} from '../weather-engine.mjs';

function fixture(){
  const frame=(h,rain)=>({time:`2026-10-19T0${h}:00:00Z`,water:Array(8).fill(20),rain,u850:Array(8).fill(5),v850:Array(8).fill(0)});
  return {format:'bouffi-weather-v1',source:{kind:'archive'},grid:{lats:[48,50],lons:[0,2,4,6],step:2},precipitationInterval:'[time,time+1h)',units:{water:'kg/m²',rain:'mm',u850:'m/s',v850:'m/s'},frames:[frame(0,[1,1,0,0,0,0,0,0]),frame(1,[0,1,0,0,0,0,1,0]),frame(2,[0,0,1,0,0,0,1,0])]};
}
const epoch=Date.parse('2026-10-19T00:00:00Z');
test('UTC exact : une heure absente ne devient jamais une mesure interpolée',()=>{const p=validateWeather(fixture());assert.equal(frameAt(p,epoch+HOUR).time,'2026-10-19T01:00:00Z');assert.equal(frameAt(p,epoch+HOUR/2),null);assert.equal(frameAt(p,epoch+8*HOUR),null);});
test('les lacunes, les unités et la provenance sont contrôlées',()=>{for(const mutate of [p=>p.frames[0].rain.pop(),p=>p.frames[0].water[0]=-2,p=>p.frames[1].time=p.frames[0].time,p=>p.units.rain='mm/h',p=>p.precipitationInterval='previous-hour',p=>p.source.kind='forecast']){const p=fixture();mutate(p);assert.throws(()=>validateWeather(p));}});
test('une cellule hors Europe ne reçoit pas la valeur du bord',()=>{const g=fixture().grid;assert.equal(gridIndex(g,{lat:48,lon:0}),0);assert.equal(gridIndex(g,{lat:10,lon:0}),-1);});
test('l’association utilise les balises présentes sans identifier arbitrairement la plus grande pluie',()=>{const p=fixture(),f=p.frames[0];f.rain[7]=50;const a=associateRain(p,f,[{lat:48,lon:0},{lat:48,lon:2}]);assert.equal(a.length,1);assert.equal(a[0].hits,2);assert.deepEqual(a[0].cells,[0,1]);});
test('les cellules adjacentes en tableau mais sur des lignes différentes ne se touchent pas',()=>{const p=fixture(),f=p.frames[0];f.rain=[0,0,0,1,1,0,0,0];const a=associateRain(p,f,[{lat:48,lon:6},{lat:50,lon:0}]);assert.equal(a.length,2);});
test('le suivi météo conserve les branches et s’arrête sur une lacune',()=>{const p=fixture(),path=followRain(p,epoch,[0,1],2);assert.ok(path.cells.includes(2));assert.ok(path.cells.includes(6));p.frames.splice(1,1);assert.equal(followRain(p,epoch,[0,1],2),null);});
test('aucune pluie inventée après dissipation',()=>{const p=fixture();p.frames[1].rain.fill(0);assert.equal(followRain(p,epoch,[0,1],1),null);});
test('les liens Nullschool conservent le jour et l’heure UTC',()=>{assert.match(nullschoolUrl(Date.parse('2026-10-20T23:00:00Z')),/2026\/10\/20\/2300Z/);});
test('les deux campagnes embarquent de vrais champs avec lacunes explicites et pluie alignée',()=>{for(const name of ['archive-20261013','archive-20261002']){const p=validateWeather(JSON.parse(gunzipSync(readFileSync(new URL(`../data/weather/${name}.json.gz`,import.meta.url)))));assert.equal(p.source.model,'NOAA GFS · gfs_global');assert.equal(p.grid.sampled,true);assert.equal(p.grid.step,2);assert.ok(p.frames.length>=190);assert.ok(p.frames.some(f=>f.rain.some(v=>v>1)));assert.ok(p.frames.every(f=>f.water.some(v=>v>0)));}});

test("un run initialisé après le repère radio ne sert jamais de prévision à cet instant",()=>{const p=fixture();p.source={kind:"forecast",runInitializedAt:"2026-10-19T00:00:00Z"};assert.equal(forecastEligible(p,epoch),false);assert.equal(forecastEligible(p,epoch+5*HOUR),false);assert.equal(forecastEligible(p,epoch+6*HOUR),true);});
test('la pluie réelle de la première campagne est décalée vers l’heure radio qui commence',()=>{const p=JSON.parse(gunzipSync(readFileSync(new URL('../data/weather/archive-20261013.json.gz',import.meta.url))));const f=frameAt(p,Date.parse('2026-10-13T13:00:00Z'));assert.equal(f.rain[0],0.1);assert.equal(p.grid.lats[0],34);assert.equal(p.grid.lons[0],-16);});
test('tous les calculs datés du catalogue sont embarqués et conservent leur initialisation',()=>{const catalogue=JSON.parse(readFileSync(new URL('../data/weather/catalogue.json',import.meta.url)));for(const e of catalogue.entries){const p=validateWeather(JSON.parse(gunzipSync(readFileSync(new URL('../'+e.path,import.meta.url)))));assert.equal(p.source.kind,e.kind);if(e.kind==='forecast'){assert.match(p.source.runInitializedAt,/2026-10-(06|16|19)T00:00:00Z/);assert.ok(p.frames.length>=150);assert.equal(p.source.runPublicationTimeKnown,false);}}});
