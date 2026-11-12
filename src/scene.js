import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const up = new THREE.Vector3(0, 1, 0);
const baseUrl = import.meta.env.BASE_URL;

/** Owns the real Blender model, never substitutes browser-built geometry. */
export class TurntableScene {
  constructor({ canvas, stage, parts, onSelect, onProgress, onReady, onError, reducedMotion }) {
    Object.assign(this, { canvas, stage, parts, onSelect, onProgress, onReady, onError, reducedMotion });
    this.amount = 0; this.targetAmount = 0; this.playing = false; this.rpm = 100 / 3; this.dirty = true;
    this.groups = new Map(); this.hotspots = new Map(); this.guides = new Map();
    this.selected = null; this.labels = true; this.cover = false; this.visible = true; this.arm = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, .05, 80);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .04);
    this.scene.environment = this.environment.texture;
    room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xfff7e8, 0x827966, 2.2));
    const key = new THREE.DirectionalLight(0xfff6e5, 3.3);
    key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -5; key.shadow.camera.right = 5;
    key.shadow.camera.top = 7; key.shadow.camera.bottom = -5; key.shadow.camera.far = 20;
    key.shadow.normalBias = .012; key.shadow.bias = -.00015; key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe2edff, 1.5); rim.position.set(3, 4, -4); this.scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.13,depthWrite:false}));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.01; floor.receiveShadow = true; this.scene.add(floor);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx=shadowCanvas.getContext('2d'); const gradient=ctx.createRadialGradient(64,64,2,64,64,64);
    gradient.addColorStop(0,'rgba(54,49,32,.2)'); gradient.addColorStop(.4,'rgba(54,49,32,.12)'); gradient.addColorStop(1,'rgba(54,49,32,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(6.7,5.3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
    this.contact.rotation.x=-Math.PI/2;this.contact.position.y=.002;this.scene.add(this.contact);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = .075;
    this.controls.enablePan = false; this.controls.minDistance = 5.4; this.controls.maxDistance = 17;
    this.controls.minPolarAngle = .22; this.controls.maxPolarAngle = Math.PI*.47;
    this.controls.rotateSpeed = .65; this.controls.zoomSpeed = .65;
    this.controls.addEventListener('change',()=>{this.dirty=true;});
    this.resetCamera(true);
    this.observer = new ResizeObserver(()=>this.resize()); this.observer.observe(stage); this.resize();
    this.intersectionObserver = new IntersectionObserver(([entry])=>{this.visible=entry.isIntersecting;},{rootMargin:'150px'});
    this.intersectionObserver.observe(stage);
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    canvas.addEventListener('pointerdown',e=>{this.pointerDown={x:e.clientX,y:e.clientY};this.cameraTween=null;});
    canvas.addEventListener('pointerup',e=>{
      if(!this.pointerDown||Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y)>5) return;
      const rect=canvas.getBoundingClientRect();
      this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      if(!this.model)return;
      const hits=this.raycaster.intersectObject(this.model,true);
      for(const hit of hits){
        let o=hit.object;
        if(!o.visible)continue;
        while(o&&!o.userData.partId)o=o.parent;
        if(o&&o.userData.partId!=='cover'){this.onSelect(o.userData.partId);break;}
      }
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onError(new Error('The 3D graphics context was interrupted.'));});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
    this.animationId=requestAnimationFrame(()=>this.frame());
    this.load();
  }

  async load() {
    try {
      const loader=new GLTFLoader();
      const gltf=await loader.loadAsync(`${baseUrl}models/classic-belt-drive.glb`,e=>this.onProgress(e.total?e.loaded/e.total:.3));
      this.model=gltf.scene; this.model.scale.setScalar(10);
      const materialClones=new Map();
      this.model.traverse(o=>{
        if(o.userData.partId){
          this.groups.set(o.userData.partId,{object:o,base:o.position.clone(),explode:new THREE.Vector3(...o.userData.explode).multiplyScalar(.1)});
        }
        if(o.isMesh){
          o.castShadow=true;o.receiveShadow=true;
          let parent=o;while(parent&&!parent.userData.partId)parent=parent.parent;
          const clone=m=>{
            const key=`${parent?.userData.partId}:${m.uuid}`;
            if(!materialClones.has(key))materialClones.set(key,m.clone());
            return materialClones.get(key);
          };
          o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
          const materials=Array.isArray(o.material)?o.material:[o.material];
          materials.forEach(m=>{m.envMapIntensity=.65;});
        }
      });
      if(this.groups.size!==11)throw new Error('The model is missing its component structure.');
      this.groups.get('cover').object.visible=this.cover;
      this.scene.add(this.model);
      this.dirty=true;
      this.createHotspots();this.createGuides();
      this.onReady();
    }catch(e){this.onError(e);}
  }

  createHotspots(){
    const parent=document.querySelector('#hotspots');
    this.parts.forEach((p,i)=>{
      const button=document.createElement('button');button.className='hotspot';
      button.innerHTML=`<span class="hotspot-dot">${String(i+1).padStart(2,'0')}</span><span class="hotspot-name">${p.short}</span>`;
      button.setAttribute('aria-label',`Explore ${p.name.toLowerCase()}`);
      button.addEventListener('click',()=>this.onSelect(p.id));parent.append(button);
      this.hotspots.set(p.id,button);
    });
  }

  createGuides(){
    this.parts.forEach(p=>{
      const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
      const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color:0x7f8972,transparent:true,opacity:.2,dashSize:.035,gapSize:.045,depthWrite:false}));
      this.scene.add(line);this.guides.set(p.id,line);
    });
  }

  setAmount(value){
    this.targetAmount=THREE.MathUtils.clamp(value,0,1);this.dirty=true;
    if(this.cameraTween&&!this.focusId)this.resetCamera();
  }
  select(id){
    this.selected=id;this.dirty=true;
    for(const [key,button] of this.hotspots){button.classList.toggle('selected',key===id);button.setAttribute('aria-pressed',String(key===id));}
    for(const [key,g] of this.groups){
      g.object.traverse(o=>{
        if(o.isMesh){
          const materials=Array.isArray(o.material)?o.material:[o.material];
          materials.forEach(m=>{if(m.emissive){m.emissive.set(key===id?0x55301b:0x000000);m.emissiveIntensity=key===id?.16:0;}});
        }
      });
    }
    if(this.focusId){if(id)this.focusPart(id);else this.resetCamera();}
  }
  setCover(value){this.cover=value;this.dirty=true;const g=this.groups.get('cover');if(g)g.object.visible=value;this.resetCamera();}
  setLabels(value){this.labels=value;this.dirty=true;}
  resetCamera(immediate=false){
    this.focusId=null;this.controls.minDistance=5.4;
    const target=new THREE.Vector3(-.08,1.03+this.targetAmount*(1.15+(this.cover?.27:0)),0);
    const mobile=window.innerWidth<600;
    const offset=new THREE.Vector3(5.15,4.25,7.7).multiplyScalar(mobile?1.08:1);
    const to=target.clone().add(offset.multiplyScalar(1+this.targetAmount*(.18+(this.cover?.12:0))));
    if(immediate||this.reducedMotion){this.camera.position.copy(to);this.controls.target.copy(target);this.controls.update();}
    else this.cameraTween={from:this.camera.position.clone(),to,targetFrom:this.controls.target.clone(),target,start:performance.now()};
  }
  focusPart(id){
    const group=this.groups.get(id);if(!group)return;
    this.focusId=id;this.controls.minDistance=.45;
    this.model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(group.object);
    const target=bounds.getCenter(new THREE.Vector3());
    target.addScaledVector(group.explode,(this.targetAmount-this.amount)*10);
    target.y+=(this.targetAmount-this.amount)*.85;
    const radius=bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const distance=Math.max(.7,radius/Math.sin(THREE.MathUtils.degToRad(17))*1.22);
    const offset=new THREE.Vector3(5.15,4.25,7.7).normalize().multiplyScalar(distance);
    // Leave breathing room beside the close-up for its explanatory card.
    if(this.width>600)target.add(new THREE.Vector3(.83,0,-.56).multiplyScalar(distance*.11));
    const to=target.clone().add(offset);
    if(this.reducedMotion){this.camera.position.copy(to);this.controls.target.copy(target);this.dirty=true;}
    else this.cameraTween={from:this.camera.position.clone(),to,targetFrom:this.controls.target.clone(),target,start:performance.now()};
  }
  resize(){
    const {width,height}=this.stage.getBoundingClientRect();
    if(!width||!height)return;
    this.width=width;this.height=height;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.renderer.setSize(width,height,false);
    this.dirty=true;
  }
  updateAnnotations(){
    if(!this.model)return;
    const occupied=[];
    // The selected component gets first choice of annotation space.
    const ordered=[...this.parts].sort((a,b)=>(b.id===this.selected)-(a.id===this.selected));
    for(const p of ordered){
      const g=this.groups.get(p.id);const button=this.hotspots.get(p.id);
      if(!g||!button)continue;
      const anchor=new THREE.Vector3(...p.anchor);
      anchor.addScaledVector(g.explode,this.amount*10);anchor.y+=this.amount*.85;
      if(p.id==='tonearm'||p.id==='cartridge'){
        // Keep the marker on the pickup while it swings onto the LP.
        const pivot=new THREE.Vector3(1.58,0,-1.05);
        const base=new THREE.Vector3(...p.anchor).sub(pivot).applyAxisAngle(up,this.arm);
        anchor.copy(base.add(pivot)).addScaledVector(g.explode,this.amount*10);anchor.y+=this.amount*.85;
      }
      const projected=anchor.clone().project(this.camera);
      const x=(projected.x*.5+.5)*this.width;const y=(-projected.y*.5+.5)*this.height;
      const isSelected=p.id===this.selected;
      // Keep the assembled view quiet, then reveal the anatomy as it opens.
      const assembledVisible=['record','tonearm','plinth'].includes(p.id);
      let show=this.labels&&(!this.focusId||isSelected)&&(this.amount>.2||assembledVisible||isSelected)&&projected.z<1&&projected.z>-1;
      show&&=x>32&&x<this.width-30&&y>90&&y<this.height-45;
      const labelWidth=this.width<500?90:125;
      if(!isSelected&&occupied.some(a=>Math.abs(x-a.x)<labelWidth&&Math.abs(y-a.y)<28))show=false;
      if(show)occupied.push({x,y});
      button.style.left=`${x}px`;button.style.top=`${y}px`;
      button.setAttribute('aria-hidden',String(!show));button.tabIndex=show?0:-1;
      // An attachment line makes the exploded placement mechanically legible.
      const line=this.guides.get(p.id);line.visible=this.amount>.12;
      if(line.visible){
        const start=new THREE.Vector3(...p.anchor);start.y+=this.amount*.85;
        const points=line.geometry.attributes.position;points.setXYZ(0,start.x,start.y,start.z);points.setXYZ(1,anchor.x,anchor.y,anchor.z);
        points.needsUpdate=true;line.computeLineDistances();line.material.opacity=isSelected?.42:.10;
      }
    }
  }
  frame(){
    this.animationId=requestAnimationFrame(()=>this.frame());
    const dt=Math.min(this.clock.getDelta(),.05);
    if(document.hidden||!this.visible)return;
    const previous=this.amount;
    this.amount=this.reducedMotion?this.targetAmount:THREE.MathUtils.damp(this.amount,this.targetAmount,5.5,dt);
    if(Math.abs(this.targetAmount-this.amount)<.0003)this.amount=this.targetAmount;
    const change=this.amount-previous;
    if(change&&!this.cameraTween){
      const shift=change*(1.15+(this.cover?.27:0));this.controls.target.y+=shift;this.camera.position.y+=shift;
      const dolly=.18+(this.cover?.12:0);
      const offset=this.camera.position.clone().sub(this.controls.target).multiplyScalar((1+this.amount*dolly)/(1+previous*dolly));
      this.camera.position.copy(this.controls.target).add(offset);
    }
    if(this.cameraTween){
      const tw=this.cameraTween;let t=Math.min((performance.now()-tw.start)/950,1);t=t*t*(3-2*t);
      this.camera.position.lerpVectors(tw.from,tw.to,t);this.controls.target.lerpVectors(tw.targetFrom,tw.target,t);
      if(t===1)this.cameraTween=null;
    }
    const previousArm=this.arm;
    if(this.model){
      this.model.position.y=this.amount*.85;
      for(const [,g] of this.groups){g.object.position.copy(g.base).addScaledVector(g.explode,this.amount);}
      const targetArm=this.playing&&this.amount<.03?-.39:0;
      this.arm=this.reducedMotion?targetArm:THREE.MathUtils.damp(this.arm,targetArm,2.2,dt);
      const tone=this.groups.get('tonearm');const cart=this.groups.get('cartridge');
      if(tone)tone.object.rotation.y=this.arm;
      if(cart&&tone){
        const relative=cart.base.clone().sub(tone.base).applyAxisAngle(up,this.arm);
        cart.object.position.copy(tone.base).add(relative).addScaledVector(cart.explode,this.amount);
        cart.object.rotation.y=this.arm;
      }
      if(this.playing&&this.amount<.03&&!this.reducedMotion){
        for(const id of ['record','mat','platter'])this.groups.get(id).object.rotation.y-=dt*this.rpm*Math.PI/30;
      }
      this.contact.material.opacity=1-this.amount*.5;
    }
    this.controls.update();
    if(this.dirty||change||Math.abs(this.arm-previousArm)>.00001||this.cameraTween||(this.playing&&!this.reducedMotion)){
      this.scene.updateMatrixWorld();this.updateAnnotations();this.renderer.render(this.scene,this.camera);this.dirty=false;
    }
  }
}
