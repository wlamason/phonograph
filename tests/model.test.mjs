import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parts } from '../src/content.js';

let model, groups;
before(async()=>{
  // Decode actual exported transforms/meshes in Node. Texture pixels are not
  // required for geometry checks; rendering still requires a real browser.
  globalThis.self=globalThis;
  globalThis.createImageBitmap=async()=>({width:512,height:512,close(){}});
  const data=fs.readFileSync(new URL('../public/models/classic-belt-drive.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  model=gltf.scene;model.scale.setScalar(10);model.updateMatrixWorld(true);
  groups=new Map();model.traverse(o=>{if(o.userData.partId)groups.set(o.userData.partId,o);});
});

test('every explorable component is an independently movable exported group',()=>{
  assert.equal(groups.size,11);
  for(const part of parts){
    const group=groups.get(part.id);assert.ok(group,`missing ${part.id}`);
    assert.equal(group.userData.explode.length,3);
    assert.ok(group.children.length>0,`${part.id} has no geometry`);
    assert.ok(!new THREE.Box3().setFromObject(group).isEmpty());
  }
});

test('the playable stylus meets the top of the record and lands in its groove area',()=>{
  const stylus=model.getObjectByName('Diamond_stylus_tip');
  assert.ok(stylus,'the diamond tip must be an actual exported mesh');
  const tipBounds=new THREE.Box3().setFromObject(stylus);
  const record=groups.get('record');
  const recordMesh=model.getObjectByName('12_inch_vinyl_LP');
  assert.ok(recordMesh);
  const recordBounds=new THREE.Box3().setFromObject(recordMesh);
  assert.ok(Math.abs(tipBounds.min.y-recordBounds.max.y)<.007,'stylus height differs from vinyl surface by more than 0.7 mm in physical scale');
  const tip=tipBounds.getCenter(new THREE.Vector3());
  const pivot=groups.get('tonearm').getWorldPosition(new THREE.Vector3());
  tip.sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),-.39).add(pivot);
  const centre=record.getWorldPosition(new THREE.Vector3());
  const radius=Math.hypot(tip.x-centre.x,tip.z-centre.z);
  assert.ok(radius>.54&&radius<1.47,`stylus lands outside groove band: ${radius}`);
});

test('assembled and exploded geometry stays in the default desktop and mobile camera frusta',()=>{
  for(const amount of [0,1]){
    for(const group of groups.values()){
      group.userData.base??=group.position.clone();
      const [x,y,z]=group.userData.explode;
      group.position.copy(group.userData.base).add(new THREE.Vector3(x,y,z).multiplyScalar(amount*.1));
    }
    model.position.y=.85*amount;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3();
    for(const [id,group] of groups)if(id!=='cover')bounds.union(new THREE.Box3().setFromObject(group));
    for(const [name,aspect,mobile] of [['desktop',1.35,false],['mobile',1,true]])for(const cover of [false,true]){
      const target=new THREE.Vector3(-.08,1.03+amount*(1.15+(cover?.27:0)),0);
      const offset=new THREE.Vector3(5.15,4.25,7.7).multiplyScalar((mobile?1.08:1)*(1+amount*(.18+(cover?.12:0))));
      const camera=new THREE.PerspectiveCamera(34,aspect,.05,80);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
      model.traverse(mesh=>{
        if(!mesh.isMesh)return;
        let parent=mesh;while(parent&&!parent.userData.partId)parent=parent.parent;
        if(parent?.userData.partId==='cover'&&!cover)return;
        const vertices=mesh.geometry.attributes.position;
        for(let i=0;i<vertices.count;i++){
          const projected=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld).project(camera);
          assert.ok(Math.abs(projected.x)<.98&&Math.abs(projected.y)<.98,`${name}, explosion ${amount}, cover ${cover}: ${mesh.name} clips at ${projected.toArray()}`);
        }
      });
    }
    assert.ok(bounds.min.y>-.02,'exploded feet pass below the floor');
  }
});

test('the GLB stays within the delivery budget and includes embedded materials',()=>{
  const file=fs.readFileSync(new URL('../public/models/classic-belt-drive.glb',import.meta.url));
  assert.ok(file.length<5*1024*1024,'GLB exceeds 5 MiB');
  const jsonLength=file.readUInt32LE(12);const gltf=JSON.parse(file.subarray(20,20+jsonLength).toString());
  assert.ok(gltf.images.length>=1,'the walnut texture is missing');
  for(const image of gltf.images)assert.ok(image.bufferView!==undefined,'texture requires an external request');
  for(const accessor of gltf.accessors)assert.ok(accessor.count>0);
});

test('GitHub Pages output contains local assets and no root-absolute application requests',()=>{
  const docs=new URL('../docs/',import.meta.url);
  const html=fs.readFileSync(new URL('index.html',docs),'utf8');
  assert.ok(!/(?:src|href)="\/(?!\/)/.test(html),'root paths break repository Pages hosting');
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)){
    assert.ok(fs.existsSync(new URL(match[1],docs)),`missing built asset ${match[1]}`);
  }
  for(const asset of ['models/classic-belt-drive.glb','models/classic-belt-drive.png','audio/jazz.mp3','audio/piano.mp3','audio/ambient.mp3','.nojekyll'])assert.ok(fs.existsSync(new URL(asset,docs)),`missing ${asset}`);
  assert.ok(fs.readdirSync(path.join(docs.pathname,'assets')).some(f=>f.endsWith('.woff2')),'fonts must be bundled locally');
});
