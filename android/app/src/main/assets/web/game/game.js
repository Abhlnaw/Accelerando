'use strict';
const $=id=>document.getElementById(id);
let pieces=[], lines=[], selected, run=null, replayUrl, ticket=0, historyVersion=0;
let cursor=0, camera=0, colors={}, heard='', pulse=0;
let pending=null;
function review(r,result,recordingId){
  pending={line:r.key,time:Date.now(),grade:result.grade,recordingId};
  run=null;lock(true);$('save').hidden=false;$('save').disabled=false;
  $('play').disabled=false;$('play').textContent='Record new run';message('Run complete. Choose Save run to keep the result.');
}
$('save').onclick=async()=>{
  if(!pending)return;
  $('save').disabled=true;lock(true);$('play').disabled=true;
  try{await GameLibrary.record(pending);}
  catch(e){lock(false);$('play').disabled=false;message('Save failed. Try again.');$('save').disabled=false;return;}
  pending=null;lock(false);$('play').disabled=false;$('save').hidden=true;message('Saved to run history.');await history();
};
let burstTime=-1000;
const starter='<score-partwise><work><work-title>Studio scale</work-title></work><part id="P1">'+
  ['CDEF','GFED','C'].map((bar,i)=>'<measure number="'+(i+1)+'"><attributes><divisions>1</divisions></attributes>'+
  [...bar].map(n=>'<note><pitch><step>'+n+'</step><octave>4</octave></pitch><duration>1</duration></note>').join('')+'</measure>').join('')+'</part></score-partwise>';
