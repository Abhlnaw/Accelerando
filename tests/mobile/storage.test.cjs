const {test}=require('node:test');const assert=require('node:assert/strict');
const {create}=require('../../android/app/src/main/assets/web/storage.js');
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('library, settings and practice reports survive repository reconstruction',()=>{
 const local=memory(),store=create(null,local);const piece=store.addPiece('<score/>','My melody');store.saveSettings({pieceId:piece.id,instrument:'violin'});
 store.addRecord({title:'My melody',date:1,duration:60,pieceId:piece.id,grade:88});
 const restarted=create(null,local);assert.equal(restarted.library()[0].xml,'<score/>');assert.equal(restarted.settings().instrument,'violin');assert.equal(restarted.summary().minutes,1);assert.equal(restarted.records()[0].grade,88);
});
test('corrupt records and settings cannot break app launch',()=>{
 const local=memory();local.setItem('accelerando-history','[null,{}, {"title":"OK","date":1,"duration":2}]');local.setItem('accelerando-library','oops');local.setItem('accelerando-settings','[]');
 const store=create(null,local);assert.equal(store.records().length,1);assert.deepEqual(store.library(),[]);assert.deepEqual(store.settings(),{});
});
test('failed native persistence is reported and does not mutate local state',()=>{
 const store=create({loadData:()=>null,loadHistory:()=> '[]',saveData:()=>false},memory());
 assert.throws(()=>store.addPiece('<score/>','Unstored'),/Could not save/);assert.equal(store.library().length,0);
});
test('duplicate imports reuse the saved score and reports retain distinct recording IDs',()=>{
 const store=create(null,memory());assert.equal(store.addPiece('x','X').id,store.addPiece('x','X').id);
 store.addRecord({title:'X',date:1,duration:1,recordingId:'first'});store.addRecord({title:'X',date:2,duration:1,recordingId:'second'});
 assert.deepEqual(store.records().map(r=>r.recordingId),['first','second']);
});
test('partially corrupted history values cannot crash score cards or findings',()=>{
 const local=memory();local.setItem('accelerando-history',JSON.stringify([{title:'Old take',date:1,duration:2,grade:'bad',fraction:10,findings:[null,{}],result:{colors:null,findings:null}}]));
 const record=create(null,local).records()[0];assert.equal(record.grade,null);assert.equal(record.fraction,1);assert.deepEqual(record.result.findings,[]);assert.deepEqual(record.result.colors,{});
});
