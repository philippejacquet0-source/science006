import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
SITE_URL=os.environ.get("REMANENCE_TEST_URL", "http://127.0.0.1:4173/").rstrip("/")+"/"
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1150},device_scale_factor=1)
  errors=[]; requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:requests.append(r.url))
  await page.goto(SITE_URL,wait_until='networkidle')
  await page.wait_for_function("document.querySelector('#stat-active').textContent !== '—'")
  assert await page.locator('#source-tag').inner_text()=='SIMULATION'
  assert int(await page.locator('#stat-events').inner_text())>=1
  assert await page.locator('.station-dot').count()==96
  await page.screenshot(path='/tmp/remanence-desktop.png',full_page=True)
  before=await page.locator('#timeline-date').inner_text()
  await page.locator('#play-button').click();await page.wait_for_timeout(850);await page.locator('#play-button').click()
  assert await page.locator('#timeline-date').inner_text()!=before
  await page.locator('#time-slider').evaluate("e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));}")
  assert '09 octobre' in await page.locator('#timeline-date').inner_text()
  await page.locator('#station-select').select_option(index=63)
  assert 'Kuopio' in await page.locator('#station-title').inner_text()
  assert await page.locator('#station-chart path').count()>=1
  await page.locator('.event-item').last.click()
  assert await page.locator('.event-item').last.get_attribute('aria-pressed')=='true'
  await page.locator('#zoom-in').click();assert 'scale(1.25)' in await page.locator('#map-content').get_attribute('transform')
  await page.locator('#settings-button').click();await page.locator('#threshold-setting').fill('8');await page.locator('#settings-form button[type=submit]').click()
  await page.wait_for_function("!document.querySelector('#settings-dialog').open")
  assert 'seuil 8' in await page.locator('#station-summary').inner_text()
  await page.locator('#import-button').click();await page.locator('#data-file').set_input_files(str(ROOT/'data/exemple.csv'));await page.locator('#import-submit').click()
  await page.wait_for_function("document.querySelector('#source-tag').textContent === 'FICHIER LOCAL'")
  assert await page.locator('.station-dot').count()==3
  assert await page.locator('#stat-events').inner_text()=='1'
  assert await page.locator('#stat-reference').inner_text()=='3 / 3'
  assert not await page.locator('#import-dialog').evaluate('e=>e.open')
  async with page.expect_download() as download_info: await page.locator('#export-button').click()
  download=await download_info.value;path=await download.path();data=json.loads(Path(path).read_text())
  assert len(data['stations'])==3 and len(data['observations'])==216 and data['analysisSettings']['threshold']==4
  await page.locator('#import-button').click();await page.locator('#data-file').set_input_files({'name':'bad.csv','mimeType':'text/csv','buffer':b'station_id,value\nA,100'})
  await page.locator('#import-submit').click();await page.locator('#import-error').wait_for(state='visible')
  assert await page.locator('.station-dot').count()==3
  await page.locator('#import-dialog .close-dialog').click()
  await page.locator('#demo-button').click();await page.wait_for_function("document.querySelector('#source-tag').textContent === 'SIMULATION'")
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(250)
  assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  await page.locator('#toast').evaluate('e=>e.hidden=true');await page.screenshot(path='/tmp/remanence-mobile.png',full_page=True)
  await page.goto(SITE_URL+'tools/',wait_until='networkidle')
  assert (await page.locator('#bookmarklet').get_attribute('href')).startswith('javascript:')
  assert not errors, errors
  assert all(u.startswith(SITE_URL) for u in requests), requests
  print(json.dumps({'browser':'Chromium','desktop':'1440px','mobile':'390px','checks':['demo','animation','timeline','station selection','event selection','zoom','settings','CSV import','JSON export','invalid import preservation','responsive layout','bookmarklet installation','no external requests','no JavaScript errors']},ensure_ascii=False))
  await browser.close()
asyncio.run(main())
