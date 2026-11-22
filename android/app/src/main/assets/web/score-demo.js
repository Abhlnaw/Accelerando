/* Schedule on the audio clock so rendering and UI updates cannot move attacks. */
const ScoreDemo = (() => {
  let current = null;
  function schedule(score, passage) {
    const start = passage?.onset ?? 0;
    const end = passage?.end ?? score.duration;
    const tempos = [...(score.tempos || [])].sort((a,b) => a.beat-b.beat);
    function seconds(beat) {
      let elapsed = 0, previous = 0, bpm = 80;
      for (const change of tempos) {
        if (change.beat > beat) break;
        elapsed += (change.beat-previous)*60/bpm;
        previous = change.beat;
        bpm = change.bpm;
      }
      return elapsed + (beat-previous)*60/bpm;
    }
    const origin = seconds(start);
    const notes = [];
    for (const note of score.notes) {
      const on = Math.max(start, note.onset);
      const off = Math.min(end, note.onset + note.duration);
      if (on < off) notes.push({hz:440*2**((note.midi-69)/12), on:seconds(on)-origin, off:seconds(off)-origin});
    }
    return {notes, duration:seconds(end)-origin};
  }
  function stop() {
    if (!current) return;
    const {context, done, timer} = current;
    current = null;
    clearTimeout(timer);
    context.close().catch(()=>{});
    done();
  }
  async function play(score, passage, done) {
    stop();
    const plan = schedule(score, passage);
    const context = new AudioContext();
    current = {context, done};
    try {
      await context.resume();
      if (current?.context !== context) return;
      const zero = context.currentTime + 0.05;
      for (const {hz,on,off} of plan.notes) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const edge = Math.min(0.009,(off-on)/3);
        oscillator.frequency.value = hz;
        oscillator.type = 'triangle';
        oscillator.connect(gain).connect(context.destination);
        gain.gain.setValueAtTime(0,zero+on);
        gain.gain.linearRampToValueAtTime(0.18,zero+on+edge);
        gain.gain.setValueAtTime(0.18,zero+off-edge);
        gain.gain.linearRampToValueAtTime(0,zero+off);
        oscillator.start(zero+on);
        oscillator.stop(zero+off);
      }
      current.timer = setTimeout(stop, (plan.duration+0.1)*1000);
    } catch(error) {
      if (current?.context === context) stop();
      throw error;
    }
  }
  // The recording clock owns position. Each heard attack can mark one nearby slot.
  function follow(state, schedule, notes, events, time, voice) {
    if (!events.length || !schedule.notes.length) return;
    state.origin ??= events[0].onset - schedule.notes[0].on;
    state.index ??= 0;
    state.colors ??= {};
    const slots = schedule.notes;
    while (state.index+1 < slots.length && slots[state.index+1].on <= time-state.origin) state.index++;
    for (let i=state.processed||0;i<events.length;i++) {
      const event=events[i], at=event.onset-state.origin;
      let slot=0;
      while(slot+1<slots.length && Math.abs(slots[slot+1].on-at)<Math.abs(slots[slot].on-at)) slot++;
      if(Math.abs(slots[slot].on-at)>Math.min(.35,(slots[slot].off-slots[slot].on)*.5)) continue;
      const delta=event.midi-notes[slot].midi;
      const distance=Math.abs(voice ? delta-12*Math.round(delta/12) : delta);
      if(distance<=.45) state.colors[notes[slot].id]='correct';
    }
    state.processed=events.length;
  }
  return {schedule,play,stop,follow};
})();
if (typeof module === 'object' && module.exports) module.exports = ScoreDemo;
