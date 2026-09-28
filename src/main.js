import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import './style.css';

const app=document.querySelector('#app');
app.innerHTML=`<header><div><b>STR-X / TSS VR SIMULATOR</b><small>OPERATIVE CORRIDOR · v0.4</small></div><div class="source">Nasal corridor: NasalSeg CT segmentation</div></header>
<main><section id="stage"><canvas id="view"></canvas><div class="scope"></div><div class="topHUD"><span id="mode">ENDOSCOPIC · <b id="optic">0°</b></span><span id="assetState">LOADING CT-DERIVED ANATOMY…</span></div><div class="crosshair">+</div><div class="nav"><button id="withdraw">− Withdraw</button><div><button id="angle">0° / 30°</button><button id="instrument">Instrument</button></div><button id="advance">Advance +</button></div></section>
<aside><div class="eyebrow">TSS CORRIDOR</div><h1>Endonasal → sphenoid → sella</h1><p id="note">The nasal corridor is derived from a published CT segmentation. Deep sellar structures are an educational reconstruction and are visually distinguished.</p>
<div class="meter"><div><span>DEPTH</span><b id="depth">0%</b></div><div><span>REGION</span><b id="region">Nasal vestibule</b></div></div>
<div class="tabs"><button class="active" data-view="scope">Endoscope</button><button data-view="atlas">Atlas</button></div>
<h3>Structures</h3><div id="structures"></div>
<div class="legend"><i class="real"></i><span>CT-derived NasalSeg geometry</span><i class="recon"></i><span>Educational reconstruction</span></div>
<div id="coach" class="coach"><b>COACH</b><span>Advance slowly. Identify each landmark in sequence.</span></div><div class="score"><div><span>LANDMARKS</span><b id="landmarkScore">0 / 6</b></div><div><span>SAFETY EVENTS</span><b id="safetyScore">0</b></div><div><span>PATH</span><b id="pathScore">0.0</b></div></div><button id="resetRun" class="reset">Reset training run</button><div class="warning"><b>Research / education only.</b> Not patient-specific, clinically validated, or a procedural guide. Geometry labeled “reconstruction” is not derived from NasalSeg.</div>
<a class="credit" href="https://doi.org/10.5281/zenodo.13893419" target="_blank">NasalSeg · DOI 10.5281/zenodo.13893419 ↗</a></aside></main>`;

const canvas=document.querySelector('#view'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setClearColor(0x02070b);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x02070b,.025);
const camera=new THREE.PerspectiveCamera(76,1,.01,1000);scene.add(camera);
camera.add(new THREE.PointLight(0xfff1dc,5,30,2));scene.add(new THREE.HemisphereLight(0x89b8c5,0x2b1010,1.0));
const root=new THREE.Group();scene.add(root);
let depth=0, viewMode='scope', yaw=0,pitch=0,drag=null,realLoaded=false,optic30=false,instrumentOn=false;
const structureUI=document.querySelector('#structures');
const phases=[
 {name:'Nasal entry',at:.06,target:'Nasal vestibule',hint:'Orient to the nasal corridor; avoid forcing the camera against the wall.'},
 {name:'Nasal corridor',at:.28,target:'Nasal cavity',hint:'Maintain a centered endoscopic path and identify the nasal cavity.'},
 {name:'Posterior corridor',at:.50,target:'Posterior choana',hint:'Recognize the posterior transition before turning toward the sphenoid target.'},
 {name:'Sphenoid target',at:.66,target:'Sphenoid corridor',hint:'Educational reconstruction begins here; identify the sphenoid target.'},
 {name:'Sphenoid sinus',at:.80,target:'Sphenoid sinus',hint:'Orient to the reconstructed sellar face and lateral carotid danger zones.'},
 {name:'Sellar face',at:.92,target:'Sellar face',hint:'Identify sellar face; maintain awareness of ICA and optic danger zones.'}
];
let found=new Set(),safetyEvents=0,pathLength=0,lastDepth=0;
const structures=[
 ['skull','CT skull reference','real'],['nasal','Nasal cavities','real'],['pharynx','Nasopharynx','real'],['sphenoid','Sphenoid sinus','recon'],['sella','Sellar face','recon'],['ica','Paraclival ICA','recon'],['optic','Optic apparatus','recon'],['pituitary','Pituitary / lesion','recon']
];
structureUI.innerHTML=structures.map(([id,n,k])=>`<button data-id="${id}"><i class="${k}"></i>${n}<span>◎</span></button>`).join('');
const groups={}; structures.forEach(([id])=>groups[id]=new THREE.Group(),root.add(groups[id]));

