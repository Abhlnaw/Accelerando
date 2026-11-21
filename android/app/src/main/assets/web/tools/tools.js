'use strict';
const el = id => document.getElementById(id);
const sharp = 'C C♯ D D♯ E F F♯ G G♯ A A♯ B'.split(' ');
const flat = 'C D♭ D E♭ E F G♭ G A♭ A B♭ B'.split(' ');
const presets = {
  Chromatic: [], 'Guitar · standard': [40,45,50,55,59,64],
  'Guitar · drop D': [38,45,50,55,59,64], Bass: [28,33,38,43],
  Ukulele: [67,60,64,69], Violin: [55,62,69,76], Viola: [48,55,62,69], Cello: [36,43,50,57]
};
const sequence = (first,last) => Array.from({length:last-first+1},(_,i)=>first+i);
const names = () => el('spelling').value === 'flat' ? flat : sharp;
const nameOf = midi => names()[((midi%12)+12)%12] + (Math.floor(midi/12)-1);
const reference = () => Number(el('reference').value) || 440;
const frequency = midi => reference() * 2**((midi-69)/12);
function options(id, values, label=String) {
  el(id).replaceChildren(...values.map(value=>new Option(label(value),String(value))));
}
function targets() {
  const fixed = presets[el('preset').value];
  const values = fixed.length ? fixed : sequence(21,96);
  options('target', ['auto',...values], value=>value==='auto'?'Automatic':nameOf(value));
}
options('preset',Object.keys(presets));
options('beats',sequence(1,12)); el('beats').value='4';
options('root',sequence(0,11),i=>names()[i]); el('root').value='9';
options('octave',sequence(1,6)); el('octave').value='3';
targets();
const fields = ['preset','target','reference','spelling','tempo','beats','division','accent','clickTone','clickVolume','root','octave','wave','harmony','droneVolume'];
const storageKey = 'accelerando.practice-tools.v1';
function remember() {
  try {localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(fields.map(id=>[id,el(id).value]))));} catch {}
}
try {
  const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
  for(const id of fields) {
    const field=el(id);
    if(id==='target') targets();
    if(!Object.hasOwn(saved,id)) continue;
    if(field.tagName==='SELECT' && !Array.from(field.options).some(o=>o.value===saved[id])) continue;
    if(field.tagName==='INPUT' && (!Number.isFinite(+saved[id]) || +saved[id]<+field.min || +saved[id]>+field.max)) continue;
    field.value=saved[id];
  }
} catch {}
function renameNotes() {
  const target=el('target').value, root=el('root').value;
  targets(); el('target').value=target;
  options('root',sequence(0,11),i=>names()[i]); el('root').value=root;
}
renameNotes(); el('droneReference').value=el('reference').value;
let context, stream, micSource, listening=false, listenGeneration=0, pitchTimer;
let ticking=false, timer, nextTick=0, step=0, sequenceId=0;
let droning=false, voices=[], droneGain, clickBus;
const taps=[];
function status(message) {
  const active=[listening?'Tuner':null,ticking?'Metronome':null,droning?'Drone':null].filter(Boolean);
  el('status').textContent=message || (active.length?active.join(' + ')+' active':'Ready');
  el('silence').disabled=!active.length;
  for(const [id,on,start,stop] of [
    ['listen',listening,'Start tuner','Stop tuner'],['click',ticking,'Start metronome','Stop metronome'],
    ['sustain',droning,'Start drone','Stop drone']]) {
    el(id).textContent=on?stop:start; el(id).setAttribute('aria-pressed',String(on));
  }
}
async function audio() {
  if(!context || context.state==='closed') context=new AudioContext();
  await context.resume();
  return context;
}
function stopTuner() {
  listenGeneration++; listening=false; clearTimeout(pitchTimer);
  micSource?.disconnect(); micSource=null;
  if(stream) stream.getTracks().forEach(track=>track.stop());
  stream=null;
  el('needle').hidden=true; el('note').textContent='—';
  el('intonation').textContent='Play one sustained note.'; status();
}
async function startTuner() {
  if(listening){stopTuner();return;}
  const generation=++listenGeneration;
  listening=true; status('Requesting microphone…');
  try {
    if(!navigator.mediaDevices?.getUserMedia) throw Error('Open over HTTPS or localhost to use the microphone.');
    const ctx=await audio();
    if(generation!==listenGeneration) return;
    const input=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(generation!==listenGeneration){input.getTracks().forEach(t=>t.stop());return;}
    stream=input;
    micSource=ctx.createMediaStreamSource(input);
    const analyser=ctx.createAnalyser();
    analyser.fftSize=ctx.sampleRate>60000?8192:4096;
    micSource.connect(analyser);
    const data=new Float32Array(analyser.fftSize);
    input.getAudioTracks()[0].onended=()=>{if(generation===listenGeneration){stopTuner();status('Microphone disconnected.');}};
    let misses=0;
    function read() {
      if(generation!==listenGeneration) return;
      analyser.getFloatTimeDomainData(data);
      const hz=fundamental(data,ctx.sampleRate);
      if(hz) {
        misses=0;
        const heard=69+12*Math.log2(hz/reference());
        const strings=presets[el('preset').value];
        let target=Math.round(heard);
        if(el('target').value!=='auto') target=Number(el('target').value);
        else if(strings.length) target=strings.reduce((a,b)=>Math.abs(heard-b)<Math.abs(heard-a)?b:a);
        const cents=Math.round(100*(heard-target));
        el('note').textContent=nameOf(target);
        el('needle').hidden=false;
        el('needle').style.left=Math.max(0,Math.min(100,50+cents))+'%';
        el('intonation').textContent=hz.toFixed(1)+' Hz · '+(cents>0?'+':'')+cents+' cents · '+(Math.abs(cents)<=5?'In tune':cents<0?'Tune up':'Tune down');
      } else if(++misses>=3) {
        el('note').textContent='—'; el('needle').hidden=true;
        el('intonation').textContent='Listening for a steady pitch…';
      }
      pitchTimer=setTimeout(read,65);
    }
    status(); read();
  } catch(error) {
    if(generation!==listenGeneration) return;
    stopTuner();
    status(error.name==='NotAllowedError'?'Microphone permission was denied. Allow access and try again.':error.message);
  }
}
function lights() {
  el('lights').replaceChildren(...sequence(1,Number(el('beats').value)).map(()=>document.createElement('i')));
}
function stopClick() {
  ticking=false; sequenceId++; clearInterval(timer);
  clickBus?.disconnect(); clickBus=null; lights(); status();
}
async function startClick() {
  if(ticking){stopClick();return;}
  ticking=true; status(); const id=++sequenceId;
  try {
    const ctx=await audio(); if(id!==sequenceId) return;
    clickBus=ctx.createGain(); clickBus.connect(ctx.destination);
    nextTick=ctx.currentTime+.04; step=0;
    function schedule() {
      if(id!==sequenceId) return;
      const division=Number(el('division').value), beats=Number(el('beats').value);
      const tempo=Math.min(300,Math.max(20,Number(el('tempo').value)||96));
      if(nextTick<ctx.currentTime) nextTick=ctx.currentTime+.01;
      while(nextTick<ctx.currentTime+.10) {
        const beat=Math.floor(step/division)%beats, main=step%division===0;
        const accent=main && beat===0 && el('accent').value==='on';
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.frequency.value=accent?1540:main?1050:720;
        osc.type=el('clickTone').value;
        gain.gain.setValueAtTime((Number(el('clickVolume').value)/100)**2*(main ? .38 : .19),nextTick);
        gain.gain.linearRampToValueAtTime(0,nextTick+.035);
        osc.connect(gain); gain.connect(clickBus);
        osc.start(nextTick); osc.stop(nextTick+.04);
        if(main) setTimeout(()=>{if(id===sequenceId) Array.from(el('lights').children).forEach((v,i)=>v.classList.toggle('on',i===beat));},1000*(nextTick-ctx.currentTime));
        nextTick+=60/(tempo*division); step=(step+1)%(beats*division);
      }
    }
    schedule(); timer=setInterval(schedule,25);
  } catch(error) {if(id===sequenceId){stopClick();status(error.message);}}
}
let droneGeneration=0;
function quietVoices() {
  if(!droneGain) return;
  const now=context.currentTime, old=droneGain;
  old.gain.cancelScheduledValues(now); old.gain.setTargetAtTime(0,now,.012);
  for(const osc of voices) osc.stop(now+.06);
  setTimeout(()=>old.disconnect(),100); voices=[]; droneGain=null;
}
function refreshDrone() {
  const midi=(Number(el('octave').value)+1)*12+Number(el('root').value), hz=frequency(midi);
  el('droneDisplay').textContent=nameOf(midi); el('droneFrequency').textContent=hz.toFixed(1)+' Hz';
  if(!droning || !context || context.state!=='running') return;
  quietVoices();
  const now=context.currentTime, harmony=Number(el('harmony').value);
  droneGain=context.createGain(); droneGain.gain.value=0; droneGain.connect(context.destination);
  droneGain.gain.setTargetAtTime(.25*(Number(el('droneVolume').value)/100)**2,now,.02);
  for(const interval of harmony?[0,harmony]:[0]) {
    const osc=context.createOscillator(); osc.type=el('wave').value;
    osc.frequency.value=frequency(midi+interval); osc.connect(droneGain); osc.start(now); voices.push(osc);
  }
}
function stopDrone(){droneGeneration++; droning=false; quietVoices(); status();}
async function startDrone(){
  if(droning){stopDrone();return;}
  const generation=++droneGeneration; droning=true; status();
  try {await audio(); if(generation===droneGeneration) refreshDrone();}
  catch(error){if(generation===droneGeneration){stopDrone();status(error.message);}}
}
function stopAll(){stopTuner();stopClick();stopDrone(); if(context) {const old=context;context=null;old.close().catch(()=>{});}}
function tempo(value){el('tempo').value=Math.min(300,Math.max(20,Math.round(value)||96));el('tempoSlider').value=el('tempo').value;el('tempoDisplay').textContent=el('tempo').value;remember();}
el('tempoSlider').oninput=()=>tempo(+el('tempoSlider').value);
el('slower').onclick=()=>tempo(+el('tempo').value-1);
el('faster').onclick=()=>tempo(+el('tempo').value+1);
el('tap').onclick=()=>{
  const now=performance.now();
  if(taps.length && now-taps.at(-1)>3100) taps.length=0;
  taps.push(now); if(taps.length>6) taps.shift();
  if(taps.length>1) tempo(60000*(taps.length-1)/(now-taps[0]));
};
document.querySelectorAll('nav button').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('section').forEach(panel=>panel.hidden=panel.id!==button.dataset.tool);
  document.querySelectorAll('nav button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
});
for(const id of fields.concat('droneReference')) {
  el(id).addEventListener('change',()=>{
    if(id==='tempo') tempo(Number(el(id).value));
    if(id==='reference'||id==='droneReference'){
      const hz=Math.max(400,Math.min(480,Number(el(id).value)||440));
      el('reference').value=el('droneReference').value=hz;
    }
    if(id==='preset') targets();
    if(id==='spelling') renameNotes();
    if(id==='beats'||id==='division'){step=0;lights();}
    if(['root','octave','wave','harmony','droneVolume','spelling','reference','droneReference'].includes(id)) refreshDrone();
    remember();
  });
}
el('listen').onclick=startTuner; el('click').onclick=startClick; el('sustain').onclick=startDrone;
el('silence').onclick=stopAll;
window.addEventListener('pagehide',stopAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden) stopAll();});
window.stopPracticeTools=stopAll;
lights(); tempo(+el('tempo').value); refreshDrone(); status();
