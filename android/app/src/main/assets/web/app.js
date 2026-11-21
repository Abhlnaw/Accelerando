'use strict';
const $=id=>document.getElementById(id);
const store=PracticeStore.create(window.Android,localStorage);
let settings=store.settings();
let score,xml='',builtin=true,pieceId='twinkle',partIndex=0,selection=null,segmenter=null,phase='idle',lastRender=0,lastFrame=0,lastAnalysis=null,inference=[],clipped=false;
let recordStore=store.records(),session=null,recordingId=null,activeSessionId=null,scoreReady=false;
function persistSettings(){
  settings={instrument:$('instrument').value,mode:$('mode').value,target:$('target').value,transpose:$('transpose').value,pieceId,partIndex};
  try{store.saveSettings(settings);}catch(error){notice(error.message);}
}
function resetReport(){lastAnalysis=null;recordingId=null;$('report').hidden=true;markNotes(null);}
const nodeMap=new Map();
const note=(midi,shift)=>{const written=midi-shift;const steps=['C','C','D','D','E','F','F','G','G','A','A','B'];const alter=[0,1,0,1,0,0,1,0,1,0,1,0];return {step:steps[written%12],alter:alter[written%12],octave:Math.floor(written/12)-1};};
function twinkle(instrument){
  const phrases=[[60,60,67,67,69,69,67],[65,65,64,64,62,62,60],[67,67,65,65,64,64,62]];
  const pitches=[...phrases[0],...phrases[1],...phrases[2],...phrases[2],...phrases[0],...phrases[1]];
  let bars='',bar='',beats=0,mi=1;const shift=Coach.profiles[instrument].transpose;
  for(let i=0;i<pitches.length;i++){
    const p=note(pitches[i],shift),duration=i%7===6?2:1;
    bar+=`<note><pitch><step>${p.step}</step><alter>${p.alter}</alter><octave>${p.octave}</octave></pitch><duration>${duration}</duration><type>${duration===2?'half':'quarter'}</type></note>`;beats+=duration;
    if(beats===4){bars+=`<measure number="${mi}">${mi===1?`<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef><transpose><chromatic>${shift%12}</chromatic><octave-change>${Math.trunc(shift/12)}</octave-change></transpose></attributes>`:''}${bar}</measure>`;bar='';beats=0;mi++;}
  }
  return `<score-partwise version="4.0"><work><work-title>Twinkle, Twinkle, Little Star</work-title></work><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${bars}</part></score-partwise>`;
}
function notice(message){$('notice').hidden=!message;$('notice').textContent=message;}
function setPage(page){
  if(!['home','practice','library','progress'].includes(page))return;
  if(phase!=='idle'&&page!=='practice'){notice('Finish or cancel the current take before leaving practice.');return;}
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==page+'-page');
  document.querySelectorAll('.nav').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('page-heading').textContent={home:'Welcome to your studio.',practice:'Practice studio',library:'Music library',progress:'Your progress'}[page];
  if(page==='home')renderHome();if(page==='practice')setTimeout(renderScore,30);if(page==='progress')renderProgress();if(page==='library')renderLibrary();
}
function activeScore(){if(!selection)return score;return {...score,notes:score.notes.filter(n=>n.onset>=selection.onset&&n.onset<selection.end),measures:score.measures.filter(b=>b.onset>=selection.onset&&b.onset<selection.end)};}
function key(){const source=JSON.stringify(score.notes.map(n=>[n.onset,n.duration,n.midi]));let hash=2166136261;for(const c of source)hash=Math.imul(hash^c.charCodeAt(0),16777619);return `${hash>>>0}:${partIndex}:${selection?selection.onset+':'+selection.end:'whole'}:${$('mode').value}:${$('mode').value==='guided'?$('target').value:''}`;}
function changeScore(next){
  try{
    const parsed=Coach.parseScore(next,{profile:$('instrument').value,transpose:$('transpose').value,partIndex});
    score=parsed;xml=next;selection=null;resetReport();scoreReady=true;
    $('piece-title').textContent=score.title;$('piece-meta').textContent=`${score.measures.length} measures · ${Coach.profiles[score.profile].name} · Single melodic line`;
    $('part-control').hidden=score.parts.length<2;$('part').replaceChildren(...score.parts.map(p=>new Option(p.name,p.index)));$('part').value=String(partIndex);
    $('follow-label').textContent='Your score';$('score-subtitle').textContent='Choose a measure to practice from there';notice('');renderScore();
    $('coach-title').textContent='Find your first note.';$('coach-copy').textContent=`Your first sounding note is ${Coach.pitchName(score.notes[0].midi)}. Tap Start practice, allow the microphone, and play at your own pace.`;
    return true;
  }catch(error){notice(error.message);return false;}
}
function durationToken(duration){const table={4:'w',2:'h',1:'q',.5:'8',.25:'16',.125:'32',3:'h',1.5:'q',.75:'8',.375:'16'};const token=table[duration];if(!token)throw Error('This notation duration is not supported. Export a simpler melodic excerpt.');return {token,dotted:[3,1.5,.75,.375].includes(duration)};}
function renderScore(){
  if(!score||$('practice-page').hidden)return;
  const host=$('score');host.replaceChildren();nodeMap.clear();
  const VF=Vex.Flow, width=Math.max(280,host.clientWidth-20), perRow=width>650?2:1,barWidth=width/perRow,tieNotes=new Map();
  try{
    for(let start=0;start<score.measures.length;start+=perRow){
      const row=document.createElement('div');row.className='score-row';host.append(row);
      const renderer=new VF.Renderer(row,VF.Renderer.Backends.SVG);renderer.resize(width,165);const context=renderer.getContext();
      for(let column=0;column<perRow&&start+column<score.measures.length;column++){
        const bar=score.measures[start+column],x=column*barWidth;
        const stave=new VF.Stave(x+3,25,barWidth-7);if(column===0)stave.addClef(bar.clef).addKeySignature(bar.signature);
        if(start===0&&column===0)stave.addTimeSignature(`${bar.beats}/${bar.beatType}`);
        stave.setContext(context).draw();context.setFont('sans-serif',11);context.fillText(bar.label,x+10,25);
        const ticks=bar.events.map((e,index)=>{
          const dt=durationToken(e.duration);
          const n=new VF.StaveNote({clef:bar.clef,keys:[e.rest?'b/4':`${e.step.toLowerCase()}/${e.octave}`],duration:dt.token+(e.rest?'r':'')});
          if(dt.dotted)VF.Dot.buildAndAttach([n],{all:true});
          if(!e.rest&&(e.alter||bar.signature!=='C'))n.addModifier(new VF.Accidental(e.alter===1?'#':e.alter===-1?'b':e.alter===2?'##':e.alter===-2?'bb':'n'),0);
          n.setAttribute('id',`score-${e.id||'rest'}-${start+column}-${index}`);return n;
        });
        const voice=new VF.Voice({num_beats:bar.beats,beat_value:bar.beatType}).setStrict(false).addTickables(ticks);
        new VF.Formatter().joinVoices([voice]).format([voice],barWidth-(column===0?110:40));voice.draw(context,stave);
        bar.events.forEach((event,index)=>{
          if(event.rest)return;const tick=ticks[index],previous=tieNotes.get(event.id);
          if(event.tie&&previous){
            if(previous.context===context)new VF.StaveTie({first_note:previous.tick,last_note:tick}).setContext(context).draw();
            else {new VF.StaveTie({first_note:previous.tick}).setContext(previous.context).draw();new VF.StaveTie({last_note:tick}).setContext(context).draw();}
          }
          tieNotes.set(event.id,{tick,context});const element=tick.getSVGElement();if(element){element.dataset.note=event.id;const list=nodeMap.get(event.id)||[];list.push(element);nodeMap.set(event.id,list);}
        });
        const svg=row.querySelector('svg');const zone=document.createElementNS('http://www.w3.org/2000/svg','rect');
        for(const [k,v] of Object.entries({x:x+3,y:0,width:barWidth-7,height:154,fill:'transparent'}))zone.setAttribute(k,v);
        zone.style.cursor='pointer';zone.setAttribute('role','button');zone.setAttribute('tabindex','0');zone.setAttribute('aria-label',`Practice measure ${bar.label}`);
        const select=()=>{if(phase!=='idle')return;resetReport();const index=score.measures.indexOf(bar);selection={onset:bar.onset,end:score.measures[index+1]?.onset||score.duration,label:bar.label};$('follow-label').textContent=`Practicing measure ${bar.label}`;$('score-subtitle').textContent='Tap Whole piece to return to the full melody';notice(`Selected measure ${bar.label}. Start practice when ready.`);};
        zone.addEventListener('click',select);zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')select();});svg.append(zone);
      }
    }
    scoreReady=true;$('start').disabled=false;$('audio-upload').disabled=false;markNotes(lastAnalysis);
  }catch(error){scoreReady=false;$('start').disabled=true;$('audio-upload').disabled=true;notice(`Could not draw this score: ${error.message}`);}
}
function markNotes(result){
  for(const [id,elements] of nodeMap)for(const element of elements){for(const c of ['playing','correct','pitch','rhythm','missing'])element.classList.remove(c);if(result?.colors[id])element.classList.add(result.colors[id]);if(result&&phase==='recording'&&id===result.current)element.classList.add('playing');}
  if(result&&phase==='recording'){
    const target=nodeMap.get(result.current)?.[0];if(target){const area=$('score').getBoundingClientRect(),bounds=target.getBoundingClientRect();if(bounds.top<area.top+30||bounds.bottom>area.bottom-20)target.scrollIntoView({block:'center',behavior:'smooth'});}
  }
}
function setPhase(next){phase=next;const busy=next!=='idle';$('start').hidden=busy;$('stop').hidden=!busy;$('stop').disabled=next==='importing';$('stop').textContent=next==='loading'?'Cancel':next==='importing'?'Reading file…':'Finish take';
  ['instrument','mode','target','transpose','change-piece','audio-upload','score-upload','part','twinkle','whole-piece','reference-upload','home-import','home-continue','home-open-score'].forEach(id=>$(id).disabled=busy);
  document.querySelectorAll('.nav').forEach(button=>button.disabled=busy);
  if(!busy){$('start').disabled=!scoreReady;$('audio-upload').disabled=!scoreReady;}
  $('listening-orb').classList.toggle('listening',next==='recording');
}
function begin(imported=false){
  if(!window.Android){notice('Install the Android APK for microphone recording and on-device analysis. This browser view previews the interface.');return;}
  if(phase!=='idle')return;
  if(!scoreReady){notice('Choose a supported score before starting.');return;}
  const target=Number($('target').value);
  if($('mode').value==='guided'&&(!Number.isFinite(target)||target<30||target>240)){notice('Choose a target tempo between 30 and 240 BPM.');return;}
  if(imported){Android.importFile('take');return;}
  const pitches=activeScore().notes.map(n=>n.midi);
  if(pitches.some(m=>m<24||m>95)){notice('Some notes are outside this model’s supported range (about C1–B6). Select a different passage or transpose the score.');return;}
  resetReport();session={score:activeScore(),scoreKey:key(),pieceId,instrument:$('instrument').value,partIndex,selection:selection?{...selection}:null,mode:$('mode').value,target:target||80,transpose:$('transpose').value};
  segmenter=new Coach.Segmenter();inference=[];clipped=false;lastFrame=0;activeSessionId=null;setPhase('loading');notice('Loading your local pitch model…');Android.start(24,95);
}
function evaluate(partial){return Coach.assess(session.score,segmenter.observations(),{partial,uncertain:segmenter.uncertain,mode:session.mode,targetBpm:session.target});}
window.nativeEvent=(type,data)=>{
  if(type==='importing'){setPhase('importing');notice('Reading your file…');return;}
  if(type==='loading'){
    if(!session){resetReport();session={score:activeScore(),scoreKey:key(),pieceId,instrument:$('instrument').value,partIndex,selection:selection?{...selection}:null,mode:$('mode').value,target:Number($('target').value)||80,transpose:$('transpose').value};}
    activeSessionId=data.sessionId??null;setPhase('loading');notice(data.message);return;
  }
  if(data.sessionId!==undefined&&activeSessionId!==null&&data.sessionId!==activeSessionId)return;
  if(type==='cancelled'){session=null;segmenter=null;activeSessionId=null;setPhase('idle');notice(data.message||'Take cancelled. Nothing was saved.');return;}
  if(type==='playback'){notice(data.message);return;}
  if(type==='started'){segmenter=new Coach.Segmenter();inference=[];clipped=false;lastAnalysis=null;lastFrame=0;lastRender=-Infinity;$('report').hidden=true;setPhase('recording');notice('');$('coach-title').textContent='I’m listening.';$('coach-copy').textContent='Play the melody. Your position and note feedback follow the sound, not a fixed timer.';return;}
  if(type==='frame'){
    if(!segmenter||phase!=='recording')return;lastFrame=data.time;segmenter.push(data);if(data.inferenceMs>0)inference.push(data.inferenceMs);clipped=clipped||data.clipped;
    $('audio-level').style.width=Math.min(100,data.rms*500)+'%';$('elapsed').textContent=`${Math.floor(data.time/60)}:${String(Math.floor(data.time%60)).padStart(2,'0')}`;
    $('audio-status').textContent=data.clipped?'Input is clipping. Move the tablet farther away.':data.rms<.0015?'Waiting for your instrument…':data.confidence<.6?'Uncertain sound — listen closer, avoid chords or background audio.':'Hearing your melody';
    if(data.confidence>=.6){$('heard-note').textContent=Coach.pitchName(data.midi);$('heard-hz').textContent=`${Coach.frequency(data.midi).toFixed(1)} Hz`;$('heard-confidence').textContent=`${Math.round(data.confidence*100)}% pitch evidence`;}else{$('heard-confidence').textContent='Waiting for a reliable pitch';}
    if(data.time-lastRender>.15){lastRender=data.time;lastAnalysis=evaluate(true);markNotes(lastAnalysis);const finding=lastAnalysis.findings.at(-1);if(finding){$('coach-title').textContent=`Measure ${finding.measure}`;$('coach-copy').textContent=finding.message;}else{$('coach-title').textContent=`${lastAnalysis.matched} notes heard`;$('coach-copy').textContent='Keep going. Live markings are provisional; the final report checks the whole passage.';}
      $('latency').textContent=data.inferenceMs?`${Math.round(data.inferenceMs)} ms inference`:'Local processing';}
    return;
  }
  if(type==='stopped'){
    if(!segmenter||!session)return;segmenter.finish();lastAnalysis=evaluate(false);lastAnalysis.inferenceMs=Coach.median(inference)||0;lastAnalysis.clipped=clipped;
    recordingId=data.recordingId||null;setPhase('idle');markNotes(lastAnalysis);showReport(lastAnalysis);
    const r=lastAnalysis;const {path,...savedResult}=r;
    const record={date:Date.now(),...session,title:score.title,passage:session.selection?.label||'Whole piece',duration:data.duration??lastFrame,recordingId,grade:r.grade,pitch:r.pitch,coverage:r.coverage,rhythm:r.rhythm,bpm:r.bpm,fraction:r.fraction,findings:r.findings,model:r.model,result:savedResult};delete record.score;
    try{store.addRecord(record);recordStore=store.records();notice('Practice saved on this tablet. Read your next action below.');}catch(error){notice(error.message+' The current report is still available.');}
    session=null;segmenter=null;activeSessionId=null;$('coach-title').textContent='One take closer.';$('coach-copy').textContent=r.findings[0]?.message||'Finish with one deliberate replay of the phrase.';return;
  }
  if(type==='score'){setPhase('idle');importScore(data.xml);return;}
  if(type==='error'){if(data.scope==='audio'||!data.scope||phase==='importing'){session=null;segmenter=null;activeSessionId=null;setPhase('idle');}notice(data.message);return;}
  if(type==='reference')notice(data.message);
};
function metric(label,value,highlight=false){const el=document.createElement('div');el.className='metric'+(highlight?' highlight':'');const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;el.append(small,strong);return el;}
const display=value=>value===null||!Number.isFinite(value)?'—':Math.round(value);
function showReport(result){
  $('report').hidden=false;$('report-metrics').replaceChildren(metric('Overall',result.grade===null?'Ungraded':display(result.grade)+'/100',true),metric('Pitch',display(result.pitch)),metric('Note coverage',display(result.coverage)),metric('Local rhythm',display(result.rhythm)));
  const tempo=result.bpm?`Measured tempo ${Math.round(result.bpm)} BPM.`:'Too few timing anchors to estimate tempo.';
  $('report-context').textContent=`${Math.round(result.fraction*100)}% of written attacks assessed. ${tempo} ${result.grade===null?'The take needs more reliable matching notes before an overall grade is appropriate.':''} ${result.clipped?'Clipping was detected; retry with more distance from the microphone.':''}`;
  $('findings').replaceChildren();
  for(const finding of result.findings.slice(0,3)){
    const item=document.createElement('div');item.className='finding '+finding.kind;const text=document.createElement('div'),title=document.createElement('strong'),copy=document.createElement('p'),button=document.createElement('button');title.textContent=`Measure ${finding.measure} · ${finding.kind}`;copy.textContent=finding.message+(finding.approximate?' Replay time is an approximate neighboring anchor.':'');button.textContent='Replay passage';button.className='secondary';button.disabled=!recordingId;button.onclick=()=>replay(Math.max(0,finding.time-.3));text.append(title,copy);item.append(text,button);$('findings').append(item);
  }
  if(!result.findings.length){const p=document.createElement('p');p.className='intro';p.textContent=result.grade===null?'No confident corrections to show. Try the whole passage in a quieter room.':'No specific correction stood out. Play the phrase again with the sound you want.';$('findings').append(p);}
  $('replay-full').disabled=!recordingId||!!(window.Android?.hasRecording&&!Android.hasRecording(recordingId));
  $('technical').textContent=`${result.model}. Median frame inference ${Math.round(result.inferenceMs||0)} ms on this device. ${result.uncertain||0} uncertain frames. Live note markings may change when later notes clarify the alignment. Target-tempo score: ${display(result.tempo)}. Frequency is measured in Hz and converted to cents relative to the written sounding pitch.`;
}
function renderProgress(){
  const summary=Coach.historySummary(recordStore,key(),$('instrument').value);
  $('progress-context').textContent=`${score.title} · ${Coach.profiles[$('instrument').value].name} · ${selection?'Measure '+selection.label:'Whole piece'} · ${$('mode').value==='guided'?'Target tempo':'Expressive practice'}`;
  $('progress-metrics').replaceChildren(metric('Attempts',summary.attempts.length,true),metric('Best score',display(summary.best)),metric('Practice minutes',summary.minutes.toFixed(1)),metric('Since first take',summary.improvement===null?'—':`${summary.improvement>=0?'+':''}${Math.round(summary.improvement)} pts`));
  const host=$('progress-chart');host.replaceChildren();
  if(summary.graded.length){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 800 220');svg.setAttribute('role','img');svg.setAttribute('aria-label','Practice scores by attempt');
    for(const value of [0,50,100]){const y=185-value*1.55;const line=document.createElementNS(ns,'line');for(const [k,v]of Object.entries({x1:40,x2:780,y1:y,y2:y,stroke:'#e0e7ee'}))line.setAttribute(k,v);svg.append(line);const text=document.createElementNS(ns,'text');text.setAttribute('x','5');text.setAttribute('y',y+4);text.setAttribute('fill','#708398');text.setAttribute('font-size','12');text.textContent=value;svg.append(text);}
    const points=summary.graded.map((r,i)=>[50+i*720/Math.max(1,summary.graded.length-1),185-r.grade*1.55]);
    const path=document.createElementNS(ns,'polyline');path.setAttribute('points',points.map(p=>p.join(',')).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#087f78');path.setAttribute('stroke-width','3');svg.append(path);
    points.forEach(([x,y],i)=>{const dot=document.createElementNS(ns,'circle');for(const [k,v]of Object.entries({cx:x,cy:y,r:5,fill:'#087f78'}))dot.setAttribute(k,v);const title=document.createElementNS(ns,'title');title.textContent=`Attempt ${i+1}: ${summary.graded[i].grade.toFixed(1)}`;dot.append(title);svg.append(dot);});host.append(svg);
  }else{const p=document.createElement('p');p.className='intro';p.textContent='Your first completed assessment starts this chart. Each take is a chance to notice something new.';host.append(p);}
  $('attempts').replaceChildren();
  const attempts=$('history-filter').value==='all'?recordStore:summary.attempts;
  if(!attempts.length){const empty=document.createElement('p');empty.textContent='No attempts here yet. Finish a take to start your practice log.';$('attempts').append(empty);}
  for(const record of [...attempts].reverse())$('attempts').append(attemptRow(record));
}

function attemptRow(record){
  const row=document.createElement('div');row.className='attempt';const text=document.createElement('div');text.textContent=record.title;
  const small=document.createElement('small');small.textContent=`${new Date(record.date).toLocaleString()} · ${Coach.profiles[record.instrument]?.name||record.instrument} · ${Math.round(record.duration)}s · ${record.passage||'Whole piece'}`;text.append(small);
  const button=document.createElement('button');button.className='secondary';button.textContent=record.grade==null?'Open ungraded report':`${record.grade.toFixed(1)} / 100 · View report`;button.onclick=()=>openRecord(record);row.append(text,button);return row;
}
function replay(seconds){if(phase!=='idle')return;if(!recordingId){notice('No saved audio is available for this report.');return;}if(window.Android?.replayTake)Android.replayTake(recordingId,seconds);else notice('Audio replay is available in the Android app.');}
function renderHome(){
  const totals=store.summary();$('home-metrics').replaceChildren(metric('Practice attempts',totals.attempts,true),metric('Practice minutes',totals.minutes.toFixed(1)),metric('Pieces practiced',totals.pieces),metric('Saved scores',store.library().length+1));
  $('home-piece').textContent=score.title;$('home-instrument').textContent=`${Coach.profiles[$('instrument').value].name} · ${score.measures.length} measures · ${selection?'Measure '+selection.label:'Whole piece'}`;
  $('home-recent').replaceChildren();for(const record of [...recordStore].reverse().slice(0,4))$('home-recent').append(attemptRow(record));
  if(!recordStore.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Your practice story starts with one take. Open the bundled melody or import your own score.';$('home-recent').append(p);}
}
function renderLibrary(){
  let host=$('saved-scores');if(!host){host=document.createElement('section');host.id='saved-scores';$('library-page').append(host);}host.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='Your imported scores';host.append(heading);
  const pieces=store.library();if(!pieces.length){const empty=document.createElement('p');empty.textContent='Imported MusicXML scores are saved here for next time.';host.append(empty);}
  for(const piece of pieces){
    const row=document.createElement('div');row.className='attempt';const title=document.createElement('strong');title.textContent=piece.title;
    const open=document.createElement('button');open.className='secondary';open.textContent='Open score';open.onclick=()=>openPiece(piece.id);
    const remove=document.createElement('button');remove.className='text-button';remove.textContent='Remove';remove.onclick=()=>removePiece(piece);
    const actions=document.createElement('div');actions.append(open,remove);row.append(title,actions);host.append(row);
  }
}
function removePiece(piece){
  let dialog=$('remove-score');if(!dialog){dialog=document.createElement('dialog');dialog.id='remove-score';document.body.append(dialog);}dialog.replaceChildren();
  const title=document.createElement('h2');title.textContent='Remove this saved score?';const copy=document.createElement('p');copy.textContent=`${piece.title} will leave your library. Your original file, practice reports and retained recordings stay available. You can import the score again.`;
  const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Keep score';cancel.onclick=()=>dialog.close();const confirm=document.createElement('button');confirm.className='primary';confirm.textContent='Remove saved copy';
  confirm.onclick=()=>{try{store.removePiece(piece.id);dialog.close();if(pieceId===piece.id)openPiece('twinkle');setPage('library');notice('Saved score removed. Practice reports remain in Your progress.');}catch(error){notice(error.message);}};
  dialog.append(title,copy,cancel,confirm);dialog.showModal();
}
function openPiece(id){
  if(phase!=='idle')return;
  const previous={builtin,pieceId,partIndex};const piece=store.library().find(p=>p.id===id);
  if(id!=='twinkle'&&!piece){notice('This score is no longer in the library. Import it again to practice.');return false;}
  partIndex=piece?.partIndex||0;
  if(!changeScore(id==='twinkle'?twinkle($('instrument').value):piece.xml)){partIndex=previous.partIndex;return false;}
  builtin=id==='twinkle';pieceId=id;persistSettings();setPage('practice');return true;
}
function importScore(source){
  if(phase!=='idle')return;const previous=partIndex;let parsed,selected=0,lastError;
  const doc=new DOMParser().parseFromString(source,'text/xml');const count=doc.documentElement?.children?Array.from(doc.documentElement.children).filter(p=>p.localName==='part').length:0;
  for(let index=0;index<Math.min(count,32);index++){try{parsed=Coach.parseScore(source,{profile:$('instrument').value,transpose:$('transpose').value,partIndex:index});selected=index;break;}catch(error){lastError=error;}}
  if(!parsed){notice(lastError?.message||'Choose a readable MusicXML score.');return false;}
  let piece;try{piece=store.addPiece(source,parsed.title,selected);}catch(error){notice(error.message);return false;}
  partIndex=selected;if(!changeScore(source)){partIndex=previous;return false;}
  builtin=false;pieceId=piece.id;persistSettings();setPage('practice');notice('Score saved in your music library.');return true;
}
function openRecord(record){
  if(phase!=='idle')return;
  if((!record.pieceId&&record.title!=='Twinkle, Twinkle, Little Star')||(record.pieceId&&record.pieceId!=='twinkle'&&!store.library().some(p=>p.id===record.pieceId))){
    let dialog=$('legacy-report');if(!dialog){dialog=document.createElement('dialog');dialog.id='legacy-report';document.body.append(dialog);}dialog.replaceChildren();const title=document.createElement('h2');title.textContent=record.title;
    const info=document.createElement('p');info.textContent=`Saved assessment: ${record.grade==null?'ungraded':record.grade.toFixed(1)+' / 100'} · ${Math.round(record.fraction*100)}% assessed. This report’s score is not in the library. Import matching MusicXML to practice it again.`;
    const metrics=document.createElement('div');metrics.className='metrics';metrics.append(metric('Pitch',display(record.pitch)),metric('Coverage',display(record.coverage)),metric('Rhythm',display(record.rhythm)));
    const playback=document.createElement('button');playback.className='secondary';playback.textContent='Listen to saved take';playback.disabled=!record.recordingId||!!(window.Android?.hasRecording&&!Android.hasRecording(record.recordingId));playback.onclick=()=>window.Android?.replayTake&&Android.replayTake(record.recordingId,0);
    const close=document.createElement('button');close.className='primary';close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(title,info,metrics);
    for(const finding of record.findings||[]){const p=document.createElement('p');p.textContent=`Measure ${finding.measure}: ${finding.message}`;dialog.append(p);}
    dialog.append(playback,close);dialog.showModal();return;
  }
  const instrument=Coach.profiles[record.instrument]?record.instrument:'other';$('instrument').value=instrument;$('mode').value=record.mode||'expressive';$('target').value=record.target||80;$('transpose').value=record.transpose||'score';updateTempoControl();
  if(!openPiece(record.pieceId||'twinkle'))return;
  partIndex=record.partIndex||0;if(!changeScore(xml))return;
  selection=record.selection||null;persistSettings();recordingId=record.recordingId||null;lastAnalysis=record.result||{...record,colors:{},tempo:null,uncertain:0};
  setPage('practice');showReport(lastAnalysis);markNotes(lastAnalysis);$('report').scrollIntoView?.({block:'start'});notice(`Saved report · ${new Date(record.date).toLocaleString()}`);
}
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>setPage(n.dataset.page));
for(const [id,p]of Object.entries(Coach.profiles))$('instrument').add(new Option(p.name,id));
$('instrument').value=Coach.profiles[settings.instrument]?settings.instrument:'guitar';
$('mode').value=settings.mode==='guided'?'guided':'expressive';$('target').value=Number(settings.target)>=30&&Number(settings.target)<=240?settings.target:80;
$('transpose').value=['score','concert','-12','-2','-9','0'].includes(settings.transpose)?settings.transpose:'score';
function updateTempoControl() {
  $('target').closest('label').hidden = $('mode').value !== 'guided';
}
$('mode').addEventListener('change', updateTempoControl);
$('mode').addEventListener('change',()=>{resetReport();persistSettings();});$('target').addEventListener('change',()=>{resetReport();persistSettings();});
updateTempoControl();
$('instrument').onchange=()=>{if(changeScore(builtin?twinkle($('instrument').value):xml))persistSettings();else $('instrument').value=score.profile;};
$('transpose').onchange=()=>{if(changeScore(xml))persistSettings();};
$('part').onchange=()=>{const previous=partIndex;partIndex=Number($('part').value);if(changeScore(xml))persistSettings();else{partIndex=previous;$('part').value=String(previous);}};
$('change-piece').onclick=()=>setPage('library');$('whole-piece').onclick=()=>{selection=null;resetReport();$('follow-label').textContent='Your score';$('score-subtitle').textContent='Choose a measure to practice from there';notice('Whole piece selected.');};
$('twinkle').onclick=()=>openPiece('twinkle');
$('start').onclick=()=>begin();$('stop').onclick=()=>{if(window.Android){$('stop').disabled=true;Android.stop();}};
$('audio-upload').onclick=()=>begin(true);$('score-upload').onclick=()=>window.Android?Android.importFile('score'):notice('Open the Android APK to import scores from your tablet.');
$('reference-upload').onclick=()=>window.Android?Android.importFile('reference'):notice('Reference audio import is available in the Android APK.');
function openSource(url){if(window.Android)Android.openSource(url);else window.open(url,'_blank','noopener');}
$('imslp-search').onclick=()=>openSource('https://imslp.org/index.php?title=Special:Search&search='+encodeURIComponent($('imslp-query').value||score.title));
$('youtube-search').onclick=()=>openSource('https://www.youtube.com/results?search_query='+encodeURIComponent(score.title+' '+Coach.profiles[$('instrument').value].name));
$('replay-full').onclick=()=>replay(0);
$('export-history').onclick=()=>{const content=JSON.stringify(recordStore,null,2);if(window.Android&&Android.exportHistory)Android.exportHistory(content);else{const blob=new Blob([content],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='accelerando-practice.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}};
$('about').onclick=()=>$('credits').showModal();$('close-credits').onclick=()=>$('credits').close();
window.addEventListener('resize',()=>{if(phase==='idle')renderScore();});
changeScore(twinkle($('instrument').value));
if(settings.pieceId&&settings.pieceId!=='twinkle'){
  const saved=store.library().find(p=>p.id===settings.pieceId);if(saved){partIndex=Number(settings.partIndex)||0;if(changeScore(saved.xml)){builtin=false;pieceId=saved.id;}else{partIndex=0;changeScore(twinkle($('instrument').value));}}
}
$('home-continue').onclick=() => setPage('practice');$('home-open-score').onclick=()=>setPage('practice');$('home-library').onclick=()=>setPage('library');$('home-import').onclick=()=>$('score-upload').click();$('home-history').onclick=()=>{$('history-filter').value='all';setPage('progress');};$('history-filter').onchange=renderProgress;
const referenceStop=document.createElement('button');referenceStop.id='stop-reference';referenceStop.className='text-button';referenceStop.textContent='Stop playback';referenceStop.onclick=()=>window.Android?.stopPlayback&&Android.stopPlayback();$('reference-upload').parentElement.append(referenceStop);
const takeStop=document.createElement('button');takeStop.id='stop-take-playback';takeStop.className='text-button';takeStop.textContent='Stop playback';takeStop.onclick=()=>window.Android?.stopPlayback&&Android.stopPlayback();$('replay-full').parentElement.append(takeStop);
const micSettings=document.createElement('button');micSettings.id='microphone-settings';micSettings.className='text-button';micSettings.textContent='Microphone settings';micSettings.onclick=()=>{if(phase!=='idle'){notice('Finish or cancel the current take first.');return;}if(window.Android?.openMicrophoneSettings)Android.openMicrophoneSettings();else notice('Microphone settings are available in the Android app.');};$('audio-status').parentElement.append(micSettings);
setPage('home');
window.appBack=()=>{if(phase!=='idle'){notice('Finish or cancel the take before leaving practice.');return true;}if(!$('home-page').hidden)return false;setPage('home');return true;};
