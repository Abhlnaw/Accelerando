const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DOMParser}=require('../../android/tools/node_modules/linkedom');
const lines=require('../../android/app/src/main/assets/web/score-lines.js');
const demo=require('../../android/app/src/main/assets/web/score-demo.js');
const source=fs.readFileSync(require.resolve('../../fixtures/piece_a/score.musicxml'),'utf8');
const read=xml=>lines.read(xml,{DOMParser,profile:'auto',playbackOnly:true})[0].score;

test('written demonstration follows concert pitch, repeated attacks, rests and marked tempo',()=>{
  const plan=demo.schedule(read(source));
  assert.equal(plan.notes.length,14);
  assert.equal(plan.notes[3].hz,440);
  assert.equal(plan.notes[1].on,60/72);
  assert.equal(plan.notes[2].on,3*60/72);
  assert.equal(plan.duration,16*60/72);
});

test('a selected measure sustains the incoming tied pitch and observes a new tempo',()=>{
  const xml=source.replace('<measure number="4">','<measure number="4"><sound tempo="120"/>');
  const score=read(xml);
  const plan=demo.schedule(score,{onset:score.measures[3].onset,end:score.duration});
  assert.equal(plan.notes[0].on,0);
  assert.equal(plan.notes[0].off,0.5);
  assert.equal(plan.notes[0].hz,440*2**((67-69)/12));
  assert.equal(plan.duration,2);
});
