'use strict';
const $=id=>document.getElementById(id);
const store=PracticeStore.create(window.Android,localStorage);
let settings=store.settings();
let score,xml='',builtin=true,pieceId='twinkle',partIndex=0,selection=null,segmenter=null,phase='idle',lastRender=0,lastFrame=0,lastAnalysis=null,inference=[],clipped=false;
let recordStore=store.records(),session=null,recordingId=null,activeSessionId=null,scoreReady=false;
let scoreLines=[],automaticLine=settings.automaticLine!==false,reportLine='';
function persistSettings(){
  settings={instrument:$('instrument').value,mode:$('mode').value,target:$('target').value,transpose:$('transpose').value,pieceId,partIndex,automaticLine};
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
  ScoreDemo.stop();
  if(!['home','practice','game','tools','library','progress'].includes(page))return;
  if(phase!=='idle'&&page!=='practice'){notice('Finish or cancel the current take before leaving practice.');return;}
  const gameHost=$('game-page'), game=gameHost.querySelector('iframe');
  if(page!=='game' && game?.contentWindow?.gameBusy?.()){notice('Finish the run before leaving.');return;}
  if(page==='game'&&!game){
    window.Android?.stopPlayback?.();
    const panel=document.createElement('iframe');panel.title='Score run';panel.allow='microphone; autoplay';
    panel.src='game/index.html';gameHost.append(panel);
  }else if(game && page!=='game'){if(game.contentWindow?.leaveRun && !game.contentWindow.leaveRun())return;game.contentWindow?.stopGame?.();game.remove();}
  const host=$('tools-page'),frame=host.querySelector('iframe');
  if(page==='tools'&&!frame){window.Android?.stopPlayback?.();const tools=document.createElement('iframe');tools.title='Tuner, metronome and drone';tools.allow='microphone; autoplay';tools.src='tools/index.html';host.append(tools);}
  else if(page!=='tools'&&frame){frame.contentWindow?.stopPracticeTools?.();frame.remove();}
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==page+'-page');
  document.querySelectorAll('.nav').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('page-heading').textContent={home:'Home',game:'Score run',practice:'Practice studio',tools:'Practice tools',library:'Music library',progress:'Your progress'}[page];
  if(page==='home')renderHome();if(page==='practice')setTimeout(renderScore,30);if(page==='progress')renderProgress();if(page==='library')renderLibrary();
}
let rangeStart=null, lastVoiced=null, finishRequested=false, liveMic=false;
function activeScore(){if(!selection)return score;return {...score,notes:score.notes.filter(n=>n.onset<selection.end&&n.onset+n.duration>selection.onset).map(n=>({...n,onset:Math.max(selection.onset,n.onset),duration:Math.min(selection.end,n.onset+n.duration)-Math.max(selection.onset,n.onset)})),measures:score.measures.filter(b=>b.onset>=selection.onset&&b.onset<selection.end)};}
function key(){const source=JSON.stringify(score.notes.map(n=>[n.onset,n.duration,n.midi]));let hash=2166136261;for(const c of source)hash=Math.imul(hash^c.charCodeAt(0),16777619);return `${hash>>>0}:${partIndex}:${selection?selection.onset+':'+selection.end:'whole'}:${$('mode').value}:${$('mode').value==='guided'?$('target').value:''}`;}
function changeScore(next){
  ScoreDemo.stop();
  try{
    const candidates=ScoreLines.read(next,{profile:$('instrument').value,transpose:$('transpose').value});
    if(partIndex>=candidates.length)partIndex=0;const parsed=candidates[partIndex].score;scoreLines=candidates;reportLine='';
    rangeStart=null;score=parsed;xml=next;selection=null;resetReport();scoreReady=true;
    $('piece-title').textContent=score.title;$('piece-meta').textContent=`${score.measures.length} measures · ${Coach.profiles[score.profile].name} · Single melodic line`;
    $('part-control').hidden=candidates.length<2;$('part').replaceChildren(new Option('Match my recording','auto'),...candidates.map((line,i)=>new Option(line.label,i)));$('part').value=automaticLine?'auto':String(partIndex);
    $('follow-label').textContent='Your score';$('score-subtitle').textContent='Tap the first and last measures to practice a range';notice('');renderScore();
    $('coach-title').textContent='Find your first note.';$('coach-copy').textContent=`Your first sounding note is ${Coach.pitchName(score.notes[0].midi)}. Tap Start practice, allow the microphone, and play at your own pace.`;
    if(automaticLine&&candidates.length>1){$('piece-meta').textContent=`${score.measures.length} measures · ${candidates.length} written lines`;$('follow-label').textContent='Score preview';$('coach-title').textContent='Play your line';$('coach-copy').textContent='Finish a take to identify your written line, or select it in the library for live following.';}
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
        const select=()=>{if(phase!=='idle')return;ScoreDemo.stop();resetReport();const index=score.measures.indexOf(bar);const first=Math.min(rangeStart??index,index),last=Math.max(rangeStart??index,index);
          const startBar=score.measures[first],endBar=score.measures[last];
          rangeStart=rangeStart===null?index:null;
          selection={onset:startBar.onset,end:score.measures[last+1]?.onset||score.duration,label:first===last?bar.label:startBar.label+'–'+endBar.label};$('follow-label').textContent=`Practice ${selection.label}`;$('score-subtitle').textContent=rangeStart===null?'Tap a measure to start a new range':'Tap the last measure to extend this passage';notice(`Selected ${selection.label}. Start practice when ready.`);};
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
  ['instrument','mode','target','transpose','change-piece','audio-upload','score-upload','part','twinkle','whole-piece','hear-score','reference-upload','home-import','home-continue'].forEach(id=>$(id).disabled=busy);
  document.querySelectorAll('.nav').forEach(button=>button.disabled=busy);
  if(!busy){$('start').disabled=!scoreReady;$('audio-upload').disabled=!scoreReady;}

}
function begin(imported=false){
  ScoreDemo.stop();
  if(!window.Android){notice('Install the Android APK for microphone recording and on-device analysis. This browser view previews the interface.');return;}
  if(phase!=='idle')return;
  if(!scoreReady){notice('Choose a supported score before starting.');return;}
  const target=Number($('target').value);
  if($('mode').value==='guided'&&(!Number.isFinite(target)||target<30||target>240)){notice('Choose a target tempo between 30 and 240 BPM.');return;}
  if(imported){Android.importFile('take');return;}
  const pitches=activeScore().notes.map(n=>n.midi);
  if((!automaticLine||scoreLines.length===1)&&(!pitches.length||pitches.some(m=>m<24||m>95))){notice('Choose a passage with pitched notes in the supported range (about C1–B6).');return;}
  resetReport();session={score:activeScore(),scoreKey:key(),pieceId,instrument:$('instrument').value,partIndex,selection:selection?{...selection}:null,mode:$('mode').value,target:target||80,transpose:$('transpose').value};
  segmenter=new Coach.Segmenter();inference=[];clipped=false;lastFrame=0;activeSessionId=null;setPhase('loading');notice('Loading your local pitch model…');Android.start(24,95);
}
function evaluate(partial){return Coach.assess(session.score,segmenter.observations(),{partial,uncertain:segmenter.uncertain,mode:session.mode,targetBpm:session.target,voice:['auto','voice'].includes(session.instrument)});}
window.gamePieces=()=>[{title:'Twinkle, Twinkle, Little Star',xml:twinkle('auto')},...store.library()];
window.nativeEvent=(type,data)=>{
  const game=$('game-page').querySelector('iframe')?.contentWindow;
  if(game){
    if(type==='score'){game.importGameScore(data.xml,'Imported score');return;}
    if(game.gameEvent?.(type,data))return;
  }
  if(type==='importing'){setPhase('importing');notice('Reading your file…');return;}
  if(type==='loading'){
    if(!session){resetReport();session={score:activeScore(),scoreKey:key(),pieceId,instrument:$('instrument').value,partIndex,selection:selection?{...selection}:null,mode:$('mode').value,target:Number($('target').value)||80,transpose:$('transpose').value};}
    activeSessionId=data.sessionId??null;setPhase('loading');notice(data.message);return;
  }
  if(data.sessionId!==undefined&&activeSessionId!==null&&data.sessionId!==activeSessionId)return;
  if(type==='cancelled'){session=null;segmenter=null;activeSessionId=null;setPhase('idle');notice(data.message||'Take cancelled. Nothing was saved.');return;}
  if(type==='playback'){notice(data.message);return;}
  if(type==='started'){liveMic=data.message==='Listening through the tablet microphone';lastVoiced=null;finishRequested=false;segmenter=new Coach.Segmenter();inference=[];clipped=false;lastAnalysis=null;lastFrame=0;lastRender=-Infinity;$('report').hidden=true;setPhase('recording');notice('');$('coach-title').textContent='I’m listening.';$('coach-copy').textContent='Play your passage. Pause at the end to finish automatically.';if(!liveMic && data.message){$('coach-title').textContent='Playing your upload';$('coach-copy').textContent='Follow the score while your recording plays.';$('stop').textContent='Cancel upload';}return;}
  if(type==='frame'){
    if(!segmenter||phase!=='recording')return;lastFrame=data.time;segmenter.push(data);if(data.inferenceMs>0)inference.push(data.inferenceMs);clipped=clipped||data.clipped;
    $('audio-level').style.width=Math.max(0,Math.min(100,(20*Math.log10(Math.max(1e-8,data.rms))+90)*100/90))+'%';$('elapsed').textContent=`${Math.floor(data.time/60)}:${String(Math.floor(data.time%60)).padStart(2,'0')}`;
    $('audio-status').textContent=data.clipped?'Input is clipping. Move the tablet farther away.':data.rms<.00003?'Waiting for your instrument…':data.confidence<.6?'Uncertain sound — listen closer, avoid chords or background audio.':'Hearing your melody';
    if(data.confidence>=.6){$('heard-note').textContent=Coach.pitchName(data.midi);$('heard-hz').textContent=`${Coach.frequency(data.midi).toFixed(1)} Hz`;$('heard-confidence').textContent=`${Math.round(data.confidence*100)}% pitch evidence`;}else{$('heard-note').textContent='—';$('heard-hz').textContent='';$('heard-confidence').textContent='Waiting for a reliable pitch';}
    if(data.confidence>=.6){
      lastVoiced=data.time;
      session.voicedLevel=session.voicedLevel==null?data.rms:.9*session.voicedLevel+.1*data.rms;
    } else if(lastVoiced!==null && data.rms>Math.max(.0001,session.voicedLevel*.20)){
      // Unresolved but still audible singing is not an end-of-take pause.
      lastVoiced=data.time;
    }
    if(liveMic && lastVoiced!==null && !finishRequested && segmenter.events.length){
      const current=session.score.notes.findIndex(n=>n.id===lastAnalysis?.current);
      const gap=current>=0 && session.score.notes[current+1] ? session.score.notes[current+1].onset-session.score.notes[current].onset : 0;
      const secondsPerBeat=60/(lastAnalysis?.bpm||session.target||80);
      if(data.time-lastVoiced>Math.max(2.5,gap*secondsPerBeat+1)){
        finishRequested=true;Android.stop();return;
      }
    }
    if(automaticLine && scoreLines.length>1 && data.time-lastRender>.15){
      const match=ScoreLines.choose(scoreLines,segmenter.observations(),selection,['auto','voice'].includes(session.instrument));
      if(!match.ambiguous && score!==match.line.score){
        score=match.line.score;partIndex=scoreLines.indexOf(match.line);session.partIndex=partIndex;
        session.score=activeScore();session.scoreKey=key();delete session.clock;delete session.follow;session.cursor=0;renderScore();$('start').disabled=true;$('audio-upload').disabled=true;
      }
    }
    if(automaticLine && scoreLines.length>1 && !segmenter.observations().length){
      $('coach-title').textContent='Listening for your line';
      $('coach-copy').textContent='Finish your take to match the notes you played to a written line.';
      return;
    }
    if(data.time-lastRender>.15){lastRender=data.time;lastAnalysis=evaluate(true);
      const heard=segmenter.observations();
      if(session.mode!=='expressive' && heard.length){
        if(!session.clock){
          const written=session.mode==='guided'?{...score,tempos:[{beat:0,bpm:session.target}]}:score;
          session.clock=ScoreDemo.schedule(written,selection);
        }
        session.follow ??= {};
        ScoreDemo.follow(session.follow,session.clock,session.score.notes,heard,data.time,['auto','voice'].includes(session.instrument));
        lastAnalysis.current=session.score.notes[session.follow.index].id;
        lastAnalysis.colors=session.follow.colors;
      } else if(heard.length){
        const index=session.score.notes.findIndex(n=>n.id===lastAnalysis.current);
        session.cursor=Math.max(session.cursor||0,index);
        lastAnalysis.current=session.score.notes[session.cursor].id;
      }
      const cursor=session.score.notes.find(n=>n.id===lastAnalysis.current);
      if(cursor)$('follow-label').textContent='Measure '+cursor.measure+' / '+Coach.pitchName(cursor.midi);
      markNotes(lastAnalysis);const finding=lastAnalysis.findings.at(-1);if(finding){$('coach-title').textContent=`Measure ${finding.measure}`;$('coach-copy').textContent=finding.message;}else{$('coach-title').textContent=`${heard.length} notes heard`;$('coach-copy').textContent=heard.length ? lastAnalysis.matched+' matched to the selected music.' : data.rms<.00003?'No microphone signal yet. Check microphone access or move closer.':'Sound is reaching the mic. Sustain one note to establish a pitch.';}
      $('latency').textContent=data.inferenceMs?`${Math.round(data.inferenceMs)} ms inference`:'Local processing';}
    return;
  }
  if(type==='stopped'){
    if(!segmenter||!session)return;segmenter.finish();let ambiguous=false;
    if(automaticLine&&scoreLines.length>1){const match=ScoreLines.choose(scoreLines,segmenter.observations(),selection,['auto','voice'].includes(session.instrument));ambiguous=match.ambiguous;partIndex=scoreLines.indexOf(match.line);score=match.line.score;session.score=activeScore();session.partIndex=partIndex;session.scoreKey=key();}
    reportLine=ambiguous?'Several written lines fit similarly. Select a line in the library or record a more distinctive phrase.':scoreLines[partIndex]?.label||'';
    lastAnalysis=evaluate(false);if(ambiguous)Object.assign(lastAnalysis,{passage:null,grade:null,status:'insufficient_evidence',pitch:null,rhythm:null,coverage:null,findings:[],colors:{}});
    lastAnalysis.reportLine=reportLine;lastAnalysis.inferenceMs=Coach.median(inference)||0;lastAnalysis.clipped=clipped;
    recordingId=data.recordingId||null;setPhase('idle');renderScore();showReport(lastAnalysis);
    const r=lastAnalysis;const {path,...savedResult}=r;
    const record={date:Date.now(),...session,title:score.title,passage:session.selection?.label||'Whole piece',duration:data.duration??lastFrame,recordingId,grade:r.grade,pitch:r.pitch,coverage:r.coverage,rhythm:r.rhythm,bpm:r.bpm,fraction:r.fraction,findings:r.findings,model:r.model,result:savedResult};delete record.score;delete record.clock;delete record.follow;
    try{store.addRecord(record);recordStore=store.records();notice('Practice saved on this tablet. Read your next action below.');}catch(error){notice(error.message+' The current report is still available.');}
    $('report').scrollIntoView?.({block:'start'});session=null;segmenter=null;activeSessionId=null;$('coach-title').textContent='Take complete';$('coach-copy').textContent=r.findings[0]?.message||'Finish with one deliberate replay of the phrase.';return;
  }
  if(type==='score'){setPhase('idle');importScore(data.xml);return;}
  if(type==='error'){if(/permission/i.test(data.message||''))$('audio-status').closest('details').open=true;if(data.scope==='audio'||!data.scope||phase==='importing'){session=null;segmenter=null;activeSessionId=null;setPhase('idle');}notice(data.message);return;}
  if(type==='reference')notice(data.message);
};
function metric(label,value,highlight=false){const el=document.createElement('div');el.className='metric'+(highlight?' highlight':'');const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;el.append(small,strong);return el;}
const display=value=>value===null||!Number.isFinite(value)?'—':Math.round(value);
function showReport(result){
  $('report').hidden=false;$('report-metrics').replaceChildren(metric(result.passage?'Excerpt':'Overall',result.grade===null?(result.passage?display(result.passage.grade)+'/100':'Ungraded'):display(result.grade)+'/100',true),metric('Pitch',display(result.pitch)),metric('Note coverage',display(result.coverage)),metric('Local rhythm',display(result.rhythm)));
  const tempo=result.bpm?`Measured tempo ${Math.round(result.bpm)} BPM.`:'Too few timing anchors to estimate tempo.';
  $('report-context').textContent=`${Math.round(result.fraction*100)}% of written attacks assessed. ${tempo} ${result.grade===null?'The take needs more reliable matching notes before an overall grade is appropriate.':''} ${result.clipped?'Clipping was detected; retry with more distance from the microphone.':''}`;
  if(result.grade===null && !result.passage){
    if(!result.matched)$('report-context').textContent+=' No stable note matches. Check the input meter and sustain one note.';
    else $('report-context').textContent+=' Select the measure you are playing. For singing in a different octave, choose Voice.';
  }
  if(result.passage)$('report-context').textContent+=` Excerpt score covers the first ${result.passage.notes} written attacks (measures ${result.passage.first} to ${result.passage.last}).`;
  if(result.octaveShift)$('report-context').textContent+=` Matched in your performing register (${Math.abs(result.octaveShift)/12} octave difference).`;
  $('findings').replaceChildren();
  $('report-context').textContent += ' '+(result.reportLine||'');
  for(const finding of result.findings.slice(0,3)){
    const item=document.createElement('div');item.className='finding '+finding.kind;const text=document.createElement('div'),title=document.createElement('strong'),copy=document.createElement('p'),button=document.createElement('button');title.textContent=`Measure ${finding.measure} · ${finding.kind}`;copy.textContent=finding.message+(finding.approximate?' Replay time is an approximate neighboring anchor.':'');button.textContent='Hear passage (3 s)';button.className='secondary';button.disabled=!recordingId;button.onclick=()=>replay(Math.max(0,finding.time-.5),true);text.append(title,copy);item.append(text,button);$('findings').append(item);
  }
  if(!result.findings.length){const p=document.createElement('p');p.className='intro';p.textContent=result.grade===null?'No confident corrections to show. Try the whole passage in a quieter room.':'No specific correction stood out. Play the phrase again with the sound you want.';$('findings').append(p);}
  $('replay-full').disabled=!recordingId||!!(window.Android?.hasRecording&&!Android.hasRecording(recordingId));
  $('technical').textContent=`${result.model}. Median frame inference ${Math.round(result.inferenceMs||0)} ms on this device. ${result.uncertain||0} uncertain frames. Live note markings may change when later notes clarify the alignment. Target-tempo score: ${display(result.tempo)}. Frequency is measured in Hz and converted to cents relative to the written sounding pitch.`;
}
function renderProgress(){
  const summary=Coach.historySummary(recordStore,key(),$('instrument').value);
  $('progress-context').textContent=`${score.title} · ${Coach.profiles[$('instrument').value].name} · ${selection?'Measure '+selection.label:'Whole piece'} · ${$('mode').value==='guided'?'Target tempo':$('mode').value==='written'?'Written tempo':'Expressive practice'}`;
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
  renderJournal(attempts);
  if(!attempts.length){const empty=document.createElement('p');empty.textContent='No attempts here yet. Finish a take to start your practice log.';$('attempts').append(empty);}
  for(const record of [...attempts].reverse())$('attempts').append(attemptRow(record));
}

function renderJournal(records){
  const select=$('journal-session');
  select.replaceChildren(new Option('New session without a recording',''));
  const counts=new Map();
  for(const record of [...records].reverse()){
    select.add(new Option(record.title+' ? '+new Date(record.date).toLocaleString(),String(recordStore.indexOf(record))));
    const kinds=new Set(Number.isFinite(record.grade)?record.findings.map(f=>f.kind):[]);
    if(record.mistake)kinds.add(record.mistake);
    for(const kind of kinds)counts.set(kind,(counts.get(kind)||0)+1);
  }
  $('journal-patterns').textContent=[...counts].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1])
    .map(([kind,n])=>kind+' ? '+n+' sessions').join(', ')||'Patterns appear after two sessions with the same mistake.';
  select.onchange=()=>{
    const record=select.value===''?null:recordStore[Number(select.value)];
    $('journal-focus').value=record?.focus||'';
    $('journal-notes').value=record?.notes||'';
    $('journal-minutes').value=record?Math.max(0.01,Number(((record.practiceSeconds??record.duration)/60).toFixed(2))):15;
    $('journal-mistake').value=record?.mistake||'';
  };
  select.onchange();
  $('journal-form').onsubmit=event=>{
    event.preventDefault();
    const focus=$('journal-focus').value.trim();
    if(!focus){$('journal-status').textContent='Enter what you practiced.';return;}
    const fields={focus,notes:$('journal-notes').value.trim(),mistake:$('journal-mistake').value,
      practiceSeconds:Number($('journal-minutes').value)*60};
    try{
      if(select.value==='')store.addRecord({...fields,manual:true,title:score.title,pieceId,scoreKey:key(),
        instrument:$('instrument').value,date:Date.now(),duration:0,grade:null,fraction:0,findings:[]});
      else store.updateRecord(Number(select.value),fields);
      recordStore=store.records();
      renderProgress();
      $('journal-status').textContent='Session saved.';
    }catch(error){$('journal-status').textContent=error.message;}
  };
}

