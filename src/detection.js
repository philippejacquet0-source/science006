import { HOUR, median } from './data.js';

export const DEFAULT_SETTINGS = { threshold: 4, minDuration: 2, radiusKm: 180, minStations: 3, baselineDays: 14, noiseFloor: 1.5 };
export function haversine(a, b) {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function analyze(dataset, settings) {
  const opts = { ...DEFAULT_SETTINGS, ...settings };
  if (!Number.isFinite(opts.start) || !Number.isFinite(opts.end) || opts.start > opts.end) throw new Error('La période d’analyse est invalide.');
  for (const key of ['threshold','minDuration','radiusKm','minStations','baselineDays','noiseFloor']) if (!Number.isFinite(opts[key]) || opts[key] <= 0) throw new Error(`Paramètre invalide : ${key}.`);
  const start = Math.floor(opts.start / HOUR) * HOUR, end = Math.floor(opts.end / HOUR) * HOUR;
  const count = Math.floor((end - start) / HOUR) + 1;
  if (count > 120 * 24 + 1 || count < 1) throw new Error('Choisissez une période comprise entre une heure et 120 jours.');
  const timestamps = Array.from({ length: count }, (_, i) => start + i * HOUR);
  const map = new Map(dataset.stations.map(s => [s.id, { ...s, buckets: new Map() }]));
  for (const o of dataset.observations) {
    const station = map.get(o.stationId), time = Math.floor(o.time / HOUR) * HOUR;
    const bucket = station.buckets.get(time) || { sum: 0, count: 0 };
    bucket.sum += o.value; bucket.count++;
    station.buckets.set(time, bucket);
  }
  const stations = [...map.values()].map(station => {
    const reference = [...station.buckets].filter(([t]) => t >= start - opts.baselineDays * 24 * HOUR && t < start).map(([,b]) => b.sum / b.count);
    const validReference = reference.length >= 24;
    const baseline = validReference ? median(reference) : null;
    const scale = validReference ? Math.max(opts.noiseFloor, 1.4826 * median(reference.map(v => Math.abs(v - baseline)))) : null;
    const values = timestamps.map(t => { const b = station.buckets.get(t); return b ? b.sum / b.count : null; });
    const scores = values.map(v => v !== null && validReference ? (v - baseline) / scale : null);
    const active = new Array(count).fill(false);
    const runs = [];
    let beginning = null;
    function closeRun(index) {
      if (beginning !== null && index - beginning >= opts.minDuration) {
        runs.push({ start: beginning, end: index - 1 });
        for (let j = beginning; j < index; j++) active[j] = true;
      }
      beginning = null;
    }
    for (let i = 0; i <= count; i++) {
      if (i < count && scores[i] !== null && scores[i] > opts.threshold) { if (beginning === null) beginning = i; }
      else closeRun(i);
    }
    const { buckets, ...metadata } = station;
    return { ...metadata, baseline, scale, referenceCount: reference.length, validReference, values, scores, active, runs, coverage: values.filter(v => v !== null).length / count };
  });
  // Build adjacency once. Latitude/longitude bins avoid comparing every pair on a large network.
  const neighbors = new Map(stations.map(s => [s.id, []]));
  const latitudeBand = opts.radiusKm / 111;
  const bins = new Map();
  for (const s of stations) {
    const bin = Math.floor(s.lat / latitudeBand);
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin).push(s);
  }
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i], bin = Math.floor(s.lat / latitudeBand);
    for (let k = bin - 1; k <= bin + 1; k++) for (const t of bins.get(k) || []) {
      if (s.id >= t.id) continue;
      if (haversine(s, t) <= opts.radiusKm) { neighbors.get(s.id).push(t.id); neighbors.get(t.id).push(s.id); }
    }
  }
  const byId = new Map(stations.map(s => [s.id, s])), activity = [], groupsByTime = [];
  for (let i = 0; i < count; i++) {
    const activeStations = stations.filter(s => s.active[i]);
    activity.push(activeStations.length);
    const remaining = new Set(activeStations.map(s => s.id)), groups = [];
    while (remaining.size) {
      const seed = remaining.values().next().value, stack = [seed], ids = [];
      remaining.delete(seed);
      while (stack.length) {
        const id = stack.pop(); ids.push(id);
        for (const neighbor of neighbors.get(id)) if (remaining.delete(neighbor)) stack.push(neighbor);
      }
      if (ids.length < opts.minStations) continue;
      const members = ids.map(id => byId.get(id));
      const centroid = { lat: members.reduce((sum,s) => sum+s.lat,0)/members.length, lon: members.reduce((sum,s) => sum+s.lon,0)/members.length };
      groups.push({ ids, centroid, index: i, maxExcess: Math.max(...members.map(s => s.values[i] - s.baseline)), maxScore: Math.max(...members.map(s => s.scores[i])) });
    }
    groupsByTime.push(groups);
  }
  // Match consecutive groups by overlap, then proximity. One-to-one matching makes splits explicit.
  const events = [];
  let previous = [];
  for (let i = 0; i < count; i++) {
    const current = groupsByTime[i], matches = [];
    for (let a = 0; a < current.length; a++) for (let b = 0; b < previous.length; b++) {
      const old = previous[b], shared = current[a].ids.filter(id => old.ids.includes(id)).length;
      const distance = haversine(current[a].centroid, old.centroid);
      if (shared || distance <= Math.min(opts.radiusKm, 100)) matches.push({a,b,shared,distance});
    }
    matches.sort((a,b) => b.shared-a.shared || a.distance-b.distance);
    const usedNew = new Set(), usedOld = new Set();
    for (const match of matches) if (!usedNew.has(match.a) && !usedOld.has(match.b)) {
      current[match.a].eventId = previous[match.b].eventId; usedNew.add(match.a); usedOld.add(match.b);
    }
    for (const group of current) {
      if (group.eventId === undefined) { group.eventId = events.length; events.push({id:group.eventId, startIndex:i, endIndex:i, points:[],stationIds:[],maxExcess:0,maxConcurrent:0}); }
      const event = events[group.eventId];
      event.points.push(group); event.endIndex=i; event.maxExcess=Math.max(event.maxExcess,group.maxExcess);event.maxConcurrent=Math.max(event.maxConcurrent,group.ids.length);
    }
    previous = current;
  }
  for (const event of events) {
    event.stationIds = [...new Set(event.points.flatMap(p => p.ids))];
    const first = event.points[0], last = event.points.at(-1);
    function nearest(point) { return point.ids.map(id => byId.get(id)).sort((a,b) => haversine(a,point.centroid)-haversine(b,point.centroid))[0]; }
    event.firstStation = nearest(first).name; event.lastStation = nearest(last).name;
    event.durationHours = event.endIndex - event.startIndex + 1;
    event.startTime = timestamps[event.startIndex]; event.endTime = timestamps[event.endIndex];
  }
  return { settings:opts, timestamps, stations, events, activity, groupsByTime, referenceCount:stations.filter(s => s.validReference).length };
}
