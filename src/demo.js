import { HOUR, normalizeDataset } from './data.js';

export const DEMO_START = Date.parse('2026-10-06T00:00:00Z');
export const DEMO_END = Date.parse('2026-10-09T12:00:00Z');

export function createDemo() {
  let seed = 6062026;
  function random() { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
  const route = [
    ['Brest',48.4,-4.5,'FR'],['Saint-Brieuc',48.5,-2.7,'FR'],['Cherbourg',49.6,-1.6,'FR'],['Rouen',49.4,1.1,'FR'],['Lille',50.6,3.1,'FR'],['Rotterdam',51.9,4.5,'NL'],['Groningue',53.2,6.6,'NL'],['Hambourg',53.6,10,'DE'],['Odense',55.4,10.4,'DK'],['Copenhague',55.7,12.6,'DK'],['Linköping',58.4,15.6,'SE'],['Stockholm',59.3,18.1,'SE'],['Turku',60.5,22.3,'FI'],['Tampere',61.5,23.8,'FI'],['Jyväskylä',62.2,25.7,'FI'],['Kuopio',62.9,27.7,'FI']
  ];
  const stations = [];
  for (const [index,[name,lat,lon,country]] of route.entries()) for (let j=0;j<4;j++) stations.push({id:`DEMO-${country}-${String(index*4+j+1).padStart(3,'0')}`,name:`${name} · ${String.fromCharCode(65+j)} (fictive)`,lat:lat+(random()-.5)*1.05,lon:lon+(random()-.5)*1.6,country});
  const other = [['Dublin',53.3,-6.3,'IE'],['Londres',51.5,-.1,'GB'],['Paris',48.8,2.3,'FR'],['Madrid',40.4,-3.7,'ES'],['Lisbonne',38.7,-9.1,'PT'],['Rome',41.9,12.5,'IT'],['Berlin',52.5,13.4,'DE'],['Prague',50.1,14.4,'CZ'],['Vienne',48.2,16.4,'AT'],['Varsovie',52.2,21,'PL'],['Riga',56.9,24.1,'LV'],['Oslo',59.9,10.7,'NO'],['Bergen',60.4,5.3,'NO'],['Tallinn',59.4,24.7,'EE'],['Bucarest',44.4,26.1,'RO'],['Athènes',38,23.7,'GR']];
  for (const [name,lat,lon,country] of other) for (let j=0;j<2;j++) stations.push({id:`DEMO-${country}-X${stations.length}`,name:`${name} · ${j+1} (fictive)`,lat:lat+(random()-.5)*.7,lon:lon+(random()-.5)*.9,country});
  const observations = [];
  for (const station of stations) {
    const reference = 74+random()*64, phase=random()*Math.PI*2;
    for (let time=DEMO_START-14*24*HOUR;time<=DEMO_END;time+=HOUR) {
      const hour = (time-DEMO_START)/HOUR;
      let value=reference+Math.sin(hour/24*Math.PI*2+phase)*1.3+(random()-.5)*3.2;
      if (hour>=0) {
        const progress=Math.min(1,Math.max(0,(hour-3)/77))*(route.length-1), k=Math.min(route.length-2,Math.floor(progress)), fraction=progress-k;
        const lat=route[k][1]*(1-fraction)+route[k+1][1]*fraction,lon=route[k][2]*(1-fraction)+route[k+1][2]*fraction;
        const distance=Math.hypot((station.lat-lat)*111,(station.lon-lon)*111*Math.cos(lat*Math.PI/180));
        value+=(32+8*Math.sin(hour/15))*Math.exp(-.5*(distance/155)**2);
        // A brief isolated spike should appear in the chart but not become an episode.
        if (station.id==='DEMO-ES-X70' && hour===26) value+=50;
      }
      // Deliberate holes exercise missing-data handling without breaking the whole corridor.
      if (station.id.endsWith('008') && hour>=35 && hour<=40) continue;
      observations.push({stationId:station.id,time,value:Math.round(value*100)/100});
    }
  }
  return normalizeDataset({name:'Bretagne → Finlande · scénario synthétique',synthetic:true,unit:'nSv/h',stations,observations});
}
