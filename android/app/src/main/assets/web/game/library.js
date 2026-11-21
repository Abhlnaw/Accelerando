'use strict';
const GameLibrary=(()=>{
  let connection;
  function db(){
    if(!connection) connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open('accelerando-game',1);
      request.onupgradeneeded=()=>{
        request.result.createObjectStore('pieces',{keyPath:'id'});
        request.result.createObjectStore('runs',{autoIncrement:true}).createIndex('line','line');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return connection;
  }
  async function access(store,mode,operation){
    const tx=(await db()).transaction(store,mode);
    const req=operation(tx.objectStore(store));
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve(req.result);
      tx.onabort=()=>reject(tx.error);
      tx.onerror=()=>reject(tx.error);
    });
  }
  async function save(xml,title){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));
    const id=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
    await access('pieces','readwrite',s=>s.put({id,xml,title}));
    return id;
  }
  return {save,pieces:()=>access('pieces','readonly',s=>s.getAll()),
    record:run=>access('runs','readwrite',s=>s.add(run)),
    history:line=>access('runs','readonly',s=>s.index('line').getAll(line))};
})();
