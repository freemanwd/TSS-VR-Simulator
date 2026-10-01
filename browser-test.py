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
def control_checks(page,prefix,touch=False):
 def click(selector):
  if touch:page.locator(selector).tap()
  else:page.locator(selector).click()
 click('#reset');page.wait_for_timeout(200)
 original=shot(page,prefix+'-controls-start')
 click('#angle');page.wait_for_timeout(200)
 angled=shot(page,prefix+'-optics-30')
 assert difference(original,angled)>.02,'Optics must visibly change the rendered view'
 assert page.locator('#angle').get_attribute('aria-pressed')=='true'
 click('#angle');page.wait_for_timeout(150)
 assert difference(original,shot(page,prefix+'-optics-restored'))<.01
 click('#instrument');page.wait_for_timeout(150)
 guide=shot(page,prefix+'-guide-visible')
 guide_change=difference(original,guide)
 assert guide_change>.0002,f'Instrument must be visibly rendered: {guide_change}'
 assert page.evaluate('__tss.snapshot().instrument')
 click('#instrument');page.wait_for_timeout(150)
 assert difference(original,shot(page,prefix+'-guide-hidden'))<.01
 # Re-center after a real pointer drag must restore the endoscopic heading.
 box=page.locator('#view').bounding_box()
 page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
 page.mouse.down();page.mouse.move(box['x']+box['width']/2+70,box['y']+box['height']/2+30,steps=8);page.mouse.up()
 page.wait_for_timeout(150)
 assert difference(original,shot(page,prefix+'-look-away'))>.02
 click('#recenter');page.wait_for_timeout(150)
 assert difference(original,shot(page,prefix+'-recentered'))<.01
 for mode in ['atlas','skull']:
  click('[data-mode='+mode+']')
  if mode=='skull':page.wait_for_function('__tss.snapshot().skullReady',timeout=30000)
  page.wait_for_timeout(300)
  assert page.evaluate('__tss.snapshot().mode')==mode
  assert page.locator('#angle').is_disabled() and page.locator('#instrument').is_disabled()
  assert 'Endoscope and Sellar illustration' in page.locator('#controlHelp').inner_text()
  home=shot(page,prefix+'-'+mode+'-home')
  box=page.locator('#view').bounding_box()
  page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
  page.mouse.down();page.mouse.move(box['x']+box['width']/2+100,box['y']+box['height']/2+30,steps=8);page.mouse.up()
  page.wait_for_timeout(350)
  assert difference(home,shot(page,prefix+'-'+mode+'-rotated'))>.01
  click('#recenter');page.wait_for_timeout(350)
  assert difference(home,shot(page,prefix+'-'+mode+'-recentered'))<.01
 click('[data-mode=teaching]');page.wait_for_timeout(200)
 teaching=shot(page,prefix+'-teaching-home')
 assert page.locator('#angle').is_enabled() and page.locator('#instrument').is_enabled()
 click('#angle');page.wait_for_timeout(150)
 assert difference(teaching,shot(page,prefix+'-teaching-angled'))>.02
 click('#angle');click('#instrument');page.wait_for_timeout(150)
 assert difference(teaching,shot(page,prefix+'-teaching-guide'))>.0002
 click('#advance');click('#angle');click('#reset');page.wait_for_timeout(200)
 state=page.evaluate('__tss.snapshot()')
 assert state['mode']=='scope' and state['depth']==0 and state['travel']==0
 assert not state['instrument'] and not state['angled']
 assert page.locator('#angle').get_attribute('aria-pressed')=='false'
 assert page.locator('#instrument').get_attribute('aria-pressed')=='false'
 assert difference(original,shot(page,prefix+'-reset-complete'))<.01
 # Repeated mode transitions preserve all handlers and optics label.
 for _ in range(2):
  for mode in ['atlas','teaching','skull','scope']:click('[data-mode='+mode+']')
 click('#angle');assert page.locator('#optic').inner_text()=='30°';click('#angle')
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Horizontal overflow'
 report['checks'].append({'name':prefix+' all right-side controls: visible optics/instrument, recenter each view, full reset, repeated switches','instrument_pixel_change_fraction':round(guide_change,5),'passed':True})

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  page=browser.new_page(viewport={'width':1280,'height':900})
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  ready(page);assert page.evaluate('__tss.snapshot().version')=='0.4.2'
  move_checks(page,'desktop');control_checks(page,'desktop')
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
  ready(mobile);move_checks(mobile,'mobile',True);control_checks(mobile,'mobile',True);mobile.screenshot(path=str(OUT/'mobile-full.png'),full_page=True)
  assert not mobile_errors,mobile_errors
  narrow=browser.new_page(viewport={'width':320,'height':568},is_mobile=True,has_touch=True)
  ready(narrow);control_checks(narrow,'small-mobile',True)
  optional=browser.new_page()
  optional.route('**/assets/spl-skull.glb',lambda route:route.fulfill(status=404,body='missing'))
  ready(optional);optional.locator('[data-mode=skull]').click()
  optional.wait_for_function('__tss.snapshot().mode==="atlas"')
  assert optional.locator('#angle').is_disabled()
  assert 'failed' in optional.locator('#note').inner_text()
  optional.locator('[data-mode=scope]').click();optional.locator('#advance').click()
  assert optional.evaluate('__tss.snapshot().depth')>0
  report['checks'].append({'name':'optional skull failure recovers without disabling nasal controls','passed':True})
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
