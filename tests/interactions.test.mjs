import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

let dom, tmp;
const $=id=>dom.window.document.getElementById(id);
const click=id=>$(id).click();
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
before(async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  dom=new JSDOM(html,{url:'https://example.github.io/phonograph/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,
    matchMedia:query=>({matches:query.includes('prefers-reduced-motion')}),innerWidth:1440});
  class Audio extends dom.window.EventTarget {
    constructor(){super();this.currentTime=0;this.volume=1;this.paused=true;}
    async play(){this.paused=false;} pause(){this.paused=true;}
  }
  globalThis.Audio=Audio;
  tmp=await fs.mkdtemp(path.join(os.tmpdir(),'phonograph-test-'));
  const entry=path.join(tmp,'main.mjs');
  await build({
    entryPoints:[new URL('../src/main.js',import.meta.url).pathname],bundle:true,format:'esm',outfile:entry,
    define:{'import.meta.env.BASE_URL':'"./"'},loader:{'.css':'empty'},
    plugins:[{name:'geometry-independent-dom-tests',setup(b){
      b.onResolve({filter:/\.\/scene\.js$/},()=>({path:'scene',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
        export class TurntableScene {
          constructor(options){this.options=options;queueMicrotask(()=>options.onReady());}
          setAmount(value){this.amount=value;} select(id){this.selected=id;}
          setCover(value){this.cover=value;} setLabels(value){this.labels=value;} resetCamera(){} focusPart(id){this.focus=id;}
        }`,loader:'js'}));
    }}],
  });
  await import(pathToFileURL(entry).href);await settle();
});
after(async()=>{dom.window.close();await fs.rm(tmp,{recursive:true,force:true});});

test('continuous explosion and reassembly controls agree',()=>{
  assert.equal(window.phonograph.getState().modelReady,true);
  click('explode-button');assert.equal(window.phonograph.getState().amount,1);
  assert.equal($('explode-slider').value,'100');assert.equal($('explode-value').value,'100%');
  assert.match($('explode-button').textContent,/Bring it all together/);
  $('explode-slider').value='42';$('explode-slider').dispatchEvent(new dom.window.Event('input'));
  assert.equal(window.phonograph.getState().amount,.42);
  $('explode-slider').value='100';$('explode-slider').dispatchEvent(new dom.window.Event('input'));
  click('explode-button');assert.equal(window.phonograph.getState().amount,0);
});

test('all ten components open their correct descriptions and wrap through navigation',()=>{
  const buttons=[...document.querySelectorAll('[data-part]')];assert.equal(buttons.length,10);
  for(const button of buttons){
    button.click();assert.equal(window.phonograph.getState().selected,button.dataset.part);
    assert.equal($('part-card').hidden,false);assert.ok($('part-description').textContent.length>100);
    assert.equal(button.getAttribute('aria-pressed'),'true');
  }
  click('part-next');assert.equal(window.phonograph.getState().selected,'record');
  click('part-prev');assert.equal(window.phonograph.getState().selected,'feet');
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal($('part-card').hidden,true);assert.equal(window.phonograph.getState().selected,null);
});

test('six-moment guided tour completes and returns an assembled instrument',()=>{
  click('tour-start');assert.equal(window.phonograph.getState().tourStep,0);
  assert.equal($('tour-prev').disabled,true);
  for(let i=1;i<6;i++){click('tour-next');assert.equal(window.phonograph.getState().tourStep,i);}
  assert.equal(window.phonograph.getState().amount,0);
  click('tour-next');assert.equal(window.phonograph.getState().tourStep,-1);
  assert.equal($('tour-card').hidden,true);assert.equal(document.activeElement,$('audio-play'));
  click('tour-start');$('explode-slider').value='10';$('explode-slider').dispatchEvent(new dom.window.Event('input'));
  assert.equal(window.phonograph.getState().tourStep,-1);assert.equal($('tour-card').hidden,true);
});

test('play assembles the deck, explode pauses playback, tracks and speeds respond',async()=>{
  click('audio-play');await settle();assert.equal(window.phonograph.getState().playing,true);
  assert.equal(window.phonograph.getState().amount,0);
  click('speed-45');assert.equal(window.phonograph.getState().rpm,45);assert.equal($('speed-45').getAttribute('aria-pressed'),'true');
  click('track-next');await settle();assert.equal(window.phonograph.getState().trackIndex,1);assert.equal(window.phonograph.getState().playing,true);
  assert.equal($('track-title').textContent,'After the rain');
  click('explode-button');assert.equal(window.phonograph.getState().playing,false);
  click('speed-33');assert.ok(Math.abs(window.phonograph.getState().rpm-33.333)<.001);
});

test('signal tabs implement arrow-key navigation, selection and panel associations',()=>{
  const tab=$('signal-tab-0');tab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal($('signal-tab-1').getAttribute('aria-selected'),'true');assert.equal(document.activeElement,$('signal-tab-1'));
  assert.equal($('signal-panel').getAttribute('aria-labelledby'),'signal-tab-1');
  $('signal-tab-1').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.equal($('signal-tab-3').getAttribute('aria-selected'),'true');assert.match($('signal-title').textContent,/air/);
});

test('view controls announce their toggled state',()=>{
  click('cover-toggle');assert.equal($('cover-toggle').getAttribute('aria-pressed'),'true');
  assert.equal($('cover-toggle').getAttribute('aria-label'),'Hide dust cover');
  click('labels-toggle');assert.equal($('labels-toggle').getAttribute('aria-pressed'),'false');
  assert.equal($('labels-toggle').getAttribute('aria-label'),'Show component labels');
});
