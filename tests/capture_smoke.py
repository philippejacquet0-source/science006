"""Exercise the capture helper against mock responses, never a real CAPTCHA."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page()
  requests=[]; errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def mocked(route):
   url=route.request.url;requests.append(url)
   if '/data-' in url:
    await route.fulfill(content_type='application/json',body=json.dumps({'stations':[{'id':'TEST','lat':48,'lon':-4}], 'values':[100,120], 'token':'FAKE_TEST_VALUE'}))
   else:
    await route.fulfill(content_type='text/html',body='<html><body><h1>Mock map session</h1></body></html>')
  await page.route('https://remap.jrc.ec.europa.eu/**',mocked)
  await page.goto('https://remap.jrc.ec.europa.eu/Advanced.aspx')
  await page.evaluate('()=>{window.originalFetchForTest=window.fetch;window.originalOpenForTest=XMLHttpRequest.prototype.open;window.originalSendForTest=XMLHttpRequest.prototype.send;}')
  await page.evaluate('()=>{function mockJQuery(){return {on:(name,handler)=>{window.ajaxObserverForTest=handler;},off:()=>{delete window.ajaxObserverForTest;}};}mockJQuery.fn={jquery:"mock"};window.jQuery=mockJQuery;}')
  await page.evaluate((ROOT/'tools/remap-capture.js').read_text())
  assert len(requests)==1, 'The helper must not initiate requests.'
  response=await page.evaluate("async()=>{const r=await fetch('/data-fetch?private=FAKE_TEST_VALUE');return await r.json()}")
  assert response['values']==[100,120] and response['token']=='FAKE_TEST_VALUE'
  await page.evaluate("()=>new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET','/data-xhr');xhr.responseType='json';xhr.onload=()=>resolve(xhr.response.values);xhr.onerror=reject;xhr.send();})")
  await page.wait_for_function("document.querySelector('div').shadowRoot.querySelector('#status').textContent.startsWith('2 réponses')")
  root=page.locator('div').first
  async with page.expect_download() as download_info:await root.locator('#download').click()
  download=await download_info.value;path=await download.path();bundle=json.loads(Path(path).read_text())
  assert bundle['format']=='remap-capture-v1' and len(bundle['resources'])==2
  for resource in bundle['resources']:
   assert '?' not in resource['path']
   assert 'token' not in resource['data'] and resource['data']['values']==[100,120]
  assert len(requests)==3,requests
  assert bundle['toolVersion']==2 and bundle['client']['jquery']=='mock'
  await page.evaluate('''()=>{const data={data:[{code:'encoded',lat:9000,long:9000}]};window.ajaxObserverForTest(null,null,{url:'/mapSvc/api/timeseries/v1/stations/20261002000000/20261009183216/area'},data);data.data[0]={code:'FR001',name:'Test',country:'FR',lat:48,long:-4};}''')
  await page.wait_for_function("document.querySelector('div').shadowRoot.querySelector('#status').textContent.includes('1 états client')")
  async with page.expect_download() as second_download_info:await root.locator('#download').click()
  second_download=await second_download_info.value
  second_bundle=json.loads(Path(await second_download.path()).read_text())
  processed=[r for r in second_bundle['resources'] if r['stage']=='application']
  assert len(processed)==1 and processed[0]['data']['data'][0]['lat']==48
  assert len(requests)==3, 'Observing post-processing must not issue a request.'
  await root.locator('#stop').click()
  assert await page.evaluate('window.fetch===window.originalFetchForTest&&XMLHttpRequest.prototype.open===window.originalOpenForTest&&XMLHttpRequest.prototype.send===window.originalSendForTest')
  assert await page.evaluate('window.__remanenceCapture===undefined&&window.ajaxObserverForTest===undefined')
  assert not errors,errors
  # The consent guard exits before installing any interceptor.
  await page.goto('https://remap.jrc.ec.europa.eu/Consent/Advanced.aspx')
  messages=[]
  async def dismiss(dialog):messages.append(dialog.message);await dialog.dismiss()
  page.on('dialog',dismiss)
  await page.evaluate((ROOT/'tools/remap-capture.js').read_text())
  assert len(messages)==1 and 'CAPTCHA' in messages[0]
  assert await page.evaluate('window.__remanenceCapture===undefined')
  print(json.dumps({'capture_checks':['no initiated request','fetch response preserved','XHR response preserved','JSON download','URL query removal','sensitive-key filtering','interceptors restored','manual CAPTCHA prerequisite','post-processing reference observed','client diagnostics','jQuery observer removed'],'source':'mock responses only'},ensure_ascii=False))
  await browser.close()
asyncio.run(main())
