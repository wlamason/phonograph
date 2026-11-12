import './style.css';
import { parts, tour, signalSteps, tracks } from './content.js';

const $=id=>document.getElementById(id);
const baseUrl=import.meta.env.BASE_URL;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let scene=null, selected=null, tourStep=-1, amount=0, modelReady=false;
let playing=false, trackIndex=0, rpm=100/3;
const announce=message=>{$('live-status').textContent=message;};

// The full part index also works when WebGL is unavailable.
parts.forEach((part,i)=>{
  const button=document.createElement('button');button.dataset.part=part.id;
  button.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${part.short}`;
  button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{
    selectPart(part.id);
    if(innerWidth<600)$('stage').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'start'});
  });
  $('part-index').append(button);
});
if(window.ResizeObserver){
  const detailObserver=new ResizeObserver(([entry])=>{
    if(entry.contentRect.height)$('stage').style.setProperty('--detail-height',`${entry.contentRect.height+50}px`);
  });
  detailObserver.observe($('part-card'));
}

function setAmount(value,{endTour=true}={}){
  amount=Math.max(0,Math.min(1,value));scene?.setAmount(amount);
  $('explode-slider').value=Math.round(amount*100);
  $('explode-slider').style.setProperty('--fill',`${amount*100}%`);
  $('explode-value').value=`${Math.round(amount*100)}%`;
  $('explode-button').querySelector('span').textContent=amount>.5?'Bring it all together':'Explode the turntable';
  if(endTour&&tourStep>=0)closeTour(false);
  // Exploded parts cannot play a physical record: lift the arm and fade out.
  if(amount>.05&&playing)pauseAudio();
}

function selectPart(id,{fromTour=false,focus=false}={}){
  if(!fromTour&&tourStep>=0)closeTour(false);
  selected=id;scene?.select(id);
  document.querySelectorAll('[data-part]').forEach(b=>{
    b.classList.toggle('active',b.dataset.part===id);b.setAttribute('aria-pressed',String(b.dataset.part===id));
  });
  if(!id){$('part-card').hidden=true;return;}
  const index=parts.findIndex(p=>p.id===id),part=parts[index];
  if(!part)return;
  if(!fromTour){
    $('part-card').hidden=false;
    $('part-title').textContent=part.name;$('part-category').textContent=part.category;
    $('part-description').textContent=part.description;
    $('part-fact-label').textContent=part.factLabel;$('part-fact').textContent=part.fact;
    $('part-counter').textContent=`${String(index+1).padStart(2,'0')} / 10`;
    if(amount<.4)setAmount(.88);
    announce(`${part.name}. ${part.description}`);
    if(focus)$('part-close').focus({preventScroll:true});
  }
}

$('part-prev').addEventListener('click',()=>selectPart(parts[(parts.findIndex(p=>p.id===selected)+9)%10].id));
$('part-next').addEventListener('click',()=>selectPart(parts[(parts.findIndex(p=>p.id===selected)+1)%10].id));
$('part-inspect').addEventListener('click',()=>{
  if(selected&&scene){scene.focusPart(selected);announce(`Close-up of ${parts.find(p=>p.id===selected).name.toLowerCase()}. Drag to orbit. Reset camera to see the whole turntable.`);}
});
$('part-close').addEventListener('click',()=>{
  const previous=selected;selectPart(null);document.querySelector(`[data-part="${previous}"]`)?.focus({preventScroll:true});
});
$('explode-slider').addEventListener('input',e=>setAmount(Number(e.target.value)/100));
$('explode-slider').addEventListener('change',()=>announce(`Turntable ${Math.round(amount*100)} percent exploded.`));
$('explode-button').addEventListener('click',()=>{
  const next=amount>.5?0:1;selectPart(null);setAmount(next);announce(next?'The turntable is opening. Select a numbered part to explore.':'The turntable is coming together.');
});
$('labels-toggle').addEventListener('click',()=>{
  const button=$('labels-toggle'),value=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(value));button.setAttribute('aria-label',`${value?'Hide':'Show'} component labels`);button.classList.toggle('active',value);scene?.setLabels(value);
});
$('cover-toggle').addEventListener('click',()=>{
  const button=$('cover-toggle'),value=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(value));button.setAttribute('aria-label',`${value?'Hide':'Show'} dust cover`);button.classList.toggle('active',value);scene?.setCover(value);
  announce(value?'Smoked acrylic dust cover shown. Explode the turntable to lift it clear.':'Dust cover removed.');
});
$('reset-view').addEventListener('click',()=>{scene?.resetCamera();announce('Camera returned to the studio view.');});

function showTourStep(index){
  tourStep=index;const step=tour[index];
  $('part-card').hidden=true;$('tour-card').hidden=false;
  $('tour-title').textContent=step.title;$('tour-description').textContent=step.description;
  $('tour-counter').textContent=`A CLOSER LISTEN / ${String(index+1).padStart(2,'0')} OF 06`;
  $('tour-progress').replaceChildren(...tour.map((_,i)=>{const node=document.createElement('i');node.classList.toggle('complete',i<=index);return node;}));
  $('tour-prev').disabled=index===0;$('tour-next').textContent=index===tour.length-1?'Stay a while ↗':'Next moment →';
  setAmount(step.amount,{endTour:false});selectPart(step.part,{fromTour:true});
  scene?.resetCamera();announce(`Moment ${index+1} of 6. ${step.title} ${step.description}`);
}
function closeTour(restoreFocus=true){
  tourStep=-1;$('tour-card').hidden=true;
  selectPart(null);
  if(restoreFocus)$('tour-start').focus({preventScroll:true});
}
$('tour-start').addEventListener('click',()=>{
  showTourStep(0);$('tour-next').focus({preventScroll:true});
  if(innerWidth<600)$('stage').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'center'});
});
$('tour-next').addEventListener('click',()=>{
  if(tourStep<tour.length-1)showTourStep(tourStep+1);
  else{closeTour(false);selectPart(null);setAmount(0);$('audio-play').focus({preventScroll:false});}
});
$('tour-prev').addEventListener('click',()=>{if(tourStep>0)showTourStep(tourStep-1);});
$('tour-close').addEventListener('click',()=>closeTour());

async function startModel(){
  $('model-error').hidden=true;$('loading').classList.remove('ready');
  try{
    const { TurntableScene } = await import('./scene.js');
    scene=new TurntableScene({canvas:$('turntable'),stage:$('stage'),parts,reducedMotion,
      onSelect:id=>selectPart(id),
      onProgress:value=>{$('loading-progress').style.width=`${Math.min(value*100,95)}%`;},
      onReady:()=>{
        modelReady=true;$('loading-progress').style.width='100%';$('loading').classList.add('ready');
        $('part-inspect').disabled=false;
        scene.setAmount(amount);scene.select(selected);scene.playing=playing;scene.rpm=rpm;
        document.documentElement.dataset.model='ready';
      },
      onError:error=>{
        console.error('Turntable:',error);$('loading').classList.add('ready');$('model-error').hidden=false;
        document.documentElement.dataset.model='error';
        $('part-inspect').disabled=true;
        announce('The 3D view is unavailable. The component descriptions and sound story are still available.');
      },
    });
  }catch(error){
    console.error('WebGL:',error);$('loading').classList.add('ready');$('model-error').hidden=false;
    document.documentElement.dataset.model='error';
    $('part-inspect').disabled=true;
  }
}
$('retry-model').addEventListener('click',()=>location.reload());
// A relative fallback path also survives a GitHub project Pages subdirectory.
$('model-error').querySelector('img').src=`${baseUrl}models/classic-belt-drive.png`;
startModel();

// User-initiated, locally hosted audio. Gain ramps make starts and stops gentle.
const audio=new Audio();audio.loop=true;audio.preload='none';audio.src=`${baseUrl}audio/${tracks[0].file}.mp3`;
let audioContext, gain, pauseTimer, playRequest=0;
let volume=.35;
function prepareAudio(){
  if(!audioContext){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(Context){audioContext=new Context();gain=audioContext.createGain();gain.gain.value=0;
      audioContext.createMediaElementSource(audio).connect(gain);gain.connect(audioContext.destination);}
    else audio.volume=volume;
  }
  return audioContext?.resume();
}
function setPlaying(value){
  playing=value;if(scene)scene.playing=value;
  $('audio-play').querySelector('span').textContent=value?'Ⅱ':'▶';
  $('audio-play').setAttribute('aria-label',`${value?'Pause':'Play'} ${tracks[trackIndex].title}`);
  $('sound-bars').classList.toggle('playing',value);
}
async function playAudio(){
  const request=++playRequest;clearTimeout(pauseTimer);
  try{
    await prepareAudio();
    if(request!==playRequest)return;
    audio.playbackRate=rpm/(100/3);audio.preservesPitch=false;
    await audio.play();
    if(request!==playRequest){audio.pause();return;}
    if(tourStep>=0)closeTour(false);selectPart(null);setAmount(0);setPlaying(true);
    if(gain){gain.gain.cancelScheduledValues(audioContext.currentTime);gain.gain.setTargetAtTime(volume,audioContext.currentTime,.25);}
    $('audio-status').textContent=`Playing ${tracks[trackIndex].title}. ${rpm===45?'45 RPM changes the music’s speed and pitch.':'Original speed.'}`;
  }catch(error){
    setPlaying(false);$('audio-status').textContent='The music could not start. Please try play again.';
    console.error('Audio:',error);
  }
}
function pauseAudio(){
  ++playRequest;setPlaying(false);
  if(gain){gain.gain.cancelScheduledValues(audioContext.currentTime);gain.gain.setTargetAtTime(0,audioContext.currentTime,.08);pauseTimer=setTimeout(()=>audio.pause(),350);}
  else audio.pause();
  $('audio-status').textContent='Music paused.';
}
$('audio-play').addEventListener('click',()=>playing?pauseAudio():playAudio());
$('track-next').addEventListener('click',()=>{
  const resume=playing;pauseAudio();clearTimeout(pauseTimer);audio.pause();
  trackIndex=(trackIndex+1)%tracks.length;const track=tracks[trackIndex];audio.src=`${baseUrl}audio/${track.file}.mp3`;
  $('track-title').textContent=track.title;$('track-genre').textContent=track.subtitle;$('track-time').textContent='00:00';
  $('audio-play').setAttribute('aria-label',`Play ${track.title}`);announce(`Selected ${track.title}. ${track.subtitle}.`);
  if(resume)playAudio();
});
$('volume').addEventListener('input',e=>{
  volume=Number(e.target.value)/100;
  if(gain&&playing)gain.gain.setTargetAtTime(volume,audioContext.currentTime,.05);else if(!gain)audio.volume=volume;
});
for(const [id,speed] of [['speed-33',100/3],['speed-45',45]]){
  $(id).addEventListener('click',()=>{
    rpm=speed;if(scene)scene.rpm=speed;audio.playbackRate=speed/(100/3);audio.preservesPitch=false;
    for(const other of ['speed-33','speed-45']){$(other).classList.toggle('active',other===id);$(other).setAttribute('aria-pressed',String(other===id));}
    announce(`${speed===45?'45':'33⅓'} RPM. ${speed===45?'The record and music run faster, raising the pitch.':'The music plays at its original speed and pitch.'}`);
  });
}
audio.addEventListener('timeupdate',()=>{
  const time=Math.floor(audio.currentTime);$('track-time').textContent=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`;
});
audio.addEventListener('error',()=>{setPlaying(false);$('audio-status').textContent='This composition could not load. Try the next track or check your connection.';});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pauseAudio();});

