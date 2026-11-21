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
  return {schedule,play,stop};
})();
if (typeof module === 'object' && module.exports) module.exports = ScoreDemo;
