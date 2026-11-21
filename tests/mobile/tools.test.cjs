const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fundamental}=require('../../android/app/src/main/assets/web/tools/pitch.js');

test('tuner tracks bass, harmonic guitar and high violin at common device rates',()=>{
  for(const rate of [44100,48000,96000]){
    for(const hz of [30.87,82.41,196,440,1318.5]){
      const size=rate>60000?8192:4096;
      const samples=Float32Array.from({length:size},(_,i)=>{
        const phase=2*Math.PI*hz*i/rate;
        return .1*Math.sin(phase)+.15*Math.sin(2*phase)+.04*Math.sin(3*phase);
      });
      const detected=fundamental(samples,rate);
      assert.ok(Math.abs(1200*Math.log2(detected/hz))<12,rate+' Hz input: '+hz+' -> '+detected);
    }
  }
});
test('silence and aperiodic input have no tuner reading',()=>{
  const samples=new Float32Array(4096);
  assert.equal(fundamental(samples,48000),null);
  let seed=27;
  for(let i=0;i<samples.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    samples[i]=seed/2**32-.5;
  }
  assert.equal(fundamental(samples,48000),null);
});
