export function validateCatalogue(data){
 if(data?.format!=='bouffi-datasets-v1'||!Array.isArray(data.datasets)||!data.datasets.length)throw new Error('Catalogue des jeux en ligne invalide.');
 const ids=new Set(),local=path=>typeof path==='string'&&/^\.\/data\/[A-Za-z0-9_./-]+$/.test(path)&&!path.split('/').includes('..');
 for(const d of data.datasets){if(typeof d.id!=='string'||ids.has(d.id)||typeof d.label!=='string'||!local(d.meta)||!local(d.values)||(d.archive&&!local(d.archive)))throw new Error('Entrée du catalogue invalide.');ids.add(d.id);}
 if(!ids.has(data.defaultDataset))throw new Error('Jeu par défaut absent du catalogue.');return data;
}
export function validateHourly(meta,values){
 if(meta?.format!=='remap-hourly-v1'||meta.unit!=='nSv/h'||!Number.isInteger(meta.N)||meta.N<1||!Number.isInteger(meta.T)||meta.T<1||meta.N*meta.T>12000000||!Array.isArray(meta.stations)||meta.stations.length!==meta.N||values.length!==meta.N*meta.T||!Number.isFinite(meta.origin))throw new Error('Dimensions ou format du jeu en ligne incohérents.');
 for(const value of values)if(!Number.isNaN(value)&&(!Number.isFinite(value)||value<0))throw new Error('Valeur invalide dans le jeu en ligne.');
 return meta;
}
