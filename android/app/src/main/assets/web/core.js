/* Instrument-independent score, live-event and assessment logic. Also tested in Node. */
(function(root, factory) {
  const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Coach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const profiles = {
    auto: {name:'Automatic (use score pitch)', transpose:0, low:24, high:95},
    guitar: {name:'Guitar', transpose:-12, low:40, high:88},
    piano: {name:'Piano / keyboard', transpose:0, low:24, high:95},
    violin: {name:'Violin', transpose:0, low:55, high:95},
    viola: {name:'Viola', transpose:0, low:48, high:88},
    cello: {name:'Cello', transpose:0, low:36, high:84},
    flute: {name:'Flute', transpose:0, low:60, high:95},
    clarinet: {name:'B♭ clarinet', transpose:-2, low:50, high:94},
    trumpet: {name:'B♭ trumpet', transpose:-2, low:54, high:84},
    saxophone: {name:'E♭ alto saxophone', transpose:-9, low:49, high:80},
    voice: {name:'Voice', transpose:0, low:36, high:88},
    other: {name:'Other instrument', transpose:0, low:24, high:95}
  };
  const median = values => { const a=[...values].sort((x,y)=>x-y); const n=a.length;
    return n ? (a[Math.floor(n/2)] + a[Math.floor((n-1)/2)])/2 : null; };
  const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  const credit = (error,full,zero) => Math.max(0, Math.min(100,100*(zero-Math.abs(error))/(zero-full)));
  const pitchName = midi => ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][((Math.round(midi)%12)+12)%12]+(Math.floor(Math.round(midi)/12)-1);
  const frequency = midi => 440*2**((midi-69)/12);
  function parseScore(xml, {profile='guitar', transpose='score', partIndex=0, projectedChordLine=false, playbackOnly=false,
                            DOMParser:Parser=globalThis.DOMParser}={}) {
    if(!profiles[profile])throw Error('Choose a supported instrument profile.');
    if (!xml || xml.length>5*1024*1024) throw Error('Choose a MusicXML file smaller than 5 MB.');
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml)) throw Error('Export MusicXML without a custom DOCTYPE or entities.');
    // Standard MusicXML exports commonly carry an external PUBLIC declaration.
    // Remove it locally; never fetch a remote DTD or expand custom entities.
    xml=xml.replace(/<!DOCTYPE\s+score-partwise\b[^>\[\]]*>/gi,'');
    if (/<!DOCTYPE/i.test(xml)) throw Error('Export MusicXML without a custom DOCTYPE.');
    const doc = new Parser().parseFromString(xml,'text/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName!=='score-partwise') throw Error('Choose a readable partwise MusicXML score.');
    const children=(e,tag)=>Array.from(e.children).filter(x=>x.localName===tag);
    const child=(e,tag)=>children(e,tag)[0];
    const text=(e,tag,fallback='')=>child(e,tag)?.textContent?.trim() ?? fallback;
    const number=(e,tag,fallback)=>{const v=Number(text(e,tag,String(fallback)));if(!Number.isFinite(v))throw Error(`Invalid ${tag} in score.`);return v;};
    const parts=children(doc.documentElement,'part');
    const names=Array.from(doc.querySelectorAll('score-part')).map((p,i)=>({id:p.getAttribute('id'),name:p.querySelector('part-name')?.textContent||`Part ${i+1}`}));
    const part=parts[partIndex]; if(!part)throw Error('Select a part with notes.');
    if(part.querySelector('repeat, ending, grace, ornaments'))throw Error('Expand repeats, grace notes and ornaments in your notation editor, then export MusicXML.');
    if(part.querySelector('chord, backup'))throw Error('Live pitch tracking currently assesses one melodic line. Export one voice; chords and overlapping voices need a polyphonic model.');
    const result={title:doc.querySelector('work-title')?.textContent||doc.querySelector('movement-title')?.textContent||'Uploaded piece',
      parts:parts.map((p,i)=>({index:i,name:names.find(n=>n.id===p.getAttribute('id'))?.name||`Part ${i+1}`})), notes:[],measures:[],profile};
    let divisions=1, cursor=0, shift=transpose==='concert'?0:transpose==='score'?profiles[profile].transpose:Number(transpose), signature='C', beats=4, beatType=4, clef='treble', pending=null;
    if(!Number.isFinite(shift))throw Error('Choose a valid written-to-sounding pitch setting.');
    for(const [mi, measure] of children(part,'measure').entries()) {
      let ordinal=0; const printed=measure.getAttribute('text')||measure.getAttribute('number')||String(mi+1);
      const bar={label:printed,events:[],onset:cursor,signature,beats,beatType,clef};
      for(const item of measure.children) {
        if(item.localName==='attributes') {
          divisions=number(item,'divisions',divisions);if(divisions<=0)throw Error('Score divisions must be positive.');
          const tr=child(item,'transpose');
          if(tr)shift=number(tr,'chromatic',0)+12*number(tr,'octave-change',0);
          if(transpose==='concert')shift=0; else if(transpose!=='score')shift=Number(transpose);
          const time=child(item,'time');if(time){beats=number(time,'beats',4);beatType=number(time,'beat-type',4);}
          const cf=child(item,'clef');if(cf){const sign=text(cf,'sign','G');clef=sign==='F'?'bass':sign==='C'?'alto':'treble';}
          const key=child(item,'key');if(key){const fifths=number(key,'fifths',0);signature=({0:'C',1:'G',2:'D',3:'A',4:'E',5:'B',6:'F#',7:'C#','-1':'F','-2':'Bb','-3':'Eb','-4':'Ab','-5':'Db','-6':'Gb','-7':'Cb'})[fifths]||'C';}
          Object.assign(bar,{signature,beats,beatType,clef});continue;
        }
        if(!['note','forward'].includes(item.localName))continue;
        const duration=number(item,'duration',0)/divisions;
        if(duration<=0)throw Error('Each note and rest needs a positive duration.');
        if(!playbackOnly && ![.125,.25,.375,.5,.75,1,1.5,2,3,4].includes(duration))throw Error('This notation duration is unsupported. Export a melodic excerpt with standard note lengths.');
        const rest=item.localName==='forward'||!!child(item,'rest');
        if(rest){if(pending && !projectedChordLine)throw Error('A tie cannot continue through a rest.');pending=null;bar.events.push({rest:true,onset:cursor,duration});cursor+=duration;continue;}
        const p=child(item,'pitch');if(!p)throw Error('Unpitched percussion is not supported by this pitch model.');
        const step=text(p,'step'), octave=number(p,'octave',4), alter=number(p,'alter',0);
        const pc={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step];
        if(pc===undefined||!Number.isInteger(alter))throw Error('Use standard semitone pitches in the score.');
        const written=12*(octave+1)+pc+alter, sounding=written+shift;
        if(!Number.isInteger(octave)||written<0||written>127||sounding<0||sounding>127)throw Error('Score pitches must be in the MIDI range.');
        const ties=Array.from(item.querySelectorAll('tie, tied')).map(t=>t.getAttribute('type'));
        // A tied pitch may move to another chord rank in the next measure.
        if(projectedChordLine && pending &&
           (pending.midi!==sounding || !ties.some(t=>t==='stop'||t==='continue'))) pending=null;
        let attack;
        if(pending){
          if(!ties.some(t=>t==='stop'||t==='continue')||pending.midi!==sounding)throw Error('Tie continuations must stay on the same pitch.');
          attack=pending;attack.duration+=duration;
        }else{
          if(ties.includes('stop') && !projectedChordLine)throw Error('Include the start of each tie.');
          attack={id:`m${mi+1}n${++ordinal}`,measure:printed,onset:cursor,duration,midi:sounding,written};result.notes.push(attack);
        }
        bar.events.push({rest:false,id:attack.id,midi:sounding,written,step,octave,alter,duration,onset:cursor,tie:!!pending});
        pending=ties.some(t=>t==='start'||t==='continue')?attack:null;cursor+=duration;
      }
      if(bar.events.length)result.measures.push(bar);
    }
    if(pending && !projectedChordLine)throw Error('Include the end of the last tie.');
    if(!result.notes.length)throw Error('This part has no pitched notes.');
    if(result.notes.length>500)throw Error('Select an excerpt of at most 500 notes for live practice.');
    result.duration=cursor;return result;
  }

  class Segmenter {
    constructor(){this.events=[];this.current=null;this.pending=[];this.uncertain=[];this.lastGood=0;this.lowEnergy=Infinity;this.previousEnergy=0;}
    finish(){if(this.current&&this.current.samples.length>=3){const c=this.current;this.events.push({onset:c.onset,end:c.end,midi:median(c.samples),confidence:median(c.confidences)});}this.current=null;this.pending=[];}
    push(frame){
      const {time:t,midi,confidence,rms}=frame;
      if(confidence<.60||!Number.isFinite(midi)){
        if(rms>=.00003)this.uncertain.push(t);
        this.pending=[];
        this.lowEnergy=Math.min(this.lowEnergy,rms);
        if(this.current&&t-this.lastGood>.11)this.finish();
        this.previousEnergy=rms;return false;
      }
      this.lastGood=t;
      if(!this.current){this.current={onset:Math.max(0,t-.032),end:t,samples:[midi],confidences:[confidence]};this.lowEnergy=rms;return true;}
      const c=this.current, stable=median(c.samples.slice(-9));
      const reattack=t-c.onset>.20 && this.lowEnergy<rms*.42 && rms>this.previousEnergy*1.3;
      if(Math.abs(midi-stable)>.75||reattack){
        this.pending.push(frame);
        if(reattack||this.pending.length>=3){
          const next=[...this.pending];this.finish();
          this.current={onset:Math.max(0,next[0].time-.032),end:t,samples:next.map(f=>f.midi),confidences:next.map(f=>f.confidence)};
          this.lowEnergy=rms;this.previousEnergy=rms;return true;
        }
      }else{this.pending=[];c.samples.push(midi);c.confidences.push(confidence);c.end=t;this.lowEnergy=Math.min(rms,this.lowEnergy*1.1);}
      this.previousEnergy=rms;return false;
    }
    observations(){const result=[...this.events];if(this.current&&this.current.samples.length>=3){const c=this.current;result.push({onset:c.onset,end:c.end,midi:median(c.samples),confidence:median(c.confidences)});}return result;}
  }

  function align(notes,events,partial=false){
    const n=notes.length,m=events.length;
    const d=Array.from({length:n+1},()=>new Float64Array(m+1));
    const move=Array.from({length:n+1},()=>new Uint8Array(m+1));
    for(let i=1;i<=n;i++){d[i][0]=i;move[i][0]=2;}for(let j=1;j<=m;j++){d[0][j]=j;move[0][j]=3;}
    for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
      const pitchCost=Math.min(1.5,Math.max(0,Math.abs(notes[i-1].midi-events[j-1].midi)-.35));
      const candidates=[d[i-1][j-1]+pitchCost,d[i-1][j]+1,d[i][j-1]+1];
      const best=Math.min(...candidates);d[i][j]=best;move[i][j]=candidates.indexOf(best)+1;
    }
    let i=n,j=m;
    if(partial){i=0;for(let k=1;k<=n;k++)if(d[k][m]<d[i][m]-1e-8)i=k;}
    const path=[];
    while(i||j){const op=move[i][j];if(op===1){path.push({kind:'match',note:notes[--i],event:events[--j],index:i});}
      else if(op===2){path.push({kind:'missing',note:notes[--i],index:i});}
      else {path.push({kind:'extra',event:events[--j]});}}
    return path.reverse();
  }

  function assess(score,observations,{partial=false,uncertain=[],mode='expressive',targetBpm=80,voice=false,excerpt=false}={}){
    let events=observations.filter(e=>e.confidence>=.60);
    // A consistent small tuning offset can establish song identity. Grade the original pitches.
    const identityTolerance = voice ? 1.25 : .65;
    let octaveShift=0;
    if(voice && events.length){
      // Use one register for the phrase so individual octave jumps remain audible errors.
      let best=-1;
      for(const shift of [0,12,-12,24,-24]){
        const shifted=events.map(e=>({...e,midi:e.midi+shift}));
        const hits=align(score.notes,shifted,partial).filter(p=>p.kind==='match'&&Math.abs(p.note.midi-p.event.midi)<=identityTolerance).length;
        if(hits>best){best=hits;octaveShift=shift;}
      }
      if(octaveShift)events=events.map(e=>({...e,midi:e.midi+octaveShift}));
    }
    const path=align(score.notes,events,partial);
    const matches=path.filter(p=>p.kind==='match'),anchors=matches.filter(p=>Math.abs(p.note.midi-p.event.midi)<=identityTolerance);
    const colors={},findings=[],residuals=[],rates=[];let missing=0,extra=0;
    for(const p of matches){const cents=100*(p.event.midi-p.note.midi);colors[p.note.id]=Math.abs(cents)<=45?'correct':'pitch';
      if(Math.abs(cents)>45)findings.push({kind:'pitch',id:p.note.id,measure:p.note.measure,time:p.event.onset,approximate:false,
        message:`${pitchName(p.note.midi)}: about ${Math.round(Math.abs(cents))} cents ${cents>0?'sharp':'flat'}. Listen, find the target pitch, then play the entrance again.`});}
    for(let a=1;a<anchors.length;a++){const q=anchors[a].note.onset-anchors[a-1].note.onset,s=anchors[a].event.onset-anchors[a-1].event.onset;
      if(q>0&&q<=4&&s>0)rates.push(s/q);}
    const spb=median(rates),bpm=spb?60/spb:null;
    for(const p of path){
      if(p.kind==='extra'){extra++;const near=matches.reduce((best,x)=>!best||Math.abs(x.event.onset-p.event.onset)<Math.abs(best.event.onset-p.event.onset)?x:best,null);
        if(near)findings.push({kind:'extra',id:near.note.id,measure:near.note.measure,time:p.event.onset,message:'An extra attack was heard here. Replay the measure and isolate the written notes.'});continue;}
      const left=anchors.filter(a=>a.index<p.index).at(-1),right=anchors.find(a=>a.index>p.index);
      if(!left||!right)continue;
      const beats=right.note.onset-left.note.onset;if(beats<=0||beats>6)continue;
      let longRest=false;for(let i=left.index;i<right.index;i++)if(score.notes[i+1].onset-score.notes[i].onset-score.notes[i].duration>=1.5)longRest=true;
      if(longRest)continue;
      const rate=(right.event.onset-left.event.onset)/beats;
      const expected=left.event.onset+(p.note.onset-left.note.onset)*rate;
      const unknown=uncertain.some(t=>Math.abs(t-expected)<.25*rate);
      if(p.kind==='missing'){
        if(!unknown){missing++;colors[p.note.id]='missing';findings.push({kind:'missing',id:p.note.id,measure:p.note.measure,time:left.event.onset,approximate:true,
          message:`A ${pitchName(p.note.midi)} attack may be missing. Replay from the neighboring note and practice the entrance.`});}continue;
      }
      if(unknown||path.some(g=>g.kind==='missing'&&g.index>left.index&&g.index<right.index)||path.some(g=>g.kind==='extra'&&g.event.onset>left.event.onset&&g.event.onset<right.event.onset))continue;
      const before=(p.event.onset-left.event.onset)/(p.note.onset-left.note.onset);
      const after=(right.event.onset-p.event.onset)/(right.note.onset-p.note.onset);
      if(mode!=='guided'&&right.index===score.notes.length-1&&after>=before*1.5)continue;
      const residual=(p.event.onset-expected)/rate;residuals.push(residual);
      if(Math.abs(residual)>.25){if(colors[p.note.id]==='correct')colors[p.note.id]='rhythm';findings.push({kind:'rhythm',id:p.note.id,measure:p.note.measure,time:p.event.onset,
        message:`This entrance was ${Math.abs(residual).toFixed(2)} local beats ${residual>0?'late':'early'}. Tap the neighboring beats, then try the passage again.`});}
    }
    const fraction=score.notes.length?(matches.length+missing)/score.notes.length:0;
    const pitch=mean(matches.map(p=>credit((p.event.midi-p.note.midi)*100,45,125)));
    const coverage=matches.length?100*matches.length/(matches.length+missing+extra):null;
    const rhythm=mean(residuals.map(r=>credit(r,.15,.5)));
    const tempo=bpm?credit((bpm-targetBpm)/targetBpm,.05,.25):null;
    const sufficient=anchors.length>=Math.min(4,Math.ceil(score.notes.length*.6))&&anchors.length>=score.notes.length/2&&fraction>=.75;
    const components=mode==='guided'?[[pitch,.45],[coverage,.25],[rhythm,.20],[tempo,.10]]:[[pitch,.50],[coverage,.30],[rhythm,.20]];
    const available=components.filter(([v])=>v!==null);
    const weighted=available.length?available.reduce((s,[v,w])=>s+v*w,0)/available.reduce((s,[,w])=>s+w,0):null;
    const recognizable=partial?anchors.length>=Math.min(3,score.notes.length)&&anchors.length>=matches.length/2:sufficient;
    if(!recognizable)for(const id of Object.keys(colors))if(colors[id]!=='correct')delete colors[id];
    const grade=!partial&&sufficient?weighted:null;
    const provisionalGrade=recognizable?weighted:null;
    const current=matches.at(-1)?.note.id||score.notes[0]?.id;
    let passage=null;
    if(!partial && !excerpt && grade===null && events.length>=4 && events.length<score.notes.length){
      const prefix=align(score.notes,events,true);
      const end=prefix.filter(p=>p.kind==='match').at(-1)?.index;
      if(end>=3 && end+1<score.notes.length && prefix.filter(p=>p.kind==='match'&&Math.abs(p.note.midi-p.event.midi)<=identityTolerance).length>=4){
        const excerpt=assess({...score,notes:score.notes.slice(0,end+1)},events,{uncertain,mode,targetBpm,voice,excerpt:true});
        if(excerpt.grade!==null)passage={grade:excerpt.grade,first:score.notes[0].measure,last:score.notes[end].measure,notes:end+1};
      }
    }
    return {grade,provisionalGrade,passage,octaveShift,pitch,coverage,rhythm,tempo:mode==='guided'?tempo:null,bpm,fraction,colors,current,path,findings:recognizable?findings.slice(0,12):[],
      status:sufficient?'ok':'insufficient_evidence',uncertain:uncertain.length,matched:matches.length,
      model:'CREPE tiny + YIN periodicity check'};
  }

  function historySummary(records,scoreKey,instrument){
    const attempts=records.filter(r=>r.scoreKey===scoreKey&&r.instrument===instrument).sort((a,b)=>a.date-b.date);
    const graded=attempts.filter(a=>Number.isFinite(a.grade));
    return {attempts,graded,best:graded.length?Math.max(...graded.map(r=>r.grade)):null,
      minutes:attempts.reduce((s,a)=>s+(a.practiceSeconds??a.duration),0)/60,improvement:graded.length>1?graded.at(-1).grade-graded[0].grade:null};
  }
  return {profiles,parseScore,Segmenter,align,assess,historySummary,pitchName,frequency,median,credit};
});