function mat(color,rough=.65,opacity=1){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0,side:THREE.DoubleSide,transparent:opacity<1,opacity});}
function tube(group,pts,r,color){const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,64,r,14,false),mat(color,.5)));}
function recon(){
 const bone=mat(0xd7bd8d,.82,.76), muc=mat(0xa85457,.78,.82), gland=mat(0xd19a72,.72), tumor=mat(0x9a76bd,.68);
 const sph=new THREE.Mesh(new THREE.SphereGeometry(2.8,36,24),muc);sph.scale.set(1.2,.72,1);sph.position.set(0,0,-13);groups.sphenoid.add(sph);
 const sell=new THREE.Mesh(new THREE.BoxGeometry(3.7,2.6,.35),bone);sell.position.set(0,.1,-16);groups.sella.add(sell);
 tube(groups.ica,[[-2.15,-1,-18],[-2.05,-.2,-16.8],[-2.25,.7,-16],[-1.95,1.5,-17]],.25,0xd7434d);tube(groups.ica,[[2.15,-1,-18],[2.05,-.2,-16.8],[2.25,.7,-16],[1.95,1.5,-17]],.25,0xd7434d);
 tube(groups.optic,[[-2,2,-17],[-.7,1.9,-16.5],[0,1.8,-16],[.7,1.9,-16.5],[2,2,-17]],.18,0xe7d27a);
 const pit=new THREE.Mesh(new THREE.SphereGeometry(1.25,32,20),gland);pit.scale.y=.75;pit.position.set(-.2,0,-16.7);groups.pituitary.add(pit);
 const les=new THREE.Mesh(new THREE.SphereGeometry(.75,28,18),tumor);les.position.set(.45,.25,-16.35);groups.pituitary.add(les);
 Object.values(groups).forEach(g=>g.children.forEach(o=>o.userData.provenance='reconstruction'));
} recon();

const loader=new GLTFLoader();

renderer.xr.enabled=true;
if(navigator.xr){const vr=VRButton.createButton(renderer);vr.id='vr';document.querySelector('#stage').appendChild(vr);}
const instrument=new THREE.Group();camera.add(instrument);
const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,2.5,12),new THREE.MeshStandardMaterial({color:0xbfc9ce,metalness:.85,roughness:.2}));
shaft.rotation.x=Math.PI/2;shaft.position.set(.34,-.25,-1.4);instrument.add(shaft);instrument.visible=false;

loader.load('/assets/spl-skull.glb',g=>{
 const model=g.scene;model.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({color:0xd8c39d,roughness:.82,transparent:true,opacity:.20,side:THREE.DoubleSide});o.userData.provenance='SPL Head & Neck Atlas';}});
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=22/Math.max(size.x,size.y,size.z);model.position.copy(center).multiplyScalar(-1);const holder=new THREE.Group();holder.add(model);holder.scale.setScalar(scale);holder.rotation.set(-Math.PI/2,0,Math.PI);holder.position.set(0,0,-7);groups.skull.add(holder);
},undefined,()=>{document.querySelector('#note').textContent+=' CT skull asset is still building; refresh after the data workflow completes.';});

loader.load('/assets/nasalseg-case.glb',g=>{
 const model=g.scene;model.traverse(o=>{if(o.isMesh){o.material=mat(0xb65f61,.82,.72);o.userData.provenance='NasalSeg';}});
 // Pipeline exports centered millimeter geometry; normalize long axis to endoscopic Z.
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const longest=Math.max(size.x,size.y,size.z),scale=18/longest;model.position.copy(center).multiplyScalar(-1);
 // Parent transform preserves CT proportions while correctly applying centering in scaled coordinates.
 const holder=new THREE.Group();holder.add(model);holder.scale.setScalar(scale);holder.rotation.set(-Math.PI/2,0,Math.PI);holder.position.set(0,0,-5);
 groups.nasal.add(holder);realLoaded=true;document.querySelector('#assetState').textContent='NASALSEG P001 · CT MESH LOADED';
},undefined,()=>{
 document.querySelector('#assetState').textContent='CT MESH LOAD ERROR';
 document.querySelector('#note').textContent='The real NasalSeg asset is being generated by the repository data pipeline. Deep anatomy remains a reconstruction.';
 // Anatomically shaped fallback only until the workflow commits the real mesh.
 const fallback=new THREE.Mesh(new THREE.CapsuleGeometry(1.65,10,16,28),mat(0xa9575b,.85,.62));fallback.rotation.x=Math.PI/2;fallback.position.z=-5;groups.nasal.add(fallback);
});