const display=n=>n==null?'—':Math.round(n);
const key=()=>selected.id+'/'+$('line').value;
function canvas(id){
  const c=$(id),w=c.clientWidth,h=c.clientHeight,scale=devicePixelRatio||1;
  if(c.width!==Math.round(w*scale)||c.height!==Math.round(h*scale)){c.width=Math.round(w*scale);c.height=Math.round(h*scale);}
  const ctx=c.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);
  return {ctx,w,h};
}
function draw(){
  if(!lines.length)return;
  const {ctx,w,h}=canvas('lane'), notes=lines[+$('line').value].score.notes;
  const current=notes[cursor], lead=w*.22, spacing=Math.max(36,w/9);
  camera+=(current.onset-camera)*.35;
  for(let i=0;i<5;i++){ctx.fillStyle='#78614b';ctx.fillRect(0,34+15*i,w,1);}
  ctx.fillStyle='#efbb75';ctx.fillRect(lead-1,10,2,h-35);
  const low=Math.min(...notes.map(n=>n.midi)),high=Math.max(...notes.map(n=>n.midi));
  for(const n of notes){
    const x=lead+(n.onset-camera)*spacing;
    if(x< -30||x>w+30)continue;
    const y=88-(n.midi-low)/Math.max(8,high-low)*58;
    ctx.fillStyle=colors[n.id]==='correct'?'#88d5aa':colors[n.id]?'#ff9881':'#f3dbb5';
    ctx.beginPath();ctx.arc(x,y,10,0,2*Math.PI);ctx.fill();
    ctx.fillStyle='#251c25';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(String(notes.indexOf(n)+1),x,y+4);
    ctx.strokeStyle=n===current?'#ffb6d5':'#987a90';ctx.beginPath();ctx.arc(x,y,14+Math.min(12,Math.max(0,(x-lead)/28)),0,2*Math.PI);ctx.stroke();
    ctx.fillStyle='#ffe5f1';
    if(n===current){ctx.strokeStyle='#ffcb75';ctx.beginPath();ctx.arc(x,y,14+pulse,0,2*Math.PI);ctx.stroke();}
    const age=(performance.now()-burstTime)/420;
    if(n===current && age>=0 && age<1){
      ctx.save();ctx.globalAlpha=1-age;ctx.fillStyle=colors[n.id]==='correct'?'#9ef8c9':'#ffb4ac';
      for(let ray=0;ray<8;ray++){
        const angle=ray*Math.PI/4,radius=18+age*30;
        ctx.fillRect(x+radius*Math.cos(angle),y+radius*Math.sin(angle),3,3);
      }
      ctx.restore();
    }
    ctx.textAlign='center';ctx.font='13px sans-serif';ctx.fillText(Coach.pitchName(n.midi),x,120);
  }
  pulse*=.7;
}
async function history(){
  const version=++historyVersion,rows=await GameLibrary.history(key());
  if(version!==historyVersion)return;
  const graded=rows.filter(r=>r.grade!=null);
  $('best').textContent='Best '+(graded.length?display(Math.max(...graded.map(r=>r.grade)))+'/100':'—');
  $('runs').replaceChildren(...rows.slice().reverse().map((r,i)=>{
    const li=document.createElement('li');li.textContent='Run '+(rows.length-i)+' · '+new Date(r.time).toLocaleString()+' · '+(r.grade==null?'Ungraded':display(r.grade)+'/100');
    if(r.recordingId && window.Android?.hasRecording?.(r.recordingId)){
      const play=document.createElement('button');play.textContent='Replay';
      play.onclick=()=>Android.replayTake(r.recordingId,0);li.append(' ',play);
    }
    return li;
  }));
  const {ctx,w,h}=canvas('chart'),recent=rows.slice(-24);
  ctx.font='12px sans-serif';ctx.fillStyle='#705a46';
  if(!rows.length){ctx.fillText('Your first finished run will appear here.',6,h/2);return;}
  for(const v of [0,50,100]){const y=h-10-v*(h-20)/100;ctx.fillText(String(v),0,y+4);ctx.fillStyle='#decebb';ctx.fillRect(30,y,w-32,1);ctx.fillStyle='#705a46';}
  let previous=null;
  recent.forEach((r,i)=>{if(r.grade==null){previous=null;return;}
    const x=36+i*(w-48)/Math.max(1,recent.length-1),y=h-10-r.grade*(h-20)/100;
    ctx.strokeStyle='#92623b';ctx.fillStyle='#92623b';if(previous){ctx.beginPath();ctx.moveTo(...previous);ctx.lineTo(x,y);ctx.stroke();}
    ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill();previous=[x,y];
  });
}
function clearReplay(){if(replayUrl)URL.revokeObjectURL(replayUrl);replayUrl=null;$('replay').pause();$('replay').removeAttribute('src');$('replay').hidden=true;}
function reset(){
  pending=null;$('save').hidden=true;
  ScoreDemo.stop();$('preview').textContent='Hear line';$('judgment').textContent='READY';$('combo').textContent='0×';$('tally').textContent='000000';$('fill').style.width='0%';
  clearReplay();cursor=camera=pulse=0;colors={};$('points').textContent='—';$('position').textContent='Measure '+lines[+$('line').value].score.notes[0].measure;
  $('clock').textContent='0:00';$('metrics').textContent='';$('findings').replaceChildren();
  $('critique').textContent='Start recording and play the written line at your own pace.';draw();history().catch(error=>message(error.message));
}
function selectPiece(){
  selected=pieces.find(p=>p.id===$('piece').value);
  lines=ScoreLines.read(selected.xml,{profile:'auto',transpose:'score'});
  $('line').replaceChildren(...lines.map((l,i)=>new Option(l.label,String(i))));reset();$('play').disabled=false;
}
async function reload(id){
  pieces=await GameLibrary.pieces();$('piece').replaceChildren(...pieces.map(p=>new Option(p.title,p.id)));
  if(id)$('piece').value=id;selectPiece();
}
async function add(xml,name){
  const parsed=ScoreLines.read(xml,{profile:'auto',transpose:'score'});
  return GameLibrary.save(xml,parsed[0].score.title==='Uploaded piece'?name:parsed[0].score.title);
}
function message(s){$('status').textContent=s;}
function lock(on){for(const id of ['piece','line','performer','import','preview'])$(id).disabled=on;}
function assess(r,partial){
  const result=Coach.assess(r.score,r.segmenter.observations(),{partial,voice:r.voice,uncertain:r.segmenter.uncertain});
  colors=result.colors;const next=Math.max(0,r.score.notes.findIndex(n=>n.id===result.current));
  if(partial){
    ScoreDemo.follow(r.follow,r.schedule,r.score.notes,r.segmenter.observations(),r.time||0,r.voice);
    const position=r.follow.index||0;
    if(position!==cursor)pulse=8;
    cursor=position;colors=r.follow.colors||{};
    result.current=r.score.notes[cursor].id;
  }
  $('position').textContent='Measure '+r.score.notes[cursor].measure+(heard?' · Heard '+heard:'');
  const grade=partial?result.provisionalGrade:result.grade;
  const fraction=Math.min(1,result.matched/r.score.notes.length);
  $('tally').textContent=String(grade==null?0:Math.round(10000*grade/100*(partial?fraction:1))).padStart(6,'0');
  $('fill').style.width=(fraction*100)+'%';
  let chain=0;
  for(const step of result.path){
    if(step.kind==='match' && colors[step.note.id]==='correct')chain++;
    else chain=0;
  }
  $('combo').textContent=chain+'×';
  const hitKey=result.current+'/'+colors[result.current];
  if(result.matched && colors[result.current] && r.lastHit!==hitKey){
    r.lastHit=hitKey;
    const mark=colors[result.current];
    $('judgment').textContent=({correct:'ON PITCH',pitch:'CHECK PITCH',rhythm:'CHECK TIMING'})[mark]||'TRACKING';
    $('judgment').dataset.hit=mark||'pending';
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      burstTime=performance.now();
      $('judgment').animate([{transform:'scale(1.25)',opacity:.55},{transform:'scale(1)',opacity:1}],{duration:220});
    }
  }
  if(partial && !colors[result.current])$('judgment').textContent='LISTENING';
  if(!partial)$('judgment').textContent=grade==null?'UNRATED':'RUN COMPLETE';
  $('points').textContent=grade==null?'—':display(grade)+'/100';
  $('metrics').textContent=(partial?'Live estimate':'Final assessment')+' · Pitch '+display(result.pitch)+' · Coverage '+display(result.coverage)+' · Rhythm '+display(result.rhythm);
  const finding=partial?result.findings.filter(f=>f.id===result.current).at(-1):result.findings[0];
  $('critique').textContent=finding?.message||(result.matched?(partial?'Follow the next written note.':grade==null?'More matching notes are needed for a grade.':'Phrase complete. Listen back to your run.'):'Listening for your first note.');
  draw();return result;
}
function release(r){clearInterval(r.timer);r.stream?.getTracks().forEach(t=>t.stop());r.ctx?.close().catch(()=>{});}
function cancel(){
  ticket++;if(run){const r=run;run=null;if(r.rec?.state==='recording')r.rec.stop();release(r);}
  lock(false);$('play').textContent='Record a run';$('play').disabled=!lines.length;
}
async function finish(){
  if(run?.native){$('play').disabled=true;Android.stop();return;}
  const r=run;if(!r||!r.rec||r.rec.state!=='recording')return;
  clearInterval(r.timer);$('play').disabled=true;r.segmenter.finish();const result=assess(r,false);
  r.rec.onstop=async()=>{
    release(r);if(run!==r)return;
    replayUrl=URL.createObjectURL(new Blob(r.chunks,{type:r.rec.mimeType}));$('replay').src=replayUrl;$('replay').hidden=false;
    for(const f of result.findings.slice(0,3)){const b=document.createElement('button');b.textContent='Replay measure '+f.measure+' · '+f.message;b.onclick=()=>{$('replay').currentTime=Math.max(0,f.time-.3);$('replay').play().catch(e=>message(e.message));};$('findings').append(b);}
    review(r,result,null);
  };
  r.rec.stop();
}
async function start(){
  if(pending && !confirm('Discard this unsaved run and record again?'))return;
  const id=++ticket;reset();lock(true);$('play').disabled=true;message('Opening microphone…');
  const r={score:lines[+$('line').value].score,key:key(),segmenter:new Coach.Segmenter(),chunks:[],voice:$('performer').value==='voice',follow:{}};r.schedule=ScoreDemo.schedule(r.score,null);run=r;
  try{
    if(window.Android?.start){r.native=true;heard='';Android.start(24,95);return;}
    r.ctx=new AudioContext();await r.ctx.resume();if(id!==ticket)return;
    r.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(id!==ticket){release(r);return;}
    const analyser=r.ctx.createAnalyser();analyser.fftSize=r.ctx.sampleRate>60000?8192:4096;
    r.ctx.createMediaStreamSource(r.stream).connect(analyser);
    const samples=new Float32Array(analyser.fftSize);
    r.rec=new MediaRecorder(r.stream);r.rec.ondataavailable=e=>{if(e.data.size)r.chunks.push(e.data);};
    r.rec.start(1000);const origin=r.ctx.currentTime;let last=-1;
    $('play').disabled=false;$('play').textContent='Finish run';message('Recording');heard='';
    r.timer=setInterval(()=>{
      const t=r.time=r.ctx.currentTime-origin;analyser.getFloatTimeDomainData(samples);
      const hz=fundamental(samples,r.ctx.sampleRate);let energy=0,cross=0,a=0,b=0;
      const lag=hz?Math.round(r.ctx.sampleRate/hz):samples.length;
      for(let i=0;i<samples.length;i++){const x=samples[i];energy+=x*x;if(i>=lag){const y=samples[i-lag];a+=x*x;b+=y*y;cross+=x*y;}}
      const confidence=hz?Math.max(0,Math.min(1,cross/Math.max(1e-12,Math.sqrt(a*b)))):0;
      const midi=hz?69+12*Math.log2(hz/440):0;heard=confidence>=.65?Coach.pitchName(midi):'';
      r.segmenter.push({time:Math.max(0,t-samples.length/2/r.ctx.sampleRate),midi,rms:Math.sqrt(energy/samples.length),confidence});
      if(t-last>.16){assess(r,true);last=t;}else draw();
      $('clock').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
      if(t>=180)finish();
    },32);
  }catch(e){if(id===ticket){cancel();message('Recording unavailable: '+e.message);}}
}
$('play').onclick=()=>run?finish():start();$('piece').onchange=selectPiece;$('line').onchange=reset;
$('preview').onclick=async()=>{
  if($('preview').textContent==='Stop preview'){ScoreDemo.stop();$('preview').textContent='Hear line';return;}
  try{window.Android?.stopPlayback?.();$('replay').pause();$('preview').textContent='Stop preview';
    await ScoreDemo.play(lines[+$('line').value].score,null,()=>{$('preview').textContent='Hear line';});
  }catch(e){$('preview').textContent='Hear line';message(e.message);}
};
window.gameBusy=()=>Boolean(run)||Boolean(pending && $('save').disabled);
window.leaveRun=()=>!pending || confirm('Leave without saving this run?');
window.gameEvent=(type,data)=>{
  const r=run;
  if(type==='error'){cancel();message(data.message);return true;}
  if(!r?.native)return ['playback','importing','cancelled','stopped'].includes(type);
  if(type==='loading'){r.sessionId=data.sessionId;message(data.message);return true;}
  if(r.sessionId!=null && data.sessionId!=null && r.sessionId!==data.sessionId)return true;
  if(type==='started'){message('Recording · CREPE live');$('play').disabled=false;$('play').textContent='Finish run';return true;}
  if(type==='cancelled'){cancel();message(data.message);return true;}
  if(type==='frame'){
    r.time=data.time;r.segmenter.push(data);
    heard=data.confidence>=.6?Coach.pitchName(data.midi):'';
    if(data.time-(r.lastUpdate??-1)>.12){assess(r,true);r.lastUpdate=data.time;}else draw();
    $('clock').textContent=Math.floor(data.time/60)+':'+String(Math.floor(data.time%60)).padStart(2,'0');
    return true;
  }
  if(type==='stopped'){
    r.segmenter.finish();const result=assess(r,false);
    const replay=(label,time)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>Android.replayTake(data.recordingId,time);$('findings').append(b);};
    replay('Listen to this run',0);
    for(const f of result.findings.slice(0,3))replay('Replay measure '+f.measure+' · '+f.message,Math.max(0,f.time-.3));
    review(r,result,data.recordingId);return true;
  }
  return true;
};
window.importGameScore=async (xml,name)=>{try{await reload(await add(xml,name));message('Piece added');}catch(e){message(e.message);}};
$('import').onclick=()=>window.Android?Android.importFile('score'):$('file').click();
$('file').onchange=async()=>{const f=$('file').files[0];if(f && f.size<=5*1024*1024)await importGameScore(await f.text(),f.name);else message('Choose MusicXML under 5 MB.');$('file').value='';};
window.stopGame=()=>{ScoreDemo.stop();if(run?.native){Android.stop();return;}if(run){cancel();message('Run interrupted');}};
window.addEventListener('pagehide',window.stopGame);document.addEventListener('visibilitychange',()=>{if(document.hidden)window.stopGame();});
window.addEventListener('resize',()=>{draw();if(selected)history().catch(e=>message(e.message));});
(async()=>{const first=await add(starter,'Studio scale');let id=first;
  if(window.Android && parent.gamePieces){
    const library=parent.gamePieces();
    for(const piece of library){const saved=await GameLibrary.save(piece.xml,piece.title);if(piece===library[0])id=saved;}
  }
  for(const [name,encoded] of window.practiceUploads||[]){try{id=await add(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))),name);}catch(e){message(e.message);}}
  await reload(id);
})().catch(e=>message('Library unavailable: '+e.message));
