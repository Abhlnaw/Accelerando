const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DOMParser}=require('../../android/tools/node_modules/linkedom');
const C=require('../../android/app/src/main/assets/web/core.js');
const xml=(notes,transpose='')=>`<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions>${transpose}</attributes>${notes}</measure></part></score-partwise>`;
const note=(step='C',octave=5,extra='')=>`<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration>${extra}</note>`;
const parse=(source,options={})=>C.parseScore(source,{DOMParser,...options});
function score(){return {title:'Test',notes:[60,60,67,69,71,72,67,65,64,62,65,60].map((midi,i)=>({id:`n${i}`,measure:String(Math.floor(i/4)+1),onset:i,duration:1,midi}))};}
const take=(s,rate=.6)=>s.notes.map(n=>({onset:1+n.onset*rate,end:1+(n.onset+.8)*rate,midi:n.midi,confidence:.95}));
test('guitar written octave and explicit MusicXML transposition are applied exactly once',()=>{
 assert.equal(parse(xml(note())).notes[0].midi,60);
 assert.equal(parse(xml(note(),'<transpose><octave-change>-1</octave-change></transpose>')).notes[0].midi,60);
 assert.equal(parse(xml(note()),{transpose:'concert'}).notes[0].midi,72);
});
test('other instrument profiles and concert notation preserve sounding pitches',()=>{
 assert.equal(parse(xml(note()),{profile:'piano'}).notes[0].midi,72);
 assert.equal(parse(xml(note()),{profile:'clarinet'}).notes[0].midi,70);
 assert.equal(parse(xml(note()),{profile:'saxophone'}).notes[0].midi,63);
 assert.equal(C.profiles.auto.transpose,0);
});
test('rests and ties preserve offsets and a single attack',()=>{
 const source=xml(note('C',5,'<tie type="start"/>')+note('C',5,'<tie type="stop"/>')+'<note><rest/><duration>1</duration></note>'+note('D'));
 const s=parse(source);assert.equal(s.notes.length,2);assert.equal(s.notes[0].duration,2);assert.equal(s.notes[1].onset,3);
});
test('unsupported polyphony, repeats and malformed music fail clearly',()=>{
 assert.throws(()=>parse(xml(note('C',5,'<chord/>'))),/polyphonic/);
 assert.throws(()=>parse(xml(note()+'<barline><repeat direction="backward"/></barline>')),/Expand/);
 assert.throws(()=>parse('<html/>'),/MusicXML/);
 assert.throws(()=>parse('<!DOCTYPE x>'+xml(note())),/DOCTYPE/);
});
test('standard MusicXML external DOCTYPE is accepted without expanding custom entities',()=>{
 assert.equal(parse('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'+xml(note())).notes.length,1);
 assert.throws(()=>parse('<!DOCTYPE score-partwise [<!ENTITY x "text">]>'+xml(note())),/custom DOCTYPE/);
});
test('unrecognizable audio withholds personalized findings and unsupported notation is rejected at import',()=>{
 const s=score(),report=C.assess(s,take(s).map(e=>({...e,midi:e.midi+24})));assert.equal(report.grade,null);assert.equal(report.findings.length,0);
 assert.throws(()=>parse(xml(note().replace('<duration>1</duration>','<duration>0.3333</duration>'))),/unsupported/);
});
test('a multi-part MusicXML lets another instrument select its part',()=>{
 const source=xml(note()).replace('</score-partwise>','<part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes>'+note('G',4)+'</measure></part></score-partwise>');
 const s=parse(source,{profile:'violin',partIndex:1});assert.equal(s.parts.length,2);assert.equal(s.notes[0].midi,67);
});
test('clean and slow phrases retain comparable grades',()=>{
 const s=score(),a=C.assess(s,take(s)),b=C.assess(s,take(s,.95));
 assert.equal(a.grade,100);assert.equal(b.grade,100);assert.equal(a.coverage,100);assert.ok(a.bpm>b.bpm);
});
test('wrong note remains localized and later alignment recovers',()=>{
 const s=score(),events=take(s);events[3].midi+=1;
 const report=C.assess(s,events);const finding=report.findings.find(f=>f.kind==='pitch');
 assert.equal(finding.id,'n3');assert.equal(finding.time,events[3].onset);assert.equal(report.path.at(-1).note.id,'n11');assert.ok(report.grade<100);
});
test('omission and extra note do not shift the remaining phrase',()=>{
 const s=score(),events=take(s);events.splice(4,1);
 const missing=C.assess(s,events);assert.ok(missing.findings.some(f=>f.kind==='missing'));assert.equal(missing.path.at(-1).note.id,'n11');
 const added=take(s);added.splice(4,0,{onset:3.2,end:3.3,midi:80,confidence:.95});
 const extra=C.assess(s,added);assert.ok(extra.findings.some(f=>f.kind==='extra'));assert.equal(extra.path.at(-1).event.midi,60);
});
test('silence and short or unrelated fragments have no overall grade',()=>{
 const s=score();assert.equal(C.assess(s,[]).grade,null);assert.equal(C.assess(s,take(s).slice(0,3)).grade,null);
 assert.equal(C.assess(s,take(s).map(e=>({...e,midi:e.midi+24}))).grade,null);
});
test('low-confidence passages do not become confirmed missing notes',()=>{
 const s=score(),events=take(s),omitted=events.splice(4,1)[0];
 const r=C.assess(s,events,{uncertain:[omitted.onset]});assert.ok(!r.findings.some(f=>f.kind==='missing'));assert.ok(r.fraction<1);
});
test('partial live following does not mark the whole unplayed tail missing',()=>{
 const s=score(),r=C.assess(s,take(s).slice(0,4),{partial:true});assert.equal(r.grade,null);assert.equal(r.current,'n3');assert.equal(r.path.length,4);
});
test('tempo is descriptive in expressive practice and scored in guided mode',()=>{
 const s=score(),events=take(s,1);assert.equal(C.assess(s,events).grade,100);
 const strict=C.assess(s,events,{mode:'guided',targetBpm:120});assert.equal(strict.tempo,0);assert.ok(strict.grade<100);
});
test('progress is separated by song and instrument and ignores null grades for best score',()=>{
 const records=[{scoreKey:'a',instrument:'guitar',date:1,duration:60,grade:80},{scoreKey:'a',instrument:'guitar',date:2,duration:60,grade:null},{scoreKey:'a',instrument:'guitar',date:3,duration:60,grade:90},{scoreKey:'a',instrument:'piano',date:4,duration:60,grade:100}];
 const r=C.historySummary(records,'a','guitar');assert.equal(r.best,90);assert.equal(r.improvement,10);assert.equal(r.minutes,3);
});
test('frame grouping preserves repeated attacks, stable notes and pitch changes',()=>{
 const segmenter=new C.Segmenter();
 for(let i=0;i<20;i++)segmenter.push({time:i*.032,midi:69,confidence:.9,rms:.1});
 for(let i=20;i<25;i++)segmenter.push({time:i*.032,midi:0,confidence:0,rms:0});
 for(let i=25;i<45;i++)segmenter.push({time:i*.032,midi:69,confidence:.9,rms:.1});
 for(let i=45;i<65;i++)segmenter.push({time:i*.032,midi:71,confidence:.9,rms:.1});
 segmenter.finish();assert.equal(segmenter.events.length,3);assert.deepEqual(segmenter.events.map(e=>e.midi),[69,69,71]);
});

