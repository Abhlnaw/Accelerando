/* Project a polyphonic score into fixed written lines before matching the take. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.ScoreLines = factory(root.Coach);
})(globalThis, function(Coach) {
  'use strict';
  const children = (node, tag) => Array.from(node.children).filter(n => n.localName === tag);
  const serialize = node => typeof XMLSerializer === 'undefined' ? node.toString() : new XMLSerializer().serializeToString(node);
  const escape = value => String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

  function read(xml, options = {}) {
    // Standard notation editors include a public MusicXML DTD. Parsing is local.
    xml=xml?.replace(/<!DOCTYPE\s+score-partwise\s+(?:PUBLIC\s+"[^"<>]*"\s+|SYSTEM\s+)"[^"<>]*"\s*>/i,'');
    if (!xml || xml.length > 5*1024*1024 || /<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error('Choose an uncompressed MusicXML score without custom entities.');
    const Parser = options.DOMParser || globalThis.DOMParser;
    const doc = new Parser().parseFromString(xml,'text/xml');
    if (doc.documentElement.localName !== 'score-partwise' || doc.querySelector('parsererror'))
      throw Error('Choose a readable partwise MusicXML score.');
    if (doc.querySelector('repeat, ending, grace, ornaments')) throw Error('Expand repeats, grace notes and ornaments before import.');
    const parts = children(doc.documentElement, 'part');
    const lines = [];
    for (const [index, part] of parts.entries()) {
      if (options.partIndex != null && index !== options.partIndex) continue;
      if (!part.querySelector('pitch')) continue;
      const name = Array.from(doc.querySelectorAll('score-part')).find(n => n.getAttribute('id') === part.getAttribute('id'))?.querySelector('part-name')?.textContent || 'Part '+(index+1);
      const lanes = new Map();
      let divisions = 1;
      const bars = children(part, 'measure').map((measure, mi) => {
        let cursor = 0, end = 0, last = null, passNumber = 1;
        const attributes = [], groups = new Map();
        for (const node of measure.children) {
          if (node.localName === 'attributes') {
            divisions = Number(node.querySelector('divisions')?.textContent || divisions);
            if (!(divisions > 0)) throw Error('Use positive score divisions.');
            const copy = node.cloneNode(true);
            copy.querySelector('divisions')?.remove();
            if (cursor !== 0 && copy.children.length) throw Error('Split mid-measure key, clef or transposition changes before import.');
            attributes.push(serialize(copy)); continue;
          }
          if (!['note','forward','backup'].includes(node.localName)) continue;
          const duration = Math.round(Number(node.querySelector('duration')?.textContent) * 10080 / divisions);
          if (!Number.isFinite(duration) || duration <= 0) throw Error('Each score event needs a positive duration.');
          if (node.localName === 'backup') {
            cursor -= duration; last = null; passNumber++;
            if (cursor < 0) throw Error('A backup crosses the beginning of a measure.');
            continue;
          }
          const chord = node.querySelector('chord');
          if (chord && last === null) throw Error('A chord tone needs a preceding attack.');
          const onset = chord ? last : cursor;
          if (!chord) { last = node.localName === 'note' ? cursor : null; cursor += duration; }
          end = Math.max(end, onset+duration);
          const p = node.querySelector('pitch');
          if (!p) continue;
          const lane = 'staff '+(node.querySelector('staff')?.textContent || '1')+' · voice '+(node.querySelector('voice')?.textContent || passNumber);
          if (!groups.has(lane)) groups.set(lane,new Map());
          const events = groups.get(lane);
          if (!events.has(onset)) events.set(onset,[]);
          const pitches = events.get(onset);
          const height = Number(p.querySelector('octave').textContent)*12 + ({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[p.querySelector('step').textContent] + Number(p.querySelector('alter')?.textContent || 0);
          const copy = node.cloneNode(true);
          copy.querySelector('chord')?.remove();
          copy.querySelector('duration').textContent = String(duration);
          pitches.push({height,duration,xml:serialize(copy)});
          lanes.set(lane,Math.max(lanes.get(lane)||0,pitches.length));
        }
        return {groups,end,attributes:attributes.join(''),label:measure.getAttribute('number')||String(mi+1), printed:measure.getAttribute('text')};
      });
      for (const [lane,depth] of lanes) {
        for (let rank=0; rank<depth; rank++) {
          if (lines.length >= 80) throw Error('Choose a shorter score excerpt for line matching.');
          const measures = bars.map(bar => {
            let cursor=0, body=bar.attributes+'<attributes><divisions>10080</divisions></attributes>';
            const events=Array.from(bar.groups.get(lane)||[]).sort((a,b)=>a[0]-b[0]);
            const rest=length=>{
              let rests='';
              for(const beats of [4,3,2,1.5,1,.75,.5,.375,.25,.125]) {
                const ticks=Math.round(beats*10080);
                while(length>=ticks) {
                  rests+='<forward><duration>'+ticks+'</duration></forward>';
                  length-=ticks;
                  if(rests.length>16000) throw Error('Choose a shorter measure for notation display.');
                }
              }
              return rests+(length?'<forward><duration>'+length+'</duration></forward>':'');
            };
            for (const [time,pitches] of events) {
              const selected=pitches.sort((a,b)=>b.height-a.height)[Math.min(rank,pitches.length-1)];
              if (time>cursor) body+=rest(time-cursor);
              if (time<cursor) throw Error('Overlapping attacks in one voice need separate MusicXML voices.');
              body+=selected.xml; cursor=time+selected.duration;
            }
            if (cursor<bar.end) body+=rest(bar.end-cursor);
            return '<measure number="'+escape(bar.label)+'"'+(bar.printed?' text="'+escape(bar.printed)+'"':'')+'>'+body+'</measure>';
          }).join('');
          const title = doc.querySelector('work-title, movement-title')?.textContent || 'Uploaded piece';
          const projected='<score-partwise><work><work-title>'+escape(title)+'</work-title></work><part id="P1">'+measures+'</part></score-partwise>';
          const score=Coach.parseScore(projected,{...options,partIndex:0,projectedChordLine:depth>1});
          lines.push({score,label:name+' · '+lane+(depth>1?' · chord tone '+(rank+1)+' from top':'')});
        }
      }
    }
    if (!lines.length) throw Error('The score contains no pitched notes.');
    const unique=new Map();
    for(const line of lines) {
      const key=JSON.stringify(line.score.notes.map(n=>[n.measure,n.onset,n.duration,n.midi]));
      if(unique.has(key)) unique.get(key).label+=' / '+line.label;
      else unique.set(key,line);
    }
    return Array.from(unique.values());
  }

  function choose(lines, events, passage) {
    const heard=events.filter(e=>e.confidence>=.65);
    const ranked=lines.map(line=>{
      const notes=line.score.notes.filter(n=>!passage || (n.onset>=passage.onset && n.onset<passage.end));
      const row=new Uint16Array(heard.length+1);
      for(const note of notes) {
        let previous=0;
        for(let j=1;j<=heard.length;j++) {
          const old=row[j];
          row[j]=Math.max(row[j-1],old,previous+Number(Math.abs(heard[j-1].midi-note.midi)<=.65));
          previous=old;
        }
      }
      return {line,fit:2*row[heard.length]/Math.max(1,notes.length+heard.length)};
    }).sort((a,b)=>b.fit-a.fit);
    return {line:ranked[0].line,ambiguous:ranked.length>1 && ranked[0].fit-ranked[1].fit<.05};
  }
  return {read,choose};
});
