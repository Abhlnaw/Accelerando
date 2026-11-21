/* YIN normalized difference detector. Decimate before comparing candidate periods. */
function fundamental(samples, sampleRate) {
  const stride = Math.max(1, Math.round(sampleRate / 12000));
  const rate = sampleRate / stride;
  const count = Math.floor(samples.length / stride);
  const signal = new Float32Array(count);
  let power = 0;
  for (let i = 0; i < count; i++) {
    let total = 0;
    for (let j = 0; j < stride; j++) total += samples[i * stride + j];
    signal[i] = total / stride;
    power += signal[i] ** 2;
  }
  if (power / count < 1e-8) return null;
  const max = Math.min(Math.ceil(rate / 27.5), Math.floor(count / 2));
  const width = count - max;
  const diff = new Float32Array(max + 1);
  let sum = 0;
  for (let lag = 1; lag <= max; lag++) {
    let d = 0;
    for (let i = 0; i < width; i++) d += (signal[i] - signal[i + lag]) ** 2;
    sum += d;
    diff[lag] = sum ? d * lag / sum : 1;
  }
  for (let lag = Math.max(2, Math.floor(rate / 2200)); lag < max; lag++) {
    if (diff[lag] > .14) continue;
    while (lag < max && diff[lag + 1] < diff[lag]) lag++;
    // Refine at the native sample rate so short high-register periods retain
    // cent-level precision after the lower-rate candidate search.
    const first = Math.max(1,(lag-1)*stride-1), last=(lag+1)*stride+1;
    const error=[];
    for(let shift=first; shift<=last; shift++){
      let residual=0;
      for(let i=0; i<samples.length-last; i+=stride) residual+=(samples[i]-samples[i+shift])**2;
      error.push(residual);
    }
    const k=error.indexOf(Math.min(...error)), b=error[k];
    const a=error[k-1], c=error[k+1];
    const adjustment=a===undefined || c===undefined || a+c===2*b ? 0 : .5*(a-c)/(a+c-2*b);
    return sampleRate/(first+k+adjustment);
  }
  return null;
}
if (typeof module === 'object') module.exports = {fundamental};
