#!/usr/bin/env python3
"""Cache real GFS water/precipitation fields for the static Bouffi site.

Standard library only. Requests are sequential, resumable and limited to 240
locations per minute. No radiological observations are sent to the provider.
"""
import argparse
import datetime as dt
import gzip
import json
import math
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ['precipitation', 'total_column_integrated_water_vapour',
          'wind_speed_850hPa', 'wind_direction_850hPa']
JOBS = [
    ('archive-20261013', 'archive', '2026-10-13', '2026-10-21', None),
    ('archive-20261002', 'archive', '2026-10-02', '2026-10-10', None),
    ('run-20261019', 'forecast', None, None, '2026-10-19T00:00'),
    ('run-20261016', 'forecast', None, None, '2026-10-16T00:00'),
    ('run-20261006', 'forecast', None, None, '2026-10-06T00:00'),
]


def rounded(value, digits=2):
    return round(value, digits) if isinstance(value, (int, float)) and math.isfinite(value) else None


def prepare(job, step, cache, output):
    name, kind, start, end, run = job
    lats = list(range(34, 67, step))
    lons = list(range(-16, 37, step))
    points = [(lat, lon) for lat in lats for lon in lons]
    batches = []
    request_times = []
    for offset in range(0, len(points), 40):
        target = cache / f'{name}-{step}-{offset}.json'
        if target.exists():
            response = json.loads(target.read_text())
        else:
            # A conservative sliding window, including calls from this process.
            now = time.monotonic()
            request_times = [t for t in request_times if now - t < 61]
            if len(request_times) >= 6:
                time.sleep(max(0, 61 - (now - request_times[0])))
            batch = points[offset:offset + 40]
            params = dict(latitude=','.join(str(p[0]) for p in batch),
                          longitude=','.join(str(p[1]) for p in batch),
                          hourly=','.join(FIELDS), models='gfs_global',
                          timezone='GMT', wind_speed_unit='ms', cell_selection='nearest')
            if kind == 'archive':
                host = 'historical-forecast-api.open-meteo.com'
                params.update(start_date=start, end_date=end)
            else:
                host = 'single-runs-api.open-meteo.com'
                params.update(run=run, forecast_days=7)
            url = f'https://{host}/v1/forecast?' + urllib.parse.urlencode(params)
            for attempt in range(3):
                try:
                    request_times.append(time.monotonic())
                    with urllib.request.urlopen(url, timeout=50) as resp:
                        response = json.load(resp)
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                        raise
                    time.sleep(61 if exc.code == 429 else 5 * (attempt + 1))
            if isinstance(response, dict):
                response = [response]
            if len(response) != len(batch):
                raise ValueError('The provider returned the wrong location count')
            target.write_text(json.dumps(response, separators=(',', ':')))
        batches.extend(response)
        print(f'{name}: {min(offset + 40, len(points))}/{len(points)} positions', flush=True)
    times = batches[0]['hourly']['time']
    for row in batches:
        if row.get('utc_offset_seconds') != 0 or row['hourly']['time'] != times:
            raise ValueError('Inconsistent UTC time axes')
        units = row['hourly_units']
        if units['precipitation'] != 'mm' or units['total_column_integrated_water_vapour'] != 'kg/m²' or units['wind_speed_850hPa'] != 'm/s':
            raise ValueError('Unexpected weather units')
    frames = []
    # At time t radiation is averaged over [t,t+1h). Provider precipitation at
    # t+1h is the preceding-hour sum, so use index i+1, never index i.
    for i, stamp in enumerate(times[:-1]):
        frame = dict(time=stamp + ':00Z', water=[], rain=[], u850=[], v850=[])
        for row in batches:
            h = row['hourly']
            frame['water'].append(rounded(h[FIELDS[1]][i]))
            frame['rain'].append(rounded(h[FIELDS[0]][i + 1]))
            speed, direction = h[FIELDS[2]][i], h[FIELDS[3]][i]
            if speed is None or direction is None:
                u = v = None
            else:
                angle = math.radians(direction)
                u, v = -speed * math.sin(angle), -speed * math.cos(angle)
            frame['u850'].append(rounded(u))
            frame['v850'].append(rounded(v))
        frames.append(frame)
    source = dict(provider='Open-Meteo', model='NOAA GFS · gfs_global', kind=kind,
                  fetchedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                  licence='CC BY 4.0',
                  documentation='https://open-meteo.com/en/docs/' + ('historical-forecast-api' if kind == 'archive' else 'single-runs-api'),
                  runInitializedAt=run + ':00Z' if run else None,
                  runPublicationTimeKnown=False)
    result = dict(format='bouffi-weather-v1', source=source,
                  grid=dict(lats=lats, lons=lons, step=step, sampled=True),
                  precipitationInterval='[time,time+1h)',
                  units=dict(water='kg/m²', rain='mm', u850='m/s', v850='m/s'), frames=frames)
    output.mkdir(parents=True, exist_ok=True)
    path = output / (name + '.json.gz')
    path.write_bytes(gzip.compress(json.dumps(result, separators=(',', ':'), allow_nan=False).encode(), mtime=0))
    print(f'Saved {path.name}: {len(frames)} hours, {len(points)} positions, {path.stat().st_size} bytes', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job', choices=[j[0] for j in JOBS], action='append')
    parser.add_argument('--step', type=int, default=2, choices=[2, 3, 4])
    parser.add_argument('--cache', type=Path, default=ROOT.parent / 'weather-download-cache')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    for job in JOBS:
        if not args.job or job[0] in args.job:
            prepare(job, args.step, args.cache, ROOT / 'data/weather')
