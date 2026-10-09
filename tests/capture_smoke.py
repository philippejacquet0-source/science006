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
  await root.locator('#stop').click()
  assert await page.evaluate('window.fetch===window.originalFetchForTest&&XMLHttpRequest.prototype.open===window.originalOpenForTest&&XMLHttpRequest.prototype.send===window.originalSendForTest')
  assert await page.evaluate('window.__remanenceCapture===undefined')
  assert not errors,errors
  # The consent guard exits before installing any interceptor.
  await page.goto('https://remap.jrc.ec.europa.eu/Consent/Advanced.aspx')
  messages=[]
  async def dismiss(dialog):messages.append(dialog.message);await dialog.dismiss()
  page.on('dialog',dismiss)
  await page.evaluate((ROOT/'tools/remap-capture.js').read_text())
  assert len(messages)==1 and 'CAPTCHA' in messages[0]
  assert await page.evaluate('window.__remanenceCapture===undefined')
  print(json.dumps({'capture_checks':['no initiated request','fetch response preserved','XHR response preserved','JSON download','URL query removal','sensitive-key filtering','interceptors restored','manual CAPTCHA prerequisite'],'source':'mock responses only'},ensure_ascii=False))
  await browser.close()
asyncio.run(main())
