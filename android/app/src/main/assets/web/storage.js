/* Versioned app data; corrupt entries are isolated rather than breaking launch. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PracticeStore=api;})(globalThis,function(){
  'use strict';
  const parse=(value,fallback)=>{try{return JSON.parse(value)||fallback;}catch(_){return fallback;}};
  const id=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  function create(native,local){
    const read=(name,fallback)=>{try{return parse(native?.loadData?native.loadData(name):local.getItem('accelerando-'+name),fallback);}catch(_){return fallback;}};
    const write=(name,value)=>{
      const json=JSON.stringify(value);
      if(json.length>4_000_000)throw Error('This saved collection is full. Remove an imported score from Music library or choose a shorter excerpt.');
      if(native?.saveData){if(!native.saveData(name,json))throw Error('Could not save on this device. Check available storage.');}
      else local.setItem('accelerando-'+name,json);
    };
    let records=read('history',null);
    if(!Array.isArray(records)){try{records=parse(native?.loadHistory?native.loadHistory():local.getItem('accelerando-history'),[]);}catch(_){records=[];}}
    records=Array.isArray(records)?records.filter(r=>r&&typeof r.title==='string'&&Number.isFinite(r.date)&&Number.isFinite(r.duration)).slice(-500).map(r=>{
      const clean={...r,duration:Math.max(0,r.duration),grade:Number.isFinite(r.grade)?r.grade:null,
        fraction:Number.isFinite(r.fraction)?Math.max(0,Math.min(1,r.fraction)):0,
        findings:Array.isArray(r.findings)?r.findings.filter(f=>f&&typeof f.message==='string'):[]};
      if(r.result&&typeof r.result==='object')clean.result={...r.result,grade:clean.grade,fraction:clean.fraction,findings:clean.findings,colors:r.result.colors&&typeof r.result.colors==='object'?r.result.colors:{}};
      return clean;
    }):[];
    let library=read('library',[]);library=Array.isArray(library)?library.filter(p=>p&&typeof p.id==='string'&&typeof p.xml==='string'&&typeof p.title==='string'):[];
    let settings=read('settings',{});if(!settings||typeof settings!=='object'||Array.isArray(settings))settings={};
    return {
      records:()=>[...records],library:()=>[...library],settings:()=>({...settings}),
      saveSettings(next){write('settings',next);settings={...next};},
      removePiece(id){const next=library.filter(p=>p.id!==id);write('library',next);library=next;},
      addPiece(xml,title,partIndex=0){
        const existing=library.find(p=>p.xml===xml);if(existing)return existing;
        const piece={id:'score-'+id(),title,xml,partIndex,date:Date.now()};const next=[...library,piece];
        write('library',next);library=next;return piece;
      },
      addRecord(record){const next=[...records,{...record,id:record.id||id()}].slice(-500);write('history',next);records=next;return next.at(-1);},
      summary(){return {attempts:records.length,minutes:records.reduce((s,r)=>s+Math.max(0,r.duration),0)/60,
        pieces:new Set(records.map(r=>r.pieceId||r.title)).size,last:records.at(-1)||null};}
    };
  }
  return {create};
});