function attemptRow(record){
  const row=document.createElement('div');row.className='attempt';const text=document.createElement('div');text.textContent=record.title;
  const small=document.createElement('small');small.textContent=`${new Date(record.date).toLocaleString()} · ${Coach.profiles[record.instrument]?.name||record.instrument} · ${Math.round(record.practiceSeconds??record.duration)}s · ${record.passage||'Whole piece'}`;text.append(small);
  const button=document.createElement('button');button.className='secondary';button.textContent=record.result?.passage?display(record.result.passage.grade)+'/100 - Excerpt report':record.grade==null?'Open ungraded report':`${record.grade.toFixed(1)} / 100 · View report`;button.onclick=()=>openRecord(record);if(record.focus||record.notes){
    const detail=document.createElement('p');
    detail.textContent=[record.focus,record.notes].filter(Boolean).join(' ? ');
    text.append(detail);
  }
  row.append(text);
  if(!record.manual)row.append(button);
  return row;
}
function replay(seconds,passage=false){if(phase!=='idle')return;if(!recordingId){notice('No saved audio is available for this report.');return;}if(passage && window.Android?.replayPassage)Android.replayPassage(recordingId,seconds);else if(window.Android?.replayTake)Android.replayTake(recordingId,seconds);else notice('Audio replay is available in the Android app.');}
function renderHome(){
  const totals=store.summary();$('home-metrics').replaceChildren(metric('Practice attempts',totals.attempts,true),metric('Practice minutes',totals.minutes.toFixed(1)),metric('Pieces practiced',totals.pieces),metric('Saved scores',store.library().length+1));
  $('home-piece').textContent=score.title;$('home-instrument').textContent=`${Coach.profiles[$('instrument').value].name} · ${score.measures.length} measures · ${selection?'Measure '+selection.label:'Whole piece'}`;
  $('home-recent').replaceChildren();for(const record of [...recordStore].reverse().slice(0,4))$('home-recent').append(attemptRow(record));
  if(!recordStore.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Your finished takes will appear here.';$('home-recent').append(p);}
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
  try{const candidates=ScoreLines.read(source,{profile:$('instrument').value,transpose:$('transpose').value});parsed=candidates[0].score;}catch(error){lastError=error;}
  if(!parsed){notice(lastError?.message||'Choose a readable MusicXML score.');return false;}
  let piece;try{piece=store.addPiece(source,parsed.title,selected);}catch(error){notice(error.message);return false;}
  partIndex=selected;automaticLine=true;if(!changeScore(source)){partIndex=previous;return false;}
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
  automaticLine=false;if(!openPiece(record.pieceId||'twinkle'))return;
  partIndex=record.partIndex||0;if(!changeScore(xml))return;
  selection=record.selection||null;persistSettings();recordingId=record.recordingId||null;lastAnalysis=record.result||{...record,colors:{},tempo:null,uncertain:0};
  setPage('practice');showReport(lastAnalysis);markNotes(lastAnalysis);$('report').scrollIntoView?.({block:'start'});notice(`Saved report · ${new Date(record.date).toLocaleString()}`);
}
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>setPage(n.dataset.page));
for(const [id,p]of Object.entries(Coach.profiles))$('instrument').add(new Option(p.name,id));
$('instrument').value=Coach.profiles[settings.instrument]?settings.instrument:'auto';
$('mode').value=['guided','expressive','written'].includes(settings.mode)?settings.mode:'written';$('target').value=Number(settings.target)>=30&&Number(settings.target)<=240?settings.target:80;
$('transpose').value=['score','concert','-12','-2','-9','0'].includes(settings.transpose)?settings.transpose:'score';
function updateTempoControl() {
  $('target').closest('label').hidden = $('mode').value !== 'guided';
}
$('mode').addEventListener('change', updateTempoControl);
$('mode').addEventListener('change',()=>{resetReport();persistSettings();});$('target').addEventListener('change',()=>{resetReport();persistSettings();});
updateTempoControl();
$('instrument').onchange=()=>{if(changeScore(builtin?twinkle($('instrument').value):xml))persistSettings();else $('instrument').value=score.profile;};
$('transpose').onchange=()=>{if(changeScore(xml))persistSettings();};
$('part').onchange=()=>{const previous=partIndex;automaticLine=$('part').value==='auto';partIndex=automaticLine?0:Number($('part').value);if(changeScore(xml))persistSettings();else{partIndex=previous;$('part').value=String(previous);}};
$('hear-score').onclick=async()=>{
  const button=$('hear-score');
  if(button.dataset.playing==='yes'){ScoreDemo.stop();return;}
  if(phase!=='idle'||!scoreReady)return;
  window.Android?.stopPlayback?.();
  const reset=()=>{button.dataset.playing='no';button.textContent='Hear selection';};
  button.dataset.playing='yes';button.textContent='Stop demonstration';
  try{await ScoreDemo.play(score,selection,reset);}
  catch(error){reset();notice('Score playback failed: '+error.message);}
};
$('change-piece').onclick=()=>setPage('library');$('whole-piece').onclick=()=>{ScoreDemo.stop();rangeStart=null;selection=null;resetReport();$('follow-label').textContent='Your score';$('score-subtitle').textContent='Tap the first and last measures to practice a range';notice('Whole piece selected.');};
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
$('home-continue').onclick=() => setPage('practice');$('home-library').onclick=()=>setPage('library');$('home-import').onclick=()=>$('score-upload').click();$('home-history').onclick=()=>{$('history-filter').value='all';setPage('progress');};$('history-filter').onchange=renderProgress;
const referenceStop=document.createElement('button');referenceStop.id='stop-reference';referenceStop.className='text-button';referenceStop.textContent='Stop playback';referenceStop.onclick=()=>window.Android?.stopPlayback&&Android.stopPlayback();$('reference-upload').parentElement.append(referenceStop);
const takeStop=document.createElement('button');takeStop.id='stop-take-playback';takeStop.className='text-button';takeStop.textContent='Stop playback';takeStop.onclick=()=>window.Android?.stopPlayback&&Android.stopPlayback();$('replay-full').parentElement.append(takeStop);
const micSettings=document.createElement('button');micSettings.id='microphone-settings';micSettings.className='text-button';micSettings.textContent='Microphone settings';micSettings.onclick=()=>{if(phase!=='idle'){notice('Finish or cancel the current take first.');return;}if(window.Android?.openMicrophoneSettings)Android.openMicrophoneSettings();else notice('Microphone settings are available in the Android app.');};$('audio-status').parentElement.append(micSettings);
setPage('home');
window.appBack=()=>{if(phase!=='idle'){notice('Finish or cancel the take before leaving practice.');return true;}if(!$('home-page').hidden)return false;setPage('home');return true;};
