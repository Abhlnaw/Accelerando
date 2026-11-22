const test=require('node:test');
const assert=require('node:assert/strict');
const demo=require('../../android/app/src/main/assets/web/score-demo.js');
test('repeated notes follow tempo through silence without duplicate credit, and voices can sing lower',()=>{
  const score={duration:4,notes:[60,60,67,67].map((midi,i)=>({id:String(i),midi,onset:i,duration:1}))};
  const clock=demo.schedule(score), state={}, heard=[{midi:48,onset:1}];
  demo.follow(state,clock,score.notes,heard,1,true);
  demo.follow(state,clock,score.notes,heard,2,true);
  assert.equal(state.index,1);
  assert.deepEqual(state.colors,{'0':'correct'});
  heard.push({midi:55,onset:2.5});
  demo.follow(state,clock,score.notes,heard,2.5,true);
  assert.equal(state.index,2);
  assert.equal(state.colors['2'],'correct');
});
