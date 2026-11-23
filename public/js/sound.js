// Звук: всё синтезируется WebAudio прямо в браузере, без файлов (и без чужих лицензий).
// Звук включается после первого касания/клавиши — так требуют браузеры.
let ctx = null, master = null, enabled = true, noiseBuf = null;
let eng = null, wind = null;

export function initSound(on = true) {
  enabled = on;
  const unlock = () => {
    if (!ctx) create();
    if (ctx.state === 'suspended') ctx.resume();
  };
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });
}
export function setSoundOn(on) {
  enabled = on;
  if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}

function create() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = enabled ? 0.8 : 0;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = i % 2 ? w * 0.5 : b * 3.5; }

  // мотор: пила + квадрат на октаву ниже, через фильтр
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.Q.value = 4; g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
  eng = { o1, o2, f, g };

  // ветер / шум города
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0.025;
  n.connect(wf); wf.connect(wg); wg.connect(master); n.start();
  wind = { wf, wg };
}

const ready = () => ctx && ctx.state === 'running';

// каждый кадр: мотор своей машины и фон
export function updateSound(inCar, speed, gas, night, desert) {
  if (!ready()) return;
  const t = ctx.currentTime, v = Math.abs(speed);
  // «передачи»: тон растёт внутри передачи и падает при переключении
  const gear = Math.min(5, Math.floor(v / 12)), inGear = (v - gear * 12) / 12;
  const rpm = inCar ? 0.25 + inGear * 0.6 + gear * 0.04 + gas * 0.08 : 0;
  const fr = 38 + rpm * 120;
  eng.o1.frequency.setTargetAtTime(fr, t, 0.05);
  eng.o2.frequency.setTargetAtTime(fr / 2, t, 0.05);
  eng.f.frequency.setTargetAtTime(300 + rpm * 1400 + gas * 500, t, 0.08);
  eng.g.gain.setTargetAtTime(inCar ? 0.05 + gas * 0.05 + Math.min(0.04, v * 0.001) : 0, t, 0.1);
  wind.wg.gain.setTargetAtTime((desert ? 0.05 : 0.025) * (night ? 0.7 : 1) + (inCar ? Math.min(0.05, v * 0.0012) : 0), t, 0.3);
  wind.wf.frequency.setTargetAtTime(desert ? 600 : 350, t, 0.5);
}

function noiseHit(dur, freq, vol, type = 'lowpass', q = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const t = ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone(freq, dur, vol, type = 'sine', when = 0, slide = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  step(run, sand) { if (ready()) noiseHit(0.07, sand ? 900 : 1600 + Math.random() * 400, run ? 0.16 : 0.1, 'bandpass', 1.2); },
  land() { if (ready()) { noiseHit(0.15, 500, 0.25); tone(90, 0.12, 0.12, 'sine', 0, 0.5); } },
  crash(power) { if (!ready()) return; const v = Math.min(1, power / 25); noiseHit(0.35 + v * 0.3, 900, 0.25 + v * 0.5); tone(70, 0.3, 0.25 * v + 0.05, 'sine', 0, 0.4); },
  click() { if (ready()) tone(900, 0.05, 0.06, 'square'); },
  coin() { if (ready()) { tone(1319, 0.12, 0.12, 'square'); tone(1760, 0.3, 0.12, 'square', 0.08); } },
  door() { if (ready()) { noiseHit(0.08, 300, 0.25); tone(160, 0.08, 0.1, 'triangle', 0.02); } },
  horn() { if (ready()) { tone(392, 0.4, 0.12, 'square'); tone(494, 0.4, 0.1, 'square'); } },
  error() { if (ready()) { tone(220, 0.12, 0.1, 'square'); tone(180, 0.18, 0.1, 'square', 0.1); } },
  pick() { if (ready()) { noiseHit(0.1, 700, 0.2); tone(300, 0.08, 0.06, 'triangle'); } },
  eat() { if (ready()) { noiseHit(0.12, 1200, 0.18, 'bandpass', 2); tone(520, 0.15, 0.06, 'sine', 0.12, 1.5); } },
  dead() { if (ready()) tone(330, 1.2, 0.15, 'triangle', 0, 0.4); },
};
