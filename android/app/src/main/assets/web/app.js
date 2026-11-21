'use strict';
const $=id=>document.getElementById(id);
let score,xml='',builtin=true,partIndex=0,selection=null,segmenter=null,phase='idle',lastRender=0,lastFrame=0,lastAnalysis=null,inference=[],clipped=false;
let recordStore=[];
let scoreLines=[], automaticLine=true, reportLine='';
try{recordStore=JSON.parse(window.Android?Android.loadHistory():localStorage.getItem('accelerando-history')||'[]');if(!Array.isArray(recordStore))recordStore=[];}catch(_){recordStore=[];}
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
  const gameHost=$('game-page'), game=gameHost.querySelector('iframe');
  if(page==='game' && phase!=='idle'){notice('Finish the current take before starting a run.');return;}
  if(page==='game' && !game){
    window.Android?.stopReplay?.();
    const next=document.createElement('iframe');next.src='game/index.html';next.title='Score run';
    next.allow='microphone; autoplay';gameHost.append(next);
  }else if(page!=='game' && game){game.contentWindow.stopGame?.();game.remove();}
  const host=$('tools-page'), frame=host.querySelector('iframe');
  if(page==='tools' && phase!=='idle'){notice('Finish the current take before opening practice tools.');return;}
  if(page==='tools' && !frame){
    window.Android?.stopReplay?.();
    const tools=document.createElement('iframe');
    tools.title='Tuner, metronome and drone';
    tools.allow='microphone; autoplay';
    tools.src='tools/index.html';
    host.append(tools);
  } else if(page!=='tools' && frame){
    frame.contentWindow.stopPracticeTools?.();
    frame.remove();
  }
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==page+'-page');
  document.querySelectorAll('.nav').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('page-heading').textContent={practice:'Practice studio',game:'Score run',tools:'Practice tools',library:'Music library',progress:'Your progress'}[page];
  if(page==='practice')setTimeout(renderScore,30);if(page==='progress')renderProgress();
}
function activeScore(){if(!selection)return score;return {...score,notes:score.notes.filter(n=>n.onset>=selection.onset&&n.onset<selection.end),measures:score.measures.filter(b=>b.onset>=selection.onset&&b.onset<selection.end)};}
function key(){const source=JSON.stringify(score.notes.map(n=>[n.onset,n.duration,n.midi]));let hash=2166136261;for(const c of source)hash=Math.imul(hash^c.charCodeAt(0),16777619);return `${hash>>>0}:${partIndex}:${selection?.label||'whole'}:${$('mode').value}:${$('mode').value==='guided'?$('target').value:''}`;}
function changeScore(next){
  try{
    const candidates=ScoreLines.read(next,{profile:$('instrument').value,transpose:$('transpose').value});
    if(partIndex>=candidates.length)partIndex=0;
    const parsed=candidates[partIndex].score;
    scoreLines=candidates;reportLine='';
    if(!builtin) GameLibrary.save(next,parsed.title).catch(()=>notice('Game library storage is unavailable.'));
    score=parsed;xml=next;selection=null;lastAnalysis=null;$('report').hidden=true;
    $('piece-title').textContent=score.title;$('piece-meta').textContent=`${score.measures.length} measures · ${Coach.profiles[score.profile].name} · Single melodic line`;
    $('part-control').hidden=candidates.length<2;
    $('part').replaceChildren(new Option('Match my recording','auto'),...candidates.map((line,i)=>new Option(line.label,i)));
    $('part').value=automaticLine?'auto':String(partIndex);
    $('follow-label').textContent='Your score';notice('');renderScore();
    $('coach-title').textContent='Find your first note.';$('coach-copy').textContent=`Your first sounding note is ${Coach.pitchName(score.notes[0].midi)}. Tap Start practice, allow the microphone, and play at your own pace.`;
    if(automaticLine && candidates.length>1){
      $('piece-meta').textContent=`${score.measures.length} measures · ${candidates.length} written lines`;
      $('follow-label').textContent='Score preview';
      $('coach-title').textContent='Play your line';
      $('coach-copy').textContent='Record the part you are practicing. The report will identify the written line from your take.';
    }
  }catch(error){notice(error.message);}
}
function durationToken(duration){const table={4:'w',2:'h',1:'q',.5:'8',.25:'16',.125:'32',3:'h',1.5:'q',.75:'8',.375:'16'};const token=table[duration];if(!token)throw Error('This notation duration is not supported. Export a simpler melodic excerpt.');return {token,dotted:[3,1.5,.75,.375].includes(duration)};}
function renderScore(){
  if(!score||$('practice-page').hidden)return;
  const host=$('score');host.replaceChildren();nodeMap.clear();
  const VF=Vex.Flow, width=Math.max(400,host.clientWidth-20), perRow=width>540?2:1,barWidth=width/perRow;
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
          if(!e.rest&&e.alter)n.addModifier(new VF.Accidental(e.alter===1?'#':e.alter===-1?'b':e.alter===2?'##':'bb'),0);
          n.setAttribute('id',`score-${e.id||'rest'}-${start+column}-${index}`);return n;
        });
        const voice=new VF.Voice({num_beats:bar.beats,beat_value:bar.beatType}).setStrict(false).addTickables(ticks);
        new VF.Formatter().joinVoices([voice]).format([voice],barWidth-(column===0?110:40));voice.draw(context,stave);
        bar.events.forEach((event,index)=>{if(event.rest)return;const element=ticks[index].getSVGElement();if(element){element.dataset.note=event.id;const list=nodeMap.get(event.id)||[];list.push(element);nodeMap.set(event.id,list);}});
        const svg=row.querySelector('svg');const zone=document.createElementNS('http://www.w3.org/2000/svg','rect');
        for(const [k,v] of Object.entries({x:x+3,y:0,width:barWidth-7,height:154,fill:'transparent'}))zone.setAttribute(k,v);
        zone.style.cursor='pointer';zone.setAttribute('role','button');zone.setAttribute('tabindex','0');zone.setAttribute('aria-label',`Practice measure ${bar.label}`);
        const select=()=>{if(phase!=='idle')return;const index=score.measures.indexOf(bar);selection={onset:bar.onset,end:score.measures[index+1]?.onset||score.duration,label:bar.label};$('follow-label').textContent=`Practicing measure ${bar.label}`;$('score-subtitle').textContent='Tap Whole piece to return to the full melody';notice(`Selected measure ${bar.label}. Start practice when ready.`);};
        zone.addEventListener('click',select);zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')select();});svg.append(zone);
      }
    }
    markNotes(lastAnalysis);
  }catch(error){notice(`Could not draw this score: ${error.message}`);}
}
function markNotes(result){
  for(const [id,elements] of nodeMap)for(const element of elements){for(const c of ['playing','correct','pitch','rhythm','missing'])element.classList.remove(c);if(result?.colors[id])element.classList.add(result.colors[id]);if(result&&phase==='recording'&&id===result.current)element.classList.add('playing');}
  if(result&&phase==='recording'){
    const target=nodeMap.get(result.current)?.[0];if(target){const area=$('score').getBoundingClientRect(),bounds=target.getBoundingClientRect();if(bounds.top<area.top+30||bounds.bottom>area.bottom-20)target.scrollIntoView({block:'center',behavior:'smooth'});}
  }
}
function setPhase(next){phase=next;const busy=next!=='idle';$('start').hidden=busy;$('stop').hidden=!busy;$('stop').disabled=next==='loading';
  if(busy && (!$('tools-page').hidden || !$('game-page').hidden)) setPage('practice');
  ['instrument','mode','target','transpose','change-piece','audio-upload','score-upload','part','twinkle','whole-piece','reference-upload'].forEach(id=>$(id).disabled=busy);
  $('listening-orb').classList.toggle('listening',next==='recording');
}
function begin(imported=false){
  if(!window.Android){notice('Install the Android APK for microphone recording and on-device analysis. This browser view previews the interface.');return;}
  if(phase!=='idle')return;
  if(imported){Android.importFile('take');return;}
  const pitches=activeScore().notes.map(n=>n.midi);
  if((!automaticLine || scoreLines.length===1) && (!pitches.length || pitches.some(m=>m<24||m>95))){notice('Choose a passage with pitched notes in the supported range (about C1–B6).');return;}
  $('report').hidden=true;segmenter=new Coach.Segmenter();inference=[];clipped=false;lastFrame=0;setPhase('loading');notice('Loading your local pitch model…');Android.start(24,95);
}
function evaluate(partial){return Coach.assess(activeScore(),segmenter.observations(),{partial,uncertain:segmenter.uncertain,mode:$('mode').value,targetBpm:Number($('target').value)||80});}
window.nativeEvent=(type,data)=>{
  if(type==='loading'){setPhase('loading');notice(data.message);return;}
  if(type==='started'){segmenter=new Coach.Segmenter();inference=[];clipped=false;lastAnalysis=null;lastFrame=0;lastRender=-Infinity;$('report').hidden=true;setPhase('recording');notice('');$('coach-title').textContent='I’m listening.';$('coach-copy').textContent='Play the melody. Your position and note feedback follow the sound, not a fixed timer.';return;}
  if(type==='frame'){
    if(!segmenter)return;lastFrame=data.time;segmenter.push(data);if(data.inferenceMs>0)inference.push(data.inferenceMs);clipped=clipped||data.clipped;
    $('audio-level').style.width=Math.min(100,data.rms*500)+'%';$('elapsed').textContent=`${Math.floor(data.time/60)}:${String(Math.floor(data.time%60)).padStart(2,'0')}`;
    $('audio-status').textContent=data.clipped?'Input is clipping. Move the tablet farther away.':data.rms<.00003?'Waiting for your instrument…':data.confidence<.6?'Uncertain sound — listen closer, avoid chords or background audio.':'Hearing your melody';
    if(data.confidence>=.6){$('heard-note').textContent=Coach.pitchName(data.midi);$('heard-hz').textContent=`${Coach.frequency(data.midi).toFixed(1)} Hz`;$('heard-confidence').textContent=`${Math.round(data.confidence*100)}% pitch evidence`;}else{$('heard-confidence').textContent='Waiting for a reliable pitch';}
    if(automaticLine && scoreLines.length>1){
      $('coach-title').textContent='Listening for your line';
      $('coach-copy').textContent='Finish your take to match the notes you played to a written line.';
      return;
    }
    if(data.time-lastRender>.15){lastRender=data.time;lastAnalysis=evaluate(true);markNotes(lastAnalysis);const finding=lastAnalysis.findings.at(-1);if(finding){$('coach-title').textContent=`Measure ${finding.measure}`;$('coach-copy').textContent=finding.message;}else{$('coach-title').textContent=`${lastAnalysis.matched} notes heard`;$('coach-copy').textContent='Keep going. Live markings are provisional; the final report checks the whole passage.';}
      $('latency').textContent=data.inferenceMs?`${Math.round(data.inferenceMs)} ms inference`:'Local processing';}
    return;
  }
  if(type==='stopped'){
    if(!segmenter)return;
    segmenter.finish();
    let ambiguous=false;
    if(automaticLine && scoreLines.length>1) {
      const match=ScoreLines.choose(scoreLines,segmenter.observations(),selection);
      ambiguous=match.ambiguous;
      partIndex=scoreLines.indexOf(match.line);
      score=match.line.score;
    }
    reportLine=ambiguous?'Several written lines fit similarly. Choose a line in the library or record a more distinctive phrase.':scoreLines[partIndex].label;
    lastAnalysis=evaluate(false);
    if(ambiguous){Object.assign(lastAnalysis,{grade:null,status:'insufficient_evidence',pitch:null,rhythm:null,coverage:null,findings:[],colors:{}});}
    setPhase('idle');renderScore();showReport(lastAnalysis);
    if(!ambiguous) $('follow-label').textContent=reportLine;
    const r=lastAnalysis;const record={date:Date.now(),scoreKey:key(),title:score.title,instrument:$('instrument').value,passage:selection?.label||'Whole piece',mode:$('mode').value,target:Number($('target').value),duration:lastFrame,grade:r.grade,pitch:r.pitch,coverage:r.coverage,rhythm:r.rhythm,bpm:r.bpm,fraction:r.fraction,findings:r.findings,model:r.model};
    recordStore.push(record);recordStore=recordStore.slice(-500);if(window.Android)Android.saveHistory(JSON.stringify(recordStore));else localStorage.setItem('accelerando-history',JSON.stringify(recordStore));
    notice('Practice saved on this tablet. Read your next action below.');$('coach-title').textContent='One take closer.';$('coach-copy').textContent=r.findings[0]?.message||'Finish with one deliberate replay of the phrase.';return;
  }
  if(type==='score'){const game=$('game-page').querySelector('iframe');if(game){game.contentWindow.importGameScore(data.xml,'Imported score');return;}builtin=false;partIndex=0;automaticLine=true;changeScore(data.xml);setPage('practice');return;}
  if(type==='error'){setPhase('idle');notice(data.message);return;}
  if(type==='reference')notice(data.message);
};
function metric(label,value,highlight=false){const el=document.createElement('div');el.className='metric'+(highlight?' highlight':'');const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;el.append(small,strong);return el;}
const display=value=>value===null||!Number.isFinite(value)?'—':Math.round(value);
function showReport(result){
  $('report').hidden=false;$('report-metrics').replaceChildren(metric('Overall',result.grade===null?'Ungraded':display(result.grade)+'/100',true),metric('Pitch',display(result.pitch)),metric('Note coverage',display(result.coverage)),metric('Local rhythm',display(result.rhythm)));
  const tempo=result.bpm?`Measured tempo ${Math.round(result.bpm)} BPM.`:'Too few timing anchors to estimate tempo.';
  $('report-context').textContent=`${Math.round(result.fraction*100)}% of written attacks assessed. ${tempo} ${result.grade===null?'The take needs more reliable matching notes before an overall grade is appropriate.':''} ${clipped?'Clipping was detected; retry with more distance from the microphone.':''}`;
  $('findings').replaceChildren();
  $('report-context').textContent += ' '+reportLine;
  for(const finding of result.findings.slice(0,3)){
    const item=document.createElement('div');item.className='finding '+finding.kind;const text=document.createElement('div'),title=document.createElement('strong'),copy=document.createElement('p'),button=document.createElement('button');title.textContent=`Measure ${finding.measure} · ${finding.kind}`;copy.textContent=finding.message+(finding.approximate?' Replay time is an approximate neighboring anchor.':'');button.textContent='Replay passage';button.className='secondary';button.onclick=()=>window.Android&&Android.replay(Math.max(0,finding.time-.3));text.append(title,copy);item.append(text,button);$('findings').append(item);
  }
  if(!result.findings.length){const p=document.createElement('p');p.className='intro';p.textContent=result.grade===null?'No confident corrections to show. Try the whole passage in a quieter room.':'No specific correction stood out. Play the phrase again with the sound you want.';$('findings').append(p);}
  $('technical').textContent=`${result.model}. Median frame inference ${Math.round(Coach.median(inference)||0)} ms on this device. ${result.uncertain} uncertain frames. Live note markings may change when later notes clarify the alignment. Target-tempo score: ${display(result.tempo)}. Frequency is measured in Hz and converted to cents relative to the written sounding pitch.`;
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
  for(const record of [...summary.attempts].reverse().slice(0,20)){const row=document.createElement('div');row.className='attempt';const text=document.createElement('div');text.textContent=new Date(record.date).toLocaleString();const small=document.createElement('small');small.textContent=`${Math.round(record.duration)} seconds · ${Math.round(record.fraction*100)}% assessed · ${record.findings.length} observations`;text.append(small);const grade=document.createElement('strong');grade.textContent=record.grade===null?'Ungraded':record.grade.toFixed(1)+'/100';row.append(text,grade);$('attempts').append(row);}
}
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>setPage(n.dataset.page));
for(const [id,p]of Object.entries(Coach.profiles))$('instrument').add(new Option(p.name,id));
$('instrument').value=localStorage.getItem('accelerando-instrument')||'auto';
function updateTempoControl() {
  $('target').closest('label').hidden = $('mode').value !== 'guided';
}
$('mode').addEventListener('change', updateTempoControl);
updateTempoControl();
$('instrument').onchange=()=>{localStorage.setItem('accelerando-instrument',$('instrument').value);changeScore(builtin?twinkle($('instrument').value):xml);};
$('transpose').onchange=()=>changeScore(xml);
$('part').onchange=()=>{automaticLine=$('part').value==='auto';partIndex=automaticLine?0:Number($('part').value);changeScore(xml);};
$('change-piece').onclick=()=>setPage('library');$('whole-piece').onclick=()=>{selection=null;$('follow-label').textContent='Your score';$('score-subtitle').textContent='Choose a measure to practice from there';notice('Whole piece selected.');};
$('twinkle').onclick=()=>{builtin=true;partIndex=0;changeScore(twinkle($('instrument').value));setPage('practice');};
$('start').onclick=()=>begin();$('stop').onclick=()=>{if(window.Android){$('stop').disabled=true;Android.stop();}};
$('audio-upload').onclick=()=>begin(true);$('score-upload').onclick=()=>window.Android?Android.importFile('score'):notice('Open the Android APK to import scores from your tablet.');
$('reference-upload').onclick=()=>window.Android?Android.importFile('reference'):notice('Reference audio import is available in the Android APK.');
function openSource(url){if(window.Android)Android.openSource(url);else window.open(url,'_blank','noopener');}
$('imslp-search').onclick=()=>openSource('https://imslp.org/index.php?title=Special:Search&search='+encodeURIComponent($('imslp-query').value||score.title));
$('youtube-search').onclick=()=>openSource('https://www.youtube.com/results?search_query='+encodeURIComponent(score.title+' '+Coach.profiles[$('instrument').value].name));
$('replay-full').onclick=()=>window.Android&&Android.replay(0);
$('export-history').onclick=()=>{const content=JSON.stringify(recordStore,null,2);if(window.Android&&Android.exportHistory)Android.exportHistory(content);else{const blob=new Blob([content],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='accelerando-practice.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}};
$('about').onclick=()=>$('credits').showModal();$('close-credits').onclick=()=>$('credits').close();
window.addEventListener('resize',()=>{if(phase==='idle')renderScore();});
changeScore(twinkle($('instrument').value));
