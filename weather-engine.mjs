// Weather fields are sampled model output. No radiological source map or
// particle concentration is used to detect or follow precipitation objects.
export const HOUR = 3600000;
const finiteOrNull = v => v === null || typeof v === 'number' && Number.isFinite(v);
const utc = s => typeof s === 'string' && /Z$/.test(s) && Number.isFinite(Date.parse(s));

export function validateWeather(pack) {
  if (!pack || pack.format !== 'bouffi-weather-v1') throw new Error('Format météo non reconnu.');
  const g = pack.grid, frames = pack.frames;
  if (!g || !Array.isArray(g.lats) || !Array.isArray(g.lons) || !Number.isFinite(g.step) || g.step <= 0 || g.step > 10) throw new Error('Grille météo invalide.');
  for (const [axis, limit] of [[g.lats, 90], [g.lons, 180]]) {
    if (axis.length < 2 || axis.some((v, i) => !Number.isFinite(v) || Math.abs(v) > limit || i && Math.abs(v - axis[i - 1] - g.step) > 1e-6)) throw new Error('Coordonnées météo irrégulières.');
  }
  const size = g.lats.length * g.lons.length;
  if (size > 10000 || !Array.isArray(frames) || !frames.length || frames.length > 1000 || size * frames.length > 2000000) throw new Error('Volume météo non pris en charge.');
  if (!pack.source || !['archive', 'forecast'].includes(pack.source.kind)) throw new Error('Provenance météo manquante.');
  if (pack.source.kind === 'forecast' && !utc(pack.source.runInitializedAt)) throw new Error('Initialisation de la prévision manquante.');
  if (pack.precipitationInterval !== '[time,time+1h)' || pack.units?.water !== 'kg/m²' || pack.units?.rain !== 'mm' || pack.units?.u850 !== 'm/s' || pack.units?.v850 !== 'm/s') throw new Error('Unités ou intervalle de précipitations incompatibles.');
  for (let t = 0; t < frames.length; t++) {
    const f = frames[t], epoch = Date.parse(f.time);
    if (!utc(f.time) || epoch % HOUR || t && epoch <= Date.parse(frames[t - 1].time) || pack.source.kind === 'forecast' && epoch < Date.parse(pack.source.runInitializedAt)) throw new Error('Chronologie météo invalide.');
    for (const key of ['water', 'rain', 'u850', 'v850']) {
      if (!Array.isArray(f[key]) || f[key].length !== size || f[key].some(v => !finiteOrNull(v) || v !== null && ['rain', 'water'].includes(key) && v < 0)) throw new Error('Champ météo incomplet ou invalide.');
    }
  }
  return pack;
}

export function frameAt(pack, epoch) {
  if (!pack || !Number.isFinite(epoch)) return null;
  // Exact hour only: missing hours never become an interpolated observation.
  let lo = 0, hi = pack.frames.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, time = Date.parse(pack.frames[mid].time);
    if (time === epoch) return pack.frames[mid];
    if (time < epoch) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

export function forecastEligible(pack, epoch) {
  // Publication time was not archived. Six hours is a conservative guard,
  // not evidence that the run had actually been published by that time.
  return pack.source.kind !== 'forecast' || Date.parse(pack.source.runInitializedAt) + 6 * HOUR <= epoch;
}

export function gridIndex(grid, point) {
  const y = Math.round((point.lat - grid.lats[0]) / grid.step), x = Math.round((point.lon - grid.lons[0]) / grid.step);
  return x < 0 || y < 0 || x >= grid.lons.length || y >= grid.lats.length ? -1 : y * grid.lons.length + x;
}

export function cellBounds(grid, index) {
  const lat = grid.lats[Math.floor(index / grid.lons.length)], lon = grid.lons[index % grid.lons.length], half = grid.step / 2;
  return [[lat - half, lon - half], [lat + half, lon + half]];
}

export function sampleWeather(pack, frame, point) {
  const i = gridIndex(pack.grid, point);
  if (!frame || i < 0) return null;
  return {water: frame.water[i], rain: frame.rain[i], u850: frame.u850[i], v850: frame.v850[i], index: i};
}

function neighbors(i, grid, diagonal = false) {
  const width = grid.lons.length, y = Math.floor(i / width), x = i % width, result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || !diagonal && dx && dy) continue;
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < grid.lats.length && xx >= 0 && xx < width) result.push(yy * width + xx);
  }
  return result;
}

export function rainObjects(pack, frame, threshold = 0.2) {
  if (!frame) return [];
  const seen = new Set(), objects = [];
  for (let i = 0; i < frame.rain.length; i++) {
    if (seen.has(i) || frame.rain[i] === null || frame.rain[i] < threshold) continue;
    const cells = [i]; seen.add(i);
    for (let p = 0; p < cells.length; p++) for (const j of neighbors(cells[p], pack.grid)) {
      if (!seen.has(j) && frame.rain[j] !== null && frame.rain[j] >= threshold) { seen.add(j); cells.push(j); }
    }
    objects.push({cells, maxRain: Math.max(...cells.map(j => frame.rain[j]))});
  }
  return objects;
}

export function associateRain(pack, frame, stations, threshold = 0.2) {
  const objects = rainObjects(pack, frame, threshold), samples = stations.map(p => gridIndex(pack.grid, p)).filter(i => i >= 0);
  return objects.map(o => {
    const set = new Set(o.cells), hits = samples.filter(i => set.has(i)).length;
    return {...o, hits, support: new Set(samples.filter(i => set.has(i))).size, covered: samples.length};
  }).filter(o => o.hits > 0).sort((a, b) => b.support - a.support || b.hits - a.hits || b.maxRain - a.maxRain);
}

export function followRain(pack, epoch, cells, hours, threshold = 0.2) {
  if (!cells?.length || !Number.isInteger(hours) || hours < 0 || hours > 24) return null;
  let previous = new Set(cells), branches = 1;
  for (let step = 1; step <= hours; step++) {
    const frame = frameAt(pack, epoch + step * HOUR);
    if (!frame) return null;
    const reach = new Set(previous);
    for (const i of previous) for (const j of neighbors(i, pack.grid, true)) reach.add(j);
    const next = rainObjects(pack, frame, threshold).filter(o => o.cells.some(i => reach.has(i)));
    if (!next.length) return null;
    previous = new Set(next.flatMap(o => o.cells)); branches = next.length;
  }
  return {time: new Date(epoch + hours * HOUR).toISOString(), cells: [...previous], branches};
}

export function nullschoolUrl(epoch, layer = 'total_cloud_water') {
  const date = new Date(epoch).toISOString();
  const stamp = `${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(11, 13)}00Z`;
  return `https://earth.nullschool.net/fr/#${stamp}/wind/surface/level/overlay=${layer}/orthographic=9.37,45.16,973`;
}
