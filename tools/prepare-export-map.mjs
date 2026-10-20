// Source files: Natural Earth 1:50m, public domain, commit recorded below.
// Usage: node tools/prepare-export-map.mjs /path/to/downloaded/geojson
import fs from 'node:fs';
import path from 'node:path';
const source=process.argv[2];
if(!source)throw new Error('Indiquer le dossier des GeoJSON Natural Earth 50m.');
const extent=[-32,25,65,79],inside=([x,y])=>x>=extent[0]&&x<=extent[2]&&y>=extent[1]&&y<=extent[3];
function intersects(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return Math.max(...xs)>=extent[0]&&Math.min(...xs)<=extent[2]&&Math.max(...ys)>=extent[1]&&Math.min(...ys)<=extent[3];}
const rounded=points=>points.map(p=>p.slice(0,2).map(v=>Math.round(v*1000)/1000));
function geometry(g){
 if(g.type==='Point')return inside(g.coordinates)?g:null;
 if(g.type==='Polygon')return intersects(g.coordinates[0])?{type:g.type,coordinates:g.coordinates.map(rounded)}:null;
 if(g.type==='MultiPolygon'){const c=g.coordinates.filter(p=>intersects(p[0])).map(p=>p.map(rounded));return c.length?{type:g.type,coordinates:c}:null;}
 const parts=g.type==='LineString'?[g.coordinates]:g.coordinates,c=parts.filter(intersects).map(rounded);return c.length?{type:'MultiLineString',coordinates:c}:null;
}
const layers={countries:'admin_0_countries',regions:'admin_1_states_provinces_lines',lakes:'lakes',rivers:'rivers_lake_centerlines',cities:'populated_places'},out={source:'Natural Earth 1:50m · domaine public',commit:'ca96624a56bd078437bca8184e78163e5039ad19',extent};
for(const [key,name] of Object.entries(layers)){
 const data=JSON.parse(fs.readFileSync(path.join(source,`ne_50m_${name}.geojson`)));
 out[key]=data.features.flatMap(f=>{const g=geometry(f.geometry),p=f.properties;if(!g)return [];if(key==='cities'&&p.ADM0CAP!==1&&p.POP_MAX<1000000)return [];
  return [{geometry:g,properties:key==='countries'?{name:p.NAME_FR||p.NAME,label:[p.LABEL_X,p.LABEL_Y]}:key==='cities'?{name:p.NAME_FR||p.NAME,capital:p.ADM0CAP===1}:{} }];});
}
const target=new URL('../data/europe-export.geojson',import.meta.url);fs.writeFileSync(target,JSON.stringify(out));console.log(Object.fromEntries(Object.entries(layers).map(([k])=>[k,out[k].length])),fs.statSync(target).size+' octets');
