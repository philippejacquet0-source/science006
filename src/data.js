export const HOUR = 3_600_000;
export const MAX_MEASUREMENTS = 250_000;

export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function number(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error(`${label} manquant.`);
  const n = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${label} invalide : « ${String(value).slice(0, 60)} ».`);
  return n;
}

function unitFactor(unit) {
  const normalized = String(unit ?? '').trim().replace(/[μµ]/g, 'u').toLowerCase().replace(/\s/g, '');
  if (normalized === 'nsv/h') return 1;
  if (normalized === 'usv/h') return 1000;
  throw new Error(`Unité « ${String(unit ?? '').slice(0, 30)} » non prise en charge. Précisez nSv/h ou µSv/h.`);
}

export function parseTimestamp(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 100_000_000_000 || value > 10_000_000_000_000) throw new Error('Horodatage numérique attendu en millisecondes Unix.');
    return value;
  }
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/i.exec(text);
  if (!match) throw new Error(`Horodatage « ${text.slice(0, 50)} » : utilisez une date ISO avec fuseau, par exemple 2026-10-06T12:00:00Z.`);
  const [,year,month,day,hour,minute,second] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month)<1 || Number(month)>12 || Number(day)<1 || Number(day)>daysInMonth || Number(hour)>23 || Number(minute)>59 || Number(second || 0)>59) throw new Error(`Date ou heure impossible : « ${text.slice(0, 50)} ».`);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`Horodatage invalide : « ${text.slice(0, 50)} ».`);
  return timestamp;
}

export function normalizeDataset(input) {
  if (input?.format === 'remap-capture-v1') return parseRemapCapture(input);
  if (!input || !Array.isArray(input.stations) || !Array.isArray(input.observations)) throw new Error('Le JSON doit contenir deux tableaux : stations et observations. Consultez le fichier exemple.');
  if (!input.stations.length || !input.observations.length) throw new Error('Le fichier ne contient pas de balises ou de mesures.');
  if (input.observations.length > MAX_MEASUREMENTS) throw new Error(`Maximum ${MAX_MEASUREMENTS.toLocaleString('fr-FR')} mesures par session. Sélectionnez une région ou une période plus courte.`);
  if (input.stations.length > 6000) throw new Error('Maximum 6 000 balises par session.');
  const ids = new Set();
  const stations = input.stations.map((station, index) => {
    const id = String(station.id ?? '').trim();
    if (!id || id.length > 120) throw new Error(`Identifiant invalide pour la balise ${index + 1}.`);
    if (ids.has(id)) throw new Error(`Identifiant de balise répété : ${id}.`);
    ids.add(id);
    const lat = number(station.lat, `Latitude de ${id}`), lon = number(station.lon, `Longitude de ${id}`);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`Coordonnées hors limites pour ${id}.`);
    return { id, name: String(station.name || id).slice(0, 160), lat, lon, country: String(station.country || '').slice(0, 60) };
  });
  const seen = new Map();
  const observations = [];
  let duplicates = 0;
  for (const [index, reading] of input.observations.entries()) {
    const stationId = String(reading.stationId ?? '').trim();
    if (!ids.has(stationId)) throw new Error(`Mesure ${index + 1} : balise « ${stationId.slice(0, 60)} » inconnue.`);
    const time = parseTimestamp(reading.time);
    const value = number(reading.value, `Valeur à la ligne ${index + 1}`) * unitFactor(reading.unit ?? input.unit);
    if (value < 0) throw new Error(`Débit de dose négatif à la ligne ${index + 1}.`);
    const key = `${stationId}\u0000${time}`;
    if (seen.has(key)) {
      if (Math.abs(seen.get(key) - value) > 1e-8) throw new Error(`Mesures contradictoires pour ${stationId} à ${new Date(time).toISOString()}.`);
      duplicates++;
      continue;
    }
    seen.set(key, value);
    observations.push({ stationId, time, value });
  }
  observations.sort((a, b) => a.time - b.time || a.stationId.localeCompare(b.stationId));
  const minTime = observations[0].time, maxTime = observations.at(-1).time;
  if (maxTime - minTime > 120 * 24 * HOUR) throw new Error('Ce prototype accepte au maximum 120 jours par session.');
  return { stations, observations, unit: 'nSv/h', minTime, maxTime, duplicates, name: String(input.name || 'Données importées').slice(0, 160), synthetic: input.synthetic === true };
}

function captureRows(resource) {
  if (/\/timeseries\/v1\/stations\/timeseries\//.test(resource?.path || '') && Array.isArray(resource.data)) return {type:'series',rows:resource.data};
  if (/\/timeseries\/v1\/stations\/\d{14}\/\d{14}\/area$/.test(resource?.path || '') && Array.isArray(resource.data?.data)) return {type:'stations',rows:resource.data.data};
  return {type:'other',rows:[]};
}

function usableStation(record) {
  return record && typeof record.code === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{1,119}$/.test(record.code)
    && typeof record.lat === 'number' && Number.isFinite(record.lat) && Math.abs(record.lat)<=90
    && typeof record.long === 'number' && Number.isFinite(record.long) && Math.abs(record.long)<=180;
}

export function summarizeCapture(input) {
  if (!input || !Array.isArray(input.resources) || input.resources.length>400) throw new Error('Capture REMAP invalide : tableau resources attendu, avec au maximum 400 réponses.');
  const summary={resources:input.resources.length,stationResponses:0,seriesResponses:0,stationRows:0,measurementRows:0,usableStationRows:0,series:[],clientScripts:input.client?.scripts || []};
  for (const resource of input.resources) {
    const {type,rows}=captureRows(resource);
    if(type==='stations') {summary.stationResponses++;summary.stationRows+=rows.length;summary.usableStationRows+=rows.filter(usableStation).length;}
    if(type==='series') {
      summary.seriesResponses++;summary.measurementRows+=rows.length;
      let start=null,end=null;
      for(const row of rows){try{const t=parseTimestamp(row.date);start=start===null?t:Math.min(start,t);end=end===null?t:Math.max(end,t);}catch{}}
      summary.series.push({count:rows.length,start,end,stage:resource.stage || 'network'});
    }
  }
  return summary;
}

export function parseRemapCapture(input) {
  const summary=summarizeCapture(input);
  const metadata=new Map();
  for(const resource of input.resources) {
    if(resource.stage!=='application')continue;
    const {type,rows}=captureRows(resource);
    if(type!=='stations')continue;
    for(const row of rows) if(usableStation(row)) {
      const station={id:row.code,name:row.name || row.code,country:row.country || '',lat:row.lat,lon:row.long};
      const previous=metadata.get(station.id);
      if(previous&&(Math.abs(previous.lat-station.lat)>1e-6||Math.abs(previous.lon-station.lon)>1e-6))throw new Error(`Coordonnées contradictoires dans la capture pour ${station.id}.`);
      if(!previous)metadata.set(station.id,station);
    }
  }
  const observations=[];
  for(const resource of input.resources) {
    if(resource.stage!=='application')continue;
    const {type,rows}=captureRows(resource);
    if(type!=='series')continue;
    for(const row of rows) if(metadata.has(row.code))observations.push({stationId:row.code,time:row.date,value:row.value});
  }
  if(!observations.length) {
    const encoded=summary.stationRows>0&&summary.usableStationRows===0;
    const error=new Error(encoded
      ? `Capture reconnue : ${summary.stationResponses} listes de balises et ${summary.seriesResponses} séries (${summary.measurementRows} points). Les identifiants et coordonnées sont encodés dans les réponses réseau ; ils ne peuvent pas être interprétés comme des mesures affichées. Reprenez une capture avec l’outil mis à jour, puis sélectionnez les balises et ouvrez leurs courbes.`
      : 'Capture reconnue, mais aucune série après traitement par REMAP ne correspond à une balise avec des coordonnées exploitables. Utilisez l’outil mis à jour et capturez la liste de balises et leurs séries dans la même session. Les réponses réseau seules ne sont pas interprétées.');
    error.captureSummary=summary;
    throw error;
  }
  const used=new Set(observations.map(o=>o.stationId));
  const dataset=normalizeDataset({name:'Capture REMAP',unit:'nSv/h',stations:[...metadata.values()].filter(s=>used.has(s.id)),observations});
  dataset.captureSummary={...summary,importedStations:dataset.stations.length,importedMeasurements:dataset.observations.length,unmatchedMeasurements:summary.measurementRows-observations.length};
  return dataset;
}

export function parseCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, '');
  const firstLine = cleaned.split(/\r?\n/, 1)[0];
  // Count delimiters outside quoted header fields.
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of firstLine) { if (c === '"') quoted = !quoted; else if (!quoted && c in counts) counts[c]++; }
  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = [];
  let row = [], field = '', insideQuote = false, closedQuote = false;
  function finishField() { row.push(field); field = ''; closedQuote = false; }
  function finishRow() { finishField(); if (row.some(value => value.trim())) rows.push(row); row = []; }
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (insideQuote) {
      if (c === '"') { if (cleaned[i + 1] === '"') { field += '"'; i++; } else { insideQuote = false; closedQuote = true; } }
      else field += c;
    } else if (c === '"' && field === '' && !closedQuote) insideQuote = true;
    else if (c === delimiter) finishField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && cleaned[i + 1] === '\n') i++; finishRow(); }
    else { if (closedQuote && c.trim()) throw new Error('CSV invalide : texte après un champ entre guillemets.'); field += c; }
  }
  if (insideQuote) throw new Error('CSV invalide : guillemet non fermé.');
  if (field || row.length) finishRow();
  if (rows.length < 2) throw new Error('Le CSV doit contenir un en-tête et au moins une mesure.');
  const headers = rows.shift().map(h => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('Le CSV contient des noms de colonnes répétés.');
  const required = ['station_id', 'latitude', 'longitude', 'timestamp', 'value', 'unit'];
  for (const header of required) if (!headers.includes(header)) throw new Error(`Colonne CSV manquante : ${header}.`);
  if (rows.length > MAX_MEASUREMENTS) throw new Error(`Le fichier dépasse ${MAX_MEASUREMENTS} mesures.`);
  const stations = new Map(), observations = [];
  for (const [index, cells] of rows.entries()) {
    if (cells.length !== headers.length) throw new Error(`Ligne ${index + 2} : ${cells.length} champs au lieu de ${headers.length}.`);
    const record = Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()]));
    const id = record.station_id;
    const station = { id, name: record.station_name || id, lat: number(record.latitude, `Latitude ligne ${index + 2}`), lon: number(record.longitude, `Longitude ligne ${index + 2}`), country: record.country || '' };
    const previous = stations.get(id);
    if (previous && (previous.lat !== station.lat || previous.lon !== station.lon)) throw new Error(`Coordonnées contradictoires pour ${id}.`);
    if (!previous) stations.set(id, station);
    observations.push({ stationId: id, time: record.timestamp, value: record.value, unit: record.unit });
  }
  return normalizeDataset({ stations: [...stations.values()], observations });
}

export function readDataset(text, filename) {
  return filename.toLowerCase().endsWith('.csv') ? parseCSV(text) : normalizeDataset(JSON.parse(text));
}

export function serializeDataset(dataset) {
  return JSON.stringify({ schema: 'remanence-v1', name: dataset.name, synthetic: dataset.synthetic, unit: 'nSv/h', stations: dataset.stations, observations: dataset.observations.map(o => ({ ...o, time: new Date(o.time).toISOString() })) });
}