// Sound-story illustrations: original vectors, local, accessible through text.
const wavePath=(xStart,xEnd,centre,amplitude,phase=0)=>{
  const values=[];for(let x=xStart;x<=xEnd;x+=2){
    const y=centre+Math.sin(x*.075+phase)*Math.sin(x*.014+phase*.3)*amplitude;
    values.push(`${x===xStart?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }return values.join(' ');
};
function signalIllustration(index){
  const thin='#9ba18d',ink='#555f4c',accent='#ab5136',paper='#eeece4';
  const line=(d,color=thin,width=1,extra='')=>`<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" ${extra}/>`;
  const text=(x,y,value,size=9,color=ink)=>`<text x="${x}" y="${y}" font-size="${size}" letter-spacing="1.5" fill="${color}" stroke="none" font-family="DM Sans,sans-serif">${value}</text>`;
  if(index===0){
    let grooves='';for(let row=0;row<8;row++)grooves+=line(wavePath(-80,800,12+row*26,7,row*.12),row===4?accent:thin,row===4?1.5:.7);
    return `<g class="signal-motion">${grooves}</g><circle cx="350" cy="115" r="58" fill="${paper}" stroke="${thin}" stroke-width=".8"/>${line('M305 102 350 147 395 102',ink,1.8)}${line('M350 147 350 74',accent,1.2)}<circle cx="350" cy="134" r="3" fill="${accent}" stroke="none"/>${text(285,174,'45°',8)}${text(392,174,'45°',8)}${line('M308 156h-22 M392 156h22',thin,.6)}${text(118,85,'LEFT WALL',7)}${text(477,85,'RIGHT WALL',7)}${line('M195 88 302 111 M473 88 398 111',thin,.7)}`;
  }
  if(index===1){
    let grooves='';for(let row=0;row<4;row++)grooves+=line(wavePath(30,670,137+row*15,9,row*.15),thin,.75);
    return `${grooves}${line('M415 28 375 91',ink,6)}${line('M375 91 350 133',accent,2)}<path d="m350 123 6 9-6 9-6-9Z" stroke="${accent}" fill="${paper}" stroke-width="1.5"/>${line('M328 117q-11 15 0 29 M372 117q11 15 0 29',accent,.7)}${text(82,55,'CANTILEVER',8)}${line('M190 52h165l24 33',thin,.7)}${text(466,112,'DIAMOND TIP',8)}${line('M452 115h-65l-28 16',thin,.7)}${text(84,192,'ONE COMPONENT OF STEREO MOTION',7)}`;
  }
  if(index===2){
    return `${line(wavePath(10,195,108,7),accent,1.5)}<rect x="215" y="65" width="125" height="86" rx="2" fill="none" stroke="${thin}"/>${text(238,103,'PHONO',11)}${text(237,123,'STAGE',11)}${line('M195 108h20 M340 108h30',ink)}${line(wavePath(370,680,108,39),accent,1.5)}${text(47,177,'MILLIVOLTS',7)}${text(238,177,'INVERSE RIAA',7)}${text(475,177,'LINE LEVEL',7)}${line('M37 107v-2 M400 50v116 M400 108h274',thin,.45)}`;
  }
  return `${line(wavePath(5,150,108,21),accent,1.2)}<rect x="170" y="76" width="135" height="65" rx="2" fill="none" stroke="${thin}"/>${text(191,112,'AMPLIFIER',10)}${line('M150 108h20 M305 108h105',ink)}<circle cx="284" cy="124" r="4" fill="${accent}" stroke="none"/><path d="M410 77h27l35-25v110l-35-25h-27Z" fill="none" stroke="${ink}" stroke-width="1.3"/>${line('M485 80q25 28 0 56 M502 63q44 45 0 90 M521 46q63 62 0 124',accent,1.2)}<g class="speaker-ripple">${line('M553 34q72 74 0 148',accent,1)}</g>${text(385,195,'ELECTRICITY → MOVING AIR',7)}`;
}
function setSignalStep(index,{focus=false}={}){
  const step=signalSteps[index];
  signalSteps.forEach((_,i)=>{
    const tab=$(`signal-tab-${i}`);tab.classList.toggle('active',i===index);tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;
  });
  $('signal-panel').setAttribute('aria-labelledby',`signal-tab-${index}`);
  $('signal-kicker').textContent=step.kicker;$('signal-title').textContent=step.title;
  $('signal-description').textContent=step.description;$('signal-note').textContent=step.note;
  $('visual-caption').textContent=step.caption;$('signal-svg').innerHTML=signalIllustration(index);
  if(focus)$(`signal-tab-${index}`).focus();
}
signalSteps.forEach((_,i)=>{
  const tab=$(`signal-tab-${i}`);tab.addEventListener('click',()=>setSignalStep(i));
  tab.addEventListener('keydown',e=>{
    let next;if(e.key==='ArrowRight')next=(i+1)%4;if(e.key==='ArrowLeft')next=(i+3)%4;if(e.key==='Home')next=0;if(e.key==='End')next=3;
    if(next!==undefined){e.preventDefault();setSignalStep(next,{focus:true});}
  });
});
setSignalStep(0);

const dialog=$('about-dialog');
$('about-open').addEventListener('click',()=>dialog.showModal());
$('about-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{
  const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!dialog.open){if(tourStep>=0)closeTour();else if(selected)$('part-close').click();}
});
// Deterministic state for smoke checks without exposing mutable internals.
window.phonograph=Object.freeze({getState:()=>({modelReady,amount,selected,tourStep,playing,trackIndex,rpm})});
