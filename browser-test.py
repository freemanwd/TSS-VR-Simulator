"""Browser regressions: verify rendered pixels as well as camera positions."""
import io, json, os
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:4173')
OUT=Path('browser-results');OUT.mkdir(exist_ok=True)
report={'base_url':BASE,'checks':[]}
def shot(page,name):
 data=page.locator('#view').screenshot(path=str(OUT/(name+'.png')))
 image=np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(float)
 nonempty=float((image.max(2)>45).mean())
 assert nonempty>.08,f'{name}: surface not visibly rendered ({nonempty})'
 return image
def difference(a,b):return float((np.abs(a-b).max(2)>5).mean())
def ready(page):
 page.goto(BASE,wait_until='networkidle',timeout=45000)
 page.wait_for_function('window.__tss?.snapshot().ready',timeout=30000)
 page.wait_for_timeout(250)
def move_checks(page,prefix,touch=False):
 before=page.evaluate('__tss.snapshot()');image=shot(page,prefix+'-start')
 for _ in range(4):
  if touch:page.locator('#advance').tap()
  else:page.locator('#advance').click()
 page.wait_for_timeout(200)
 moved=page.evaluate('__tss.snapshot()');advanced=shot(page,prefix+'-advanced');diff=difference(image,advanced)
 assert moved['depth']>before['depth']+.09
 assert np.linalg.norm(np.array(moved['camera'])-before['camera'])>.2
 assert diff>.02,f'Advance did not change visible anatomy: {diff}'
 for _ in range(4):
  if touch:page.locator('#withdraw').tap()
  else:page.locator('#withdraw').click()
 page.wait_for_timeout(200)
 back=page.evaluate('__tss.snapshot()');retracted=shot(page,prefix+'-withdrawn')
 assert abs(back['depth']-before['depth'])<1e-6
 assert np.linalg.norm(np.array(back['camera'])-before['camera'])<1e-6
 assert difference(advanced,retracted)>.02
 report['checks'].append({'name':prefix+' advance/withdraw','pixel_change_fraction':round(diff,4),'passed':True})
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  page=browser.new_page(viewport={'width':1280,'height':900})
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  ready(page);assert page.evaluate('__tss.snapshot().version')=='0.4.2'
  move_checks(page,'desktop')
  for value in [250,500,750,1000]:
   page.locator('#depthSlider').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',value)
   page.wait_for_timeout(180);shot(page,'depth-'+str(value))
  page.locator('#reset').click()
  page.locator('[data-mode=atlas]').click();page.wait_for_timeout(250);shot(page,'nasal-atlas')
  page.locator('[data-mode=scope]').click();page.locator('#angle').click();page.wait_for_timeout(200)
  assert page.locator('#optic').inner_text()=='30°'
  shot(page,'angled-endoscope');page.locator('#angle').click()
  page.locator('#instrument').click();page.wait_for_timeout(200);shot(page,'instrument');page.locator('#instrument').click()
  box=page.locator('#advance').bounding_box()
  page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.wait_for_timeout(900);page.mouse.up()
  assert page.evaluate('__tss.snapshot().depth')>.03
  depth=page.evaluate('__tss.snapshot().depth');page.wait_for_timeout(300)
  assert abs(page.evaluate('__tss.snapshot().depth')-depth)<1e-6
  page.locator('#view').focus();page.keyboard.down('w');page.wait_for_timeout(400);page.keyboard.up('w')
  assert page.evaluate('__tss.snapshot().depth')>depth
  page.locator('[data-mode=skull]').click()
  page.wait_for_function('__tss.snapshot().skullReady',timeout=30000);page.wait_for_timeout(300);shot(page,'skull-reference')
  page.locator('[data-mode=teaching]').click();page.wait_for_timeout(250);shot(page,'synthetic-sellar')
  page.locator('[data-mode=scope]').click();page.locator('#reset').click();page.screenshot(path=str(OUT/'desktop-full.png'))
  assert not errors,errors
  report['checks'].append({'name':'all route positions, angle after mode switch, hold, keyboard, atlas, skull, teaching','passed':True})
  mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
  mobile_errors=[];mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
  ready(mobile);move_checks(mobile,'mobile',True);mobile.screenshot(path=str(OUT/'mobile-full.png'),full_page=True)
  assert not mobile_errors,mobile_errors
  failure=browser.new_page()
  failure.route('**/assets/nasalseg-case.glb',lambda route:route.fulfill(status=404,body='missing'))
  failure.goto(BASE,wait_until='networkidle');failure.wait_for_selector('#retry:not([hidden])')
  assert failure.locator('#advance').is_disabled()
  assert 'could not start' in failure.locator('#loadTitle').inner_text()
  failure.screenshot(path=str(OUT/'asset-failure.png'))
  report['checks'].append({'name':'failed anatomy request shows explicit error and disables movement','passed':True})
  report['passed']=True
 finally:
  (OUT/'report.json').write_text(json.dumps(report,indent=2));print('BROWSER_REPORT',json.dumps(report));browser.close()
