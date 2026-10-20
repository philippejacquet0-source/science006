import test from 'node:test';import assert from 'node:assert/strict';
import {framePlan,europeView} from '../gif-plan.mjs';

test('le GIF dure exactement trois secondes et conserve les deux extrémités du cluster',()=>{
 for(const hours of [1,5,36,57,60,79,188]){
  const plan=framePlan(72,72+hours-1);
  assert.equal(plan.reduce((sum,p)=>sum+p.delay,0),3000);
  assert.equal(plan[0].t,72);assert.equal(plan.at(-1).t,72+hours-1);
  assert.equal(new Set(plan.map(p=>p.t)).size,plan.length);
  assert.ok(plan.every(p=>Number.isInteger(p.t)&&p.delay>=20&&p.delay%10===0));
  if(hours<=60)assert.equal(plan.length,hours);
  else assert.equal(plan.length,60);
 }
 assert.throws(()=>framePlan(10,9));
});
test('la carte cadre l’Europe et étend sa vue si une balise du cluster le demande',()=>{
 const stations=[{lon:-20,lat:74},{lon:40,lat:33}],e={ids:[0,1]},box={x:20,y:100,w:900,h:640},v=europeView(stations,e,box);
 for(const p of [...stations,{lon:-13,lat:34},{lon:36,lat:71}])assert.ok(v.visible(v.project(p.lon,p.lat)));
 assert.ok(v.project(10,50)[1]>v.project(10,60)[1]);
 assert.ok(v.project(10,50)[0]<v.project(20,50)[0]);
});
