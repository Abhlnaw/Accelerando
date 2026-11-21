"""Local, score-derived audio preview shared with the tablet practice studio."""
from base64 import b64encode
from functools import cache
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


@cache
def player_scripts():
    assets = Path(__file__).resolve().parents[1] / "android/app/src/main/assets/web"
    return "\n".join((assets / name).read_text(encoding="utf-8")
                     for name in ("core.js", "score-lines.js", "score-demo.js"))


def show_demo(score_bytes):
    with st.expander("Hear the written score"):
        if len(score_bytes) > 5 * 1024 * 1024:
            st.caption("Choose a MusicXML file under 5 MiB.")
            return
        encoded = b64encode(score_bytes).decode("ascii")
        components.html("""
<style>body{font:15px system-ui;color:#263a41}label,button{margin:4px}select,button{padding:7px}</style>
<label>Written line <select id="line"></select></label>
<label>Passage <select id="bar"></select></label>
<button id="listen" type="button" disabled>Play score</button><p id="status" role="status"></p>
<script>""" + player_scripts() + "\n" + """
const line=document.querySelector('#line'), bar=document.querySelector('#bar');
const listen=document.querySelector('#listen'), statusText=document.querySelector('#status');
try {
  const bytes=Uint8Array.from(atob('""" + encoded + """'), char=>char.charCodeAt(0));
  const xml=new TextDecoder(bytes[0]===255?'utf-16le':bytes[0]===254?'utf-16be':'utf-8').decode(bytes);
  const lines=ScoreLines.read(xml,{profile:'auto',playbackOnly:true});
  lines.forEach((item,i)=>line.add(new Option(item.label,i)));
  function selectLine(){
    ScoreDemo.stop();
    const score=lines[line.selectedIndex].score;
    bar.replaceChildren(new Option('Whole piece',''));
    score.measures.forEach((m,i)=>bar.add(new Option('Measure '+m.label,i)));
    statusText.textContent=score.tempos.length?'Uses the written tempo markings.':'Practice tempo: 80 quarter notes per minute.';
  }
  line.onchange=selectLine;
  bar.onchange=()=>ScoreDemo.stop();
  selectLine();
  listen.disabled=false;
  listen.onclick=async()=>{
    if(listen.dataset.playing==='yes'){ScoreDemo.stop();return;}
    const score=lines[line.selectedIndex].score, index=bar.selectedIndex-1;
    const passage=index<0?null:{onset:score.measures[index].onset,end:score.measures[index+1]?.onset??score.duration};
    const reset=()=>{listen.dataset.playing='no';listen.textContent='Play score';};
    listen.dataset.playing='yes';listen.textContent='Stop';
    try{await ScoreDemo.play(score,passage,reset);}
    catch(error){reset();statusText.textContent=error.message;}
  };
  window.addEventListener('pagehide',ScoreDemo.stop);
} catch(error){statusText.textContent=error.message;}
</script>""", height=116, scrolling=True)