test('automatic score matching finds the lower chord line without correcting a played mistake',()=>{
 const lines=require('../../android/app/src/main/assets/web/score-lines.js');
 const source=xml(['C','D','E','F'].map(n=>note(n,4)+note('G',5,'<chord/>')).join('')+
   '<backup><duration>4</duration></backup>'+['F','E','D','C'].map(n=>note(n,3,'<voice>2</voice>')).join(''));
 const candidates=lines.read(source,{profile:'piano',DOMParser});
 assert.equal(candidates.length,3);
 const heard=[60,62,63,65].map((midi,i)=>({midi,onset:i,confidence:.9}));
 const match=lines.choose(candidates,heard);
 assert.equal(match.ambiguous,false);
 assert.deepEqual(match.line.score.notes.map(n=>n.midi),[60,62,64,65]);
 assert.deepEqual(match.line.score.notes.map(n=>n.onset),[0,1,2,3]);
 assert.equal(lines.choose(candidates,[]).ambiguous,true);
});
test('quiet reliable notes reach the mobile grader',()=>{
 const segmenter=new C.Segmenter();
 for(let i=0;i<16;i++)segmenter.push({time:i*.032,midi:50,confidence:.85,rms:.0004});
 segmenter.finish();assert.equal(segmenter.events.length,1);
});

test('voice can sing a consistent lower octave and instrument mode keeps concert pitch',()=>{
 const s=score(),low=take(s).map(e=>({...e,midi:e.midi-12,confidence:.62}));
 const result=C.assess(s,low,{voice:true});
 assert.equal(result.grade,100);assert.equal(result.octaveShift,12);
 assert.equal(C.assess(s,low).grade,null);
});
test('an identifiable prefix earns a separate excerpt score',()=>{
 const s=score(),result=C.assess(s,take(s).slice(0,5));
 assert.equal(result.grade,null);assert.equal(result.passage.grade,100);
 assert.equal(result.passage.notes,5);
 assert.equal(C.assess(s,[]).passage,null);
});
test('one wrong note in a recognizable four-note measure still gets a score',()=>{
 const s={notes:score().notes.slice(0,4)},events=take(s);
 events[2].midi++;
 const result=C.assess(s,events);
 assert.ok(result.grade>0&&result.grade<100);
});
test('live run uses the same weighted assessment while withholding a premature final grade',()=>{
 const s=score(),events=take(s);
 assert.equal(C.assess(s,events.slice(0,1),{partial:true}).provisionalGrade,null);
 events[4].midi+=1;
 const live=C.assess(s,events,{partial:true}),final=C.assess(s,events);
 assert.equal(live.grade,null);
 assert.equal(live.provisionalGrade,final.grade);
 assert.ok(final.grade<100 && final.grade>0);
 assert.ok(live.findings.some(f=>f.kind==='pitch'));
});

test('recognizable lower voice singing 85 cents flat receives pitch feedback',()=>{
 const melody=score(),events=take(melody).map(event=>({...event,midi:event.midi-12.85}));
 const report=C.assess(melody,events,{voice:true});
 assert.ok(report.grade>0 && report.grade<100);
 assert.ok(report.findings.some(f=>f.kind==='pitch'));
});
