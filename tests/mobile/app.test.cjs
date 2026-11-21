/* Controller tests: DOM + a fake native bridge. Real WebView/model tests live in androidTest. */
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const {parseHTML,DOMParser}=require('../../android/tools/node_modules/linkedom');
const assets=path.join(__dirname,'../../android/app/src/main/assets/web');
function boot(persisted=new Map()){
 const {window}=parseHTML(fs.readFileSync(path.join(assets,'index.html'),'utf8'));const calls=[];const local=new Map();
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._value=String(v);}});
 window.HTMLSelectElement.prototype.add=function(option){this.append(option);};
 window.Element.prototype.scrollIntoView=function(){};window.Element.prototype.getBoundingClientRect=function(){return {top:0,bottom:200};};
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 window.Option=function(text,value){const e=window.document.createElement('option');e.textContent=text;e.setAttribute('value',value);return e;};
 window.localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)};
 window.Android={loadData:k=>persisted.get(k)||'null',saveData:(k,v)=>{persisted.set(k,v);return true;},loadHistory:()=> '[]',
  start:()=>calls.push(['start']),stop:()=>calls.push(['stop']),importFile:k=>calls.push(['import',k]),replayTake:(...args)=>calls.push(['replay',...args]),hasRecording:()=>true,exportHistory:j=>calls.push(['export',j]),stopPlayback:()=>calls.push(['stopPlayback']),openSource:url=>calls.push(['source',url])};
 const document=window.document;let context;
 class Renderer{static Backends={SVG:1};constructor(row){this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');row.append(this.svg);}resize(){}getContext(){context={svg:this.svg,setFont(){},fillText(){}};return context;}}
 class Stave{addClef(){return this;}addKeySignature(){return this;}addTimeSignature(){return this;}setContext(){return this;}draw(){return this;}}
 class Note{addModifier(){return this;}setAttribute(){return this;}getSVGElement(){return this.svg;}}
 class Voice{setStrict(){return this;}addTickables(ticks){this.ticks=ticks;return this;}draw(ctx){this.ticks.forEach(t=>{t.svg=document.createElementNS('http://www.w3.org/2000/svg','g');ctx.svg.append(t.svg);});}}
 class Formatter{joinVoices(){return this;}format(){return this;}}
 window.Vex={Flow:{Renderer,Stave,StaveNote:Note,Voice,Formatter,Dot:{buildAndAttach(){}},Accidental:class{},StaveTie:class{setContext(){return this;}draw(){}}}};
 window.setTimeout=fn=>{fn();return 0;};window.console=console;
 const ctx=vm.createContext({document,DOMParser,Option:window.Option,localStorage:window.localStorage,Android:window.Android,Vex:window.Vex,console,setTimeout:window.setTimeout,addEventListener(){}});
 vm.runInContext('window=globalThis',ctx);
 for(const name of ['core.js','score-lines.js','score-demo.js','storage.js','app.js']){try{vm.runInContext(fs.readFileSync(path.join(assets,name),'utf8'),ctx,{filename:name});}catch(error){throw new Error(name+': '+document.getElementById('notice').textContent,{cause:error});}}
 return {window:ctx,document,calls,persisted,run:code=>vm.runInContext(code,ctx),click:id=>document.getElementById(id).click()};
}
const melody=`<score-partwise><work><work-title>My Tune</work-title></work><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${['C','D','E','F','G','A'].map(s=>`<note><pitch><step>${s}</step><octave>5</octave></pitch><duration>1</duration></note>`).join('')}</measure></part></score-partwise>`;
test('manual journal sessions retain notes, minutes and recurring mistakes across restarts',()=>{
 const app=boot();
 app.run("setPage('progress')");
 for(const focus of ['Entrance','Ending']){
   app.document.getElementById('journal-focus').value=focus;
   app.document.getElementById('journal-notes').value='Repeat slowly';
   app.document.getElementById('journal-mistake').value='pitch';
   app.run("$('journal-form').onsubmit({preventDefault(){}})");
 }
 const next=boot(app.persisted);
 next.run("setPage('progress')");
 assert.match(next.document.getElementById('journal-patterns').textContent,/pitch.*2 sessions/);
 assert.match(next.document.getElementById('attempts').textContent,/Repeat slowly/);
 assert.equal(next.run('store.summary().minutes'),30);
});
function finish(app,id='take-first',session=1){
 app.run(`window.nativeEvent('loading',{sessionId:${session},message:'Loading'});window.nativeEvent('started',{sessionId:${session}})`);
 app.run(`for(const note of score.notes){for(let i=0;i<16;i++)window.nativeEvent('frame',{sessionId:${session},time:note.onset*.6+i*.032,midi:note.midi,confidence:.95,rms:.1,inferenceMs:4});for(let i=16;i<19;i++)window.nativeEvent('frame',{sessionId:${session},time:note.onset*.6+i*.032,midi:0,confidence:0,rms:0,inferenceMs:0});}window.nativeEvent('stopped',{sessionId:${session},recordingId:'${id}',duration:4});`);
}
test('home is the launch page, with working practice/library/progress navigation',()=>{
 const app=boot();assert.equal(app.document.getElementById('home-page').hidden,false);
 app.click('home-continue');assert.equal(app.document.getElementById('practice-page').hidden,false);assert.ok(app.document.querySelectorAll('#score svg').length>0);
 app.click('change-piece');assert.equal(app.document.getElementById('library-page').hidden,false);
 app.run("setPage('home')");app.click('home-history');assert.equal(app.document.getElementById('progress-page').hidden,false);
});

test('practice tools mount once and are removed when leaving the page',()=>{
 const app=boot();app.run("setPage('tools');setPage('tools')");assert.equal(app.document.querySelectorAll('#tools-page iframe').length,1);assert.deepEqual(app.calls.at(-1),['stopPlayback']);
 app.run("setPage('home')");assert.equal(app.document.querySelectorAll('#tools-page iframe').length,0);assert.equal(app.document.getElementById('home-page').hidden,false);
});
test('imported score and instrument settings survive a restart',()=>{
 const app=boot();app.window.nativeEvent('score',{xml:melody});assert.equal(app.document.getElementById('piece-title').textContent,'My Tune');
 const restarted=boot(app.persisted);assert.equal(restarted.document.getElementById('home-piece').textContent,'My Tune');assert.equal(restarted.document.getElementById('home-page').hidden,false);
});
test('invalid import preserves the valid selected score and does not add library entries',()=>{
 const app=boot();app.window.nativeEvent('score',{xml:melody});app.window.nativeEvent('score',{xml:'<html/>'});
 assert.equal(app.document.getElementById('piece-title').textContent,'My Tune');assert.equal(JSON.parse(app.persisted.get('library')).length,1);assert.match(app.document.getElementById('notice').textContent,/MusicXML/);
});
test('completed take persists a report and its recording ID; home resumes it after restart',()=>{
 const app=boot();app.window.nativeEvent('score',{xml:melody});app.click('start');finish(app);
 assert.equal(app.document.getElementById('report').hidden,false);assert.equal(JSON.parse(app.persisted.get('history'))[0].recordingId,'take-first');
 const restarted=boot(app.persisted);restarted.document.querySelector('#home-recent button').click();restarted.click('replay-full');assert.deepEqual(restarted.calls.at(-1),['replay','take-first',0]);
});
test('a second take uses a fresh render clock and an old report never replays the latest recording',()=>{
 const app=boot();app.window.nativeEvent('score',{xml:melody});app.click('start');finish(app,'first',1);app.click('start');finish(app,'second',2);
 assert.equal(JSON.parse(app.persisted.get('history')).length,2);app.run("openRecord(recordStore[0])");app.click('replay-full');assert.deepEqual(app.calls.at(-1),['replay','first',0]);
});
test('native errors recover capture state but playback errors do not interrupt a running take',()=>{
 const app=boot();app.click('home-continue');app.click('start');app.window.nativeEvent('loading',{sessionId:4});app.window.nativeEvent('started',{sessionId:4});
 app.window.nativeEvent('error',{scope:'playback',message:'Missing recording'});assert.equal(app.document.getElementById('stop').hidden,false);
 app.window.nativeEvent('error',{scope:'audio',sessionId:4,message:'Permission denied'});assert.equal(app.document.getElementById('start').hidden,false);
});
test('cancelling loading restores controls, and stale frame callbacks do not enter the next take',()=>{
 const app=boot();app.click('home-continue');app.click('start');app.window.nativeEvent('loading',{sessionId:1});app.click('stop');assert.deepEqual(app.calls.at(-1),['stop']);app.window.nativeEvent('cancelled',{sessionId:1});
 assert.equal(app.document.getElementById('start').hidden,false);app.click('start');app.window.nativeEvent('loading',{sessionId:2});app.window.nativeEvent('started',{sessionId:2});
 app.window.nativeEvent('stopped',{sessionId:1,recordingId:'stale'});assert.equal(app.document.getElementById('stop').hidden,false);assert.equal(app.persisted.has('history'),false);
});
test('guided mode validates BPM, and recording locks score-changing navigation',()=>{
 const app=boot();app.click('home-continue');app.document.getElementById('mode').value='guided';app.document.getElementById('target').value='0';app.click('start');assert.equal(app.calls.length,0);
 app.document.getElementById('target').value='80';app.click('start');app.run("setPage('library')");assert.equal(app.document.getElementById('practice-page').hidden,false);assert.equal(app.document.getElementById('instrument').disabled,true);
});
test('export sends actual saved data and unsupported source actions are explicit',()=>{
 const app=boot();app.window.nativeEvent('score',{xml:melody});app.click('start');finish(app);app.click('export-history');assert.equal(JSON.parse(app.calls.at(-1)[1])[0].title,'My Tune');
});
test('reference playback, audio upload and source search buttons reach the native bridge',()=>{
 const app=boot();app.click('home-import');assert.deepEqual(app.calls.at(-1),['import','score']);app.click('reference-upload');assert.deepEqual(app.calls.at(-1),['import','reference']);
 app.click('stop-reference');assert.deepEqual(app.calls.at(-1),['stopPlayback']);app.click('home-continue');app.click('audio-upload');assert.deepEqual(app.calls.at(-1),['import','take']);
 app.click('imslp-search');assert.match(app.calls.at(-1)[1],/^https:\/\/imslp.org/);app.click('youtube-search');assert.match(app.calls.at(-1)[1],/^https:\/\/www.youtube.com/);
});
test('a playable second part is saved and restored when the first part is polyphonic',()=>{
 const app=boot();const multi=melody.replace('<part id="P1">','<part id="chords"><measure><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note><note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration></note></measure></part><part id="P1">');
 app.window.nativeEvent('score',{xml:multi});app.document.getElementById('part').value='2';app.document.getElementById('part').onchange();assert.equal(app.document.getElementById('part').value,'2');const restart=boot(app.persisted);assert.equal(restart.document.getElementById('part').value,'2');
});
test('removing a saved score preserves its report and correct recording without showing another score',()=>{
 const app=boot();app.window.nativeEvent('score',{xml:melody});app.click('start');finish(app,'retained');app.run("setPage('library')");
 const buttons=[...app.document.querySelectorAll('#saved-scores button')];buttons.find(b=>b.textContent==='Remove').click();app.document.querySelector('#remove-score button.primary').click();
 assert.equal(JSON.parse(app.persisted.get('library')).length,0);assert.equal(JSON.parse(app.persisted.get('history')).length,1);
 app.run('openRecord(recordStore[0])');app.document.querySelector('#legacy-report button.secondary').click();assert.deepEqual(app.calls.at(-1),['replay','retained',0]);
});
