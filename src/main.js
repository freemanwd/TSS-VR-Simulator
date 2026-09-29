import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import routeData from './nasal-route.json';
import './style.css';

// Bundled dataset surfaces; path and shading are visualization aids, not a surgical plan.
const VERSION = '0.4.2';
const $ = id => document.getElementById(id);
const state = { ready:false, mode:'scope', depth:0, yaw:0, pitch:0, angled:false, instrument:false, frames:0, travel:0, error:null, skullReady:false };
const errors = [];
let renderer, scene, camera, controls, nasal, skull;
let nasalRoot, skullRoot, teachingRoot, routeLine, marker, instrument;
let drag=null, held=0, holdTimer=null, lastFrame=0;
const route = new THREE.CatmullRomCurve3(routeData.points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
const groups = {};

$('app').innerHTML = `
<header><div class="brand">STR-X <span>/</span> TSS LAB<small>RENDER & NAVIGATION FIX · v${VERSION}</small></div><div class="header-note">Dataset geometry. Transparent provenance.</div></header>
<main>
 <section class="workspace" aria-label="Interactive anatomy workspace">
  <div id="stage">
   <canvas id="view" tabindex="0" aria-label="3D anatomy view. Drag to look. W advances and S withdraws."></canvas>
   <div id="vignette"></div>
   <div class="hud"><span id="modeLabel">NASAL ENDOSCOPE · <b id="optic">0°</b></span><span id="assetState" role="status">Loading NasalSeg P001…</span></div>
   <div class="crosshair" aria-hidden="true">+</div>
   <div id="loadPanel" role="status"><div class="load-card"><span class="eyebrow">ANATOMY VIEWER</span><h2 id="loadTitle">Loading the CT-derived surface</h2><p id="loadText">The nasal model is bundled with this application. Navigation unlocks after it loads.</p><button id="retry" hidden>Retry loading</button></div></div>
   <div class="scene-caption"><span id="sceneSource">NasalSeg P001 · visualization path, not a surgical plan</span><span id="renderState">Starting renderer</span></div>
  </div>
  <div class="navigation">
   <div class="nav-row"><button id="withdraw" class="nav-button" disabled>← Withdraw</button><div class="position"><strong id="depth">0%</strong><span id="region">Anterior nasal model</span></div><button id="advance" class="nav-button primary" disabled>Advance →</button></div>
   <label class="range-label" for="depthSlider">Position along visualization path</label><input id="depthSlider" type="range" min="0" max="1000" value="0" disabled aria-label="Position along visualization path">
   <p class="hint">Click to step · hold to move · drag to look · W / S on keyboard</p>
  </div>
 </section>
 <aside>
  <span class="eyebrow">EXPLORE THE MODEL</span><h1>Visible anatomy.<br>Responsive navigation.</h1>
  <p id="note">The nasal cavities and nasopharynx are one CT-segmentation surface from NasalSeg case P001. Start inside the model and use Advance or Withdraw.</p>
  <div class="modes" aria-label="Anatomy views"><button data-mode="scope" class="active" disabled>Endoscope</button><button data-mode="atlas" disabled>Nasal atlas</button><button data-mode="skull" disabled>Skull reference</button><button data-mode="teaching" disabled>Sellar illustration</button></div>
  <h3>VIEW CONTROLS</h3><div class="tools"><button id="angle" disabled>Optics: 0°</button><button id="instrument" disabled>Show instrument</button><button id="recenter" disabled>Re-center view</button><button id="reset" disabled>Reset route</button></div>
  <div class="metrics"><div><small>MODEL STATUS</small><b id="modelState">Loading</b></div><div><small>VIRTUAL TRAVEL</small><b id="travel">0.00 units</b></div></div>
  <div class="notice"><b id="coachTitle">A viewing path, not a surgical route</b><p id="coach">No movement is scored as surgical skill. The path is fitted to the bundled surface to keep anatomy in view. It requires expert review before educational validation.</p></div>
  <details><summary>Source data & limitations</summary><p>NasalSeg P001: bundled nasal cavities + nasopharynx. Shading is illustrative, not recorded endoscopic imagery. The earlier export does not preserve verified patient orientation.</p><p>SPL skull: a separate CT atlas subject, shown in a separate view. It is not registered to P001.</p><p>Sellar illustration: synthetic sphenoid/sellar, ICA, optic and pituitary objects. It is not a continuation of the CT-derived nasal route.</p><p><a href="https://doi.org/10.5281/zenodo.13893419" target="_blank" rel="noreferrer">NasalSeg source ↗</a> · <a href="https://www.openanatomy.org/atlas-pages/atlas-spl-head-and-neck.html" target="_blank" rel="noreferrer">SPL source ↗</a></p></details>
  <p class="disclaimer">RESEARCH PROTOTYPE · Not for clinical decisions, surgical planning, or credentialing. Desktop/touch navigation is tested separately from headset VR.</p>
 </aside>
</main>`;

function reportError(error) {
 const message=error instanceof Error ? error.message : String(error);
 errors.push(message); state.error=message; state.ready=false; held=0; clearTimeout(holdTimer);
 $('loadPanel').hidden=false;
 $('loadTitle').textContent='The anatomy viewer could not start';
 $('loadText').textContent=message+' Reload to retry. A failed load is not shown as an empty anatomy scene.';
 $('retry').hidden=false; $('assetState').textContent='Viewer error — see details'; $('modelState').textContent='Unavailable';
 document.querySelectorAll('.navigation button, .tools button, .modes button, #depthSlider').forEach(e=>e.disabled=true);
}
window.addEventListener('error',e=>reportError(e.error||e.message));
window.addEventListener('unhandledrejection',e=>reportError(e.reason));
$('retry').addEventListener('click',()=>location.reload());

async function loadMesh(name,onProgress) {
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),25000);
 try {
  const url=new URL(`${import.meta.env.BASE_URL}assets/${name}`,location.origin);
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data=await response.arrayBuffer();
  if(data.byteLength<20||new DataView(data).getUint32(0,true)!==0x46546c67) throw new Error(`${name}: server did not return a valid GLB anatomy file`);
  onProgress?.();
  const result=await new GLTFLoader().parseAsync(data,url.href.replace(/[^/]*$/,''));
  let count=0;result.scene.traverse(o=>{if(o.isMesh)count++;});
  if(!count)throw new Error(`${name}: no renderable surface found`);
  return result.scene;
 } catch(error) {
  if(error.name==='AbortError')throw new Error(`${name}: download timed out after 25 seconds`);
  throw error;
 } finally {clearTimeout(timer);}
}
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.58,metalness:0,side:THREE.DoubleSide});
function resize() {
 if(!renderer)return;
 const {width,height}=$('stage').getBoundingClientRect();if(width<2||height<2)return;
 renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
}
function positionCamera() {
 if(!camera)return;
 if(state.mode==='scope') {
  camera.fov=78;camera.position.copy(route.getPointAt(state.depth));
  const tangent=route.getTangentAt(Math.min(.9999,state.depth)).normalize();
  camera.up.set(0,1,0);camera.lookAt(camera.position.clone().add(tangent));
  camera.rotateY(state.yaw);camera.rotateX(state.pitch+(state.angled?Math.PI/6:0));
 } else if(state.mode==='teaching') {
  camera.fov=66;camera.position.set(0,.1,7-state.depth*5);camera.lookAt(0,.1,-1);
  camera.rotateY(state.yaw);camera.rotateX(state.pitch+(state.angled?Math.PI/6:0));
 }
 camera.updateProjectionMatrix();marker.position.copy(route.getPointAt(state.depth));
 instrument.visible=state.instrument&&['scope','teaching'].includes(state.mode);
}
function syncUI() {
 $('depth').textContent=`${Math.round(state.depth*100)}%`;
 $('depthSlider').value=Math.round(state.depth*1000);$('travel').textContent=`${state.travel.toFixed(2)} units`;
 $('region').textContent=state.mode==='teaching'?'Synthetic sellar scene':state.depth<.25?'Anterior nasal model':state.depth<.72?'Mid-nasal model':'Posterior nasal model';
 $('angle').textContent=state.angled?'Optics: 30°':'Optics: 0°';$('optic').textContent=state.angled?'30°':'0°';
 $('instrument').textContent=state.instrument?'Hide instrument':'Show instrument';
 $('advance').disabled=!state.ready||state.depth>=1;$('withdraw').disabled=!state.ready||state.depth<=0;
 $('vignette').hidden=!['scope','teaching'].includes(state.mode);document.querySelector('.crosshair').hidden=!['scope','teaching'].includes(state.mode);
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));});
}
function setDepth(value) {
 if(!state.ready||!Number.isFinite(value))return;
 if(['atlas','skull'].includes(state.mode))setMode('scope');
 const next=THREE.MathUtils.clamp(value,0,1);
 state.travel+=Math.abs(next-state.depth)*(state.mode==='scope'?route.getLength():5);state.depth=next;
 positionCamera();syncUI();
}
function homeOrbit() {
 controls.target.set(0,0,0);
 if(state.mode==='skull')camera.position.set(13,8,17);else camera.position.set(8,5,11);
 camera.fov=48;camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.update();
}
async function ensureSkull() {
 if(state.skullReady)return;
 $('assetState').textContent='Loading separate SPL skull reference…';
 try {
  if(!skull) {
   skull=await loadMesh('spl-skull.glb');
   const box=new THREE.Box3().setFromObject(skull),center=box.getCenter(new THREE.Vector3());
   skull.position.sub(center);skullRoot.scale.setScalar(12/box.getSize(new THREE.Vector3()).length()*Math.sqrt(3));
   skullRoot.rotation.x=-Math.PI/2;
   skull.traverse(o=>{if(o.isMesh)o.material=material(0xd6c6a7);});skullRoot.add(skull);
  }
  state.skullReady=true;
  if(state.mode==='skull')$('assetState').textContent='SPL skull reference loaded · separate subject';
 } catch(e) {
  if(state.mode==='skull')setMode('atlas');
  $('assetState').textContent='Skull unavailable; nasal view still works';
  $('note').textContent=`Optional skull load failed: ${e.message}. Nasal navigation remains available.`;
 }
}
function setMode(mode) {
 if(!state.ready)return;
 state.mode=mode;state.yaw=0;state.pitch=0;held=0;
 nasalRoot.visible=mode==='scope'||mode==='atlas';skullRoot.visible=mode==='skull';teachingRoot.visible=mode==='teaching';
 routeLine.visible=marker.visible=mode==='atlas';controls.enabled=mode==='atlas'||mode==='skull';
 const labels={scope:'NASAL ENDOSCOPE',atlas:'NASAL ATLAS',skull:'SEPARATE SKULL REFERENCE',teaching:'SYNTHETIC SELLAR ILLUSTRATION'};
 // Do not destroy the optic span when switching modes.
 $('modeLabel').firstChild.textContent=`${labels[mode]} · `;
 const text={scope:'NasalSeg P001 · visualization path, not a surgical plan',atlas:'Same nasal model · cyan line = illustrative camera path',skull:'SPL CT skull · different subject; not registered to P001',teaching:'All objects in this scene are synthetic, not CT-derived'};
 $('sceneSource').textContent=text[mode];
 $('assetState').textContent=mode==='teaching'?'Synthetic teaching scene':mode==='skull'?'SPL skull reference':'NasalSeg P001 · CT mesh loaded';
 $('coachTitle').textContent=mode==='teaching'?'Illustration only — no validated danger zones':'A viewing path, not a surgical route';
 if(controls.enabled)homeOrbit();if(mode==='skull')ensureSkull();
 positionCamera();syncUI();
}
function buildTeachingScene() {
 // Isolated schematic, not co-registered with the nasal case.
 const ball=(id,position,scale,color)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),material(color));o.position.set(...position);o.scale.set(...scale);groups[id].add(o);};
 // Fixes the original fatal undefined-id error: creation AND add are inside the loop.
 for(const id of ['sella','ica','optic','pituitary']){groups[id]=new THREE.Group();teachingRoot.add(groups[id]);}
 ball('sella',[0,0,-1.3],[2.5,2,.15],0xd1b489);ball('pituitary',[0,0,-.9],[.85,.6,.3],0xc2878d);
 const tube=(id,points,radius,color)=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));groups[id].add(new THREE.Mesh(new THREE.TubeGeometry(curve,40,radius,12,false),material(color)));};
 for(const s of [-1,1]) {
  tube('ica',[[s*1.65,-1.5,-.7],[s*1.4,0,-.8],[s*1.65,1,-.9],[s*1.25,1.6,-1]],.17,0xba3544);
  tube('optic',[[s*1.5,1.8,-.6],[s*.6,1.65,-.65],[0,1.55,-.7]],.12,0xdec88d);
 }
}
async function boot() {
 renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.setClearColor(0x08131d);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(78,1,.002,200);scene.add(camera);
 scene.add(new THREE.AmbientLight(0xffddd0,.6));
 const fill=new THREE.DirectionalLight(0xcfe4ff,1.5);fill.position.set(5,8,8);scene.add(fill);
 camera.add(new THREE.PointLight(0xffeadc,1.6,0,0));
 nasalRoot=new THREE.Group();skullRoot=new THREE.Group();teachingRoot=new THREE.Group();scene.add(nasalRoot,skullRoot,teachingRoot);skullRoot.visible=teachingRoot.visible=false;
 controls=new OrbitControls(camera,$('view'));controls.enableDamping=true;controls.enabled=false;controls.minDistance=.3;controls.maxDistance=50;
 routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.getSpacedPoints(250)),new THREE.LineBasicMaterial({color:0x64f5d3,depthTest:false}));routeLine.renderOrder=5;
 marker=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),new THREE.MeshBasicMaterial({color:0xffffcf,depthTest:false}));marker.renderOrder=6;
 scene.add(routeLine,marker);routeLine.visible=marker.visible=false;
 instrument=new THREE.Group();camera.add(instrument);instrument.visible=false;
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.48,14),new THREE.MeshStandardMaterial({color:0xc4d0d6,roughness:.22,metalness:.75}));shaft.rotation.x=Math.PI/2;shaft.position.set(.11,-.095,-.31);instrument.add(shaft);
 buildTeachingScene();resize();new ResizeObserver(resize).observe($('stage'));
 $('view').addEventListener('webglcontextlost',e=>{e.preventDefault();reportError(new Error('WebGL graphics context was lost. Reload this page to restore it.'));});
 renderer.setAnimationLoop(time=>{
  const dt=Math.min(.05,(time-(lastFrame||time))/1000);lastFrame=time;
  if(state.ready&&held)setDepth(state.depth+held*dt*.1);
  if(controls.enabled)controls.update();renderer.render(scene,camera);state.frames++;
  if(state.frames%60===0)$('renderState').textContent='3D renderer active';
 });
 nasal=await loadMesh('nasalseg-case.glb',()=>$('assetState').textContent='Preparing nasal surface…');
 nasal.traverse(o=>{if(o.isMesh){o.material=material(0xad6864);o.geometry.computeVertexNormals();}});
 // Route and mesh must share the same transform; do not independently normalize either.
 nasalRoot.rotation.x=routeData.transform.rotationX;nasalRoot.scale.setScalar(routeData.transform.scale);nasalRoot.add(nasal);
 state.ready=true;document.querySelectorAll('.modes button, .tools button, #depthSlider').forEach(e=>e.disabled=false);
 $('modelState').textContent='CT mesh loaded';setMode('scope');renderer.render(scene,camera);
 $('loadPanel').hidden=true;$('renderState').textContent='3D renderer active';
}
function bindMove(id,direction) {
 const button=$(id);
 button.addEventListener('click',()=>setDepth(state.depth+direction*.025));
 button.addEventListener('pointerdown',e=>{if(!state.ready||button.disabled)return;button.setPointerCapture(e.pointerId);holdTimer=setTimeout(()=>{held=direction;},300);});
 const stop=()=>{held=0;clearTimeout(holdTimer);};
 button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',stop);
}
bindMove('advance',1);bindMove('withdraw',-1);
$('depthSlider').addEventListener('input',e=>setDepth(Number(e.target.value)/1000));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('angle').addEventListener('click',()=>{state.angled=!state.angled;positionCamera();syncUI();});
$('instrument').addEventListener('click',()=>{state.instrument=!state.instrument;positionCamera();syncUI();});
$('recenter').addEventListener('click',()=>{state.yaw=0;state.pitch=0;if(controls.enabled)homeOrbit();else positionCamera();});
$('reset').addEventListener('click',()=>{state.depth=0;state.travel=0;state.yaw=0;state.pitch=0;state.angled=false;setMode('scope');});
$('view').addEventListener('pointerdown',e=>{if(!state.ready||controls.enabled)return;$('view').focus();$('view').setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];});
$('view').addEventListener('pointermove',e=>{if(!drag||!state.ready||controls.enabled)return;state.yaw=THREE.MathUtils.clamp(state.yaw-(e.clientX-drag[0])*.004,-.9,.9);state.pitch=THREE.MathUtils.clamp(state.pitch-(e.clientY-drag[1])*.004,-.7,.7);drag=[e.clientX,e.clientY];positionCamera();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('view').addEventListener(event,()=>drag=null);
window.addEventListener('keydown',e=>{if(!state.ready||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(['w','s'].includes(e.key.toLowerCase())){e.preventDefault();held=e.key.toLowerCase()==='w'?1:-1;}});
window.addEventListener('keyup',e=>{if(['w','s'].includes(e.key.toLowerCase()))held=0;});
window.addEventListener('blur',()=>{held=0;drag=null;clearTimeout(holdTimer);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held=0;clearTimeout(holdTimer);}});
// Read-only browser-test diagnostics: no patient data or hidden movement controls.
window.__tss={snapshot:()=>({version:VERSION,ready:state.ready,mode:state.mode,depth:state.depth,frames:state.frames,skullReady:state.skullReady,camera:camera?.position.toArray(),errors:[...errors]})};
boot().catch(reportError);