function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()} new ResizeObserver(resize).observe(canvas);
function region(d){return d<.2?'Nasal vestibule':d<.42?'Nasal cavity':d<.58?'Posterior choana':d<.72?'Sphenoid corridor':d<.86?'Sphenoid sinus':d<.94?'Sellar face':'Sellar compartment'}
function updateCamera(){
 document.querySelector('#depth').textContent=Math.round(depth*100)+'%';document.querySelector('#region').textContent=region(depth);
 if(viewMode==='scope'){camera.fov=76;camera.position.set(Math.sin(yaw)*.5,Math.sin(pitch)*.4,4-depth*21);camera.lookAt(camera.position.x+Math.sin(yaw)+(optic30?.5:0),camera.position.y+Math.sin(pitch)+(optic30?.12:0),camera.position.z-5);document.querySelector('.scope').style.display='block';}
 else{camera.fov=45;camera.position.set(18*Math.sin(yaw+.75),8+pitch*6,5+18*Math.cos(yaw+.75));camera.lookAt(0,0,-7);document.querySelector('.scope').style.display='none';}
 camera.updateProjectionMatrix();
 groups.sphenoid.visible=depth>.56||viewMode==='atlas';groups.sella.visible=depth>.72||viewMode==='atlas';groups.ica.visible=depth>.72||viewMode==='atlas';groups.optic.visible=depth>.78||viewMode==='atlas';groups.pituitary.visible=depth>.91||viewMode==='atlas';
}
function move(v){const before=depth;depth=THREE.MathUtils.clamp(depth+v,0,1);document.querySelector('#assetState').textContent=realLoaded?'NASALSEG P001 · CT MESH LOADED':'ANATOMY ASSET NOT READY';pathLength+=Math.abs(depth-before)*21;document.querySelector('#pathScore').textContent=pathLength.toFixed(1);checkTraining();updateCamera()}
function checkTraining(){
 const idx=phases.findIndex((p,i)=>depth>=p.at && (i===phases.length-1||depth<phases[i+1].at));
 const phase=phases[Math.max(0,idx)],coach=document.querySelector('#coach');
 if(phase){coach.querySelector('span').textContent=phase.hint;if(Math.abs(depth-phase.at)<.045)found.add(Math.max(0,idx));}
 // Proximity events are simulator danger-zone events, not validated collision physics.
 if(depth>.79){
   const lateral=Math.abs(Math.sin(yaw)*1.7);
   if(lateral>1.25 && !window.__dangerLatch){safetyEvents++;window.__dangerLatch=true;coach.classList.add('danger');coach.querySelector('span').textContent='Danger-zone proximity: reconstructed paraclival ICA. Re-center before advancing.';}
   if(lateral<.9){window.__dangerLatch=false;coach.classList.remove('danger');}
 }
 document.querySelector('#landmarkScore').textContent=found.size+' / '+phases.length;
 document.querySelector('#safetyScore').textContent=safetyEvents;
}
document.querySelector('#resetRun').onclick=()=>{depth=0;yaw=0;pitch=0;found.clear();safetyEvents=0;pathLength=0;window.__dangerLatch=false;document.querySelector('#landmarkScore').textContent='0 / 6';document.querySelector('#safetyScore').textContent='0';document.querySelector('#pathScore').textContent='0.0';document.querySelector('#coach').classList.remove('danger');checkTraining();updateCamera();};

document.querySelector('#advance').onclick=()=>move(.025);document.querySelector('#withdraw').onclick=()=>move(-.025);document.querySelector('#angle').onclick=()=>{optic30=!optic30;document.querySelector('#optic').textContent=optic30?'30°':'0°';updateCamera()};document.querySelector('#instrument').onclick=()=>{instrumentOn=!instrumentOn;instrument.visible=instrumentOn};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{viewMode=b.dataset.view;document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x===b));document.querySelector('#mode').textContent=viewMode==='scope'?'ENDOSCOPIC · 0°':'ATLAS · CUTAWAY';updateCamera()});
structureUI.onclick=e=>{const b=e.target.closest('button');if(!b)return;const g=groups[b.dataset.id];g.visible=!g.visible;b.classList.toggle('off',!g.visible)};
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!drag)return;yaw+= (e.clientX-drag[0])*.005;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag[1])*.004,-.7,.7);drag=[e.clientX,e.clientY];updateCamera()};canvas.onpointerup=()=>drag=null;
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w')move(.015);if(e.key.toLowerCase()==='s')move(-.015)});
function loop(){renderer.render(scene,camera)}renderer.setAnimationLoop(loop);checkTraining();updateCamera();resize();
