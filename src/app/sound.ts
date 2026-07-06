/**
 * Звуковой движок v4 — строго по техническому заданию.
 *
 * Архитектура: каждый звук → master-gain (низкий общий уровень, пик ≈ −12 дБ)
 * → лимитер (DynamicsCompressor) → выход. Параллельный посыл в короткую
 * реверберацию (ConvolverNode, импульс ~0.25 с — «деревянный зал»).
 *
 * Все огибающие мягкие: заданная атака (linearRamp), экспоненциальный спад
 * до −60 дБ. Общая громкость на ~35% ниже предыдущей версии.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Базовый уровень мастера (пик ≈ −12 дБ) — умножается на пользовательскую громкость. */
const MASTER_BASE = 0.35;
let userVolume = 1;

/** Пользовательская громкость всех звуков игры, 0..1 (ползунок в настройках). */
export function setVolume(v: number): void {
  userVolume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = MASTER_BASE * userVolume;
}

/** Импульс «деревянного зала»: затухающий шум 0.25 с. */
function buildImpulse(ac: AudioContext): AudioBuffer {
  const dur = 0.25;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.8;
    }
  }
  return buf;
}

let reverbSend: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();

      // Лимитер против клиппинга: жёсткое колено, высокий ratio.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      limiter.connect(ctx.destination);

      // Общий уровень: пик около −12 дБ (≈0.25 в линейной шкале) × громкость.
      master = ctx.createGain();
      master.gain.value = MASTER_BASE * userVolume;
      master.connect(limiter);

      const reverb = ctx.createConvolver();
      reverb.buffer = buildImpulse(ctx);
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.3;
      reverbSend.connect(reverb);
      reverb.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Подключить узел к мастеру и (частично) к реверберации. */
function route(node: AudioNode, wet = 0.5): void {
  if (!master || !reverbSend || !ctx) return;
  node.connect(master);
  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(reverbSend);
  }
}

const FLOOR = 0.001; // −60 дБ

interface ToneOpts {
  freq: number;
  gain: number;
  durMs: number; // время спада до −60 дБ
  attackMs?: number;
  type?: OscillatorType;
  delayMs?: number;
  slideTo?: number; // глиссандо частоты за slideMs
  slideMs?: number;
  detune?: number;
  wet?: number;
}

/** Осциллятор с огибающей: атака → экспоненциальный спад до −60 дБ. */
function tone(o: ToneOpts): void {
  const ac = ensureCtx();
  if (!ac) return;
  const t0 = ac.currentTime + (o.delayMs ?? 0) / 1000;
  const tA = t0 + (o.attackMs ?? 0) / 1000;
  const t1 = tA + o.durMs / 1000;

  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.detune) osc.detune.value = o.detune;
  if (o.slideTo !== undefined) {
    osc.frequency.linearRampToValueAtTime(o.slideTo, t0 + (o.slideMs ?? o.durMs) / 1000);
  }

  const g = ac.createGain();
  g.gain.setValueAtTime(FLOOR, t0);
  if (o.attackMs && o.attackMs > 0) g.gain.linearRampToValueAtTime(o.gain, tA);
  else g.gain.setValueAtTime(o.gain, t0);
  g.gain.exponentialRampToValueAtTime(FLOOR, t1);

  osc.connect(g);
  route(g, o.wet ?? 0.5);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

interface NoiseOpts {
  durMs: number;
  gain: number;
  filter: 'bandpass' | 'lowpass';
  freq: number;
  q?: number;
  delayMs?: number;
}

/** Шумовой удар через фильтр, спад до −60 дБ за durMs. */
function noiseHit(o: NoiseOpts): void {
  const ac = ensureCtx();
  if (!ac) return;
  const t0 = ac.currentTime + (o.delayMs ?? 0) / 1000;
  const len = Math.max(1, Math.floor((ac.sampleRate * o.durMs) / 1000));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = o.filter;
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 1;

  const g = ac.createGain();
  g.gain.setValueAtTime(o.gain, t0);
  g.gain.exponentialRampToValueAtTime(FLOOR, t0 + o.durMs / 1000);

  src.connect(f);
  f.connect(g);
  route(g, 0.35);
  src.start(t0);
}

/* ================= Звуки по ТЗ ================= */

/**
 * Ход: тот же тихий глухой стук, что у взятия (lowpass-шум + низкая
 * синусоида), но менее выраженный — тише, короче и чуть выше тоном.
 */
export function moveSound(): void {
  noiseHit({ durMs: 90, gain: 0.085, filter: 'lowpass', freq: 600 });
  tone({ freq: 160, gain: 0.12, durMs: 90, attackMs: 0, wet: 0.3 });
}

/** Взятие: глубже и весомее. Шум → lowpass 600 Гц + синусоида 140 Гц, 120 мс. */
export function captureSound(): void {
  noiseHit({ durMs: 120, gain: 0.14, filter: 'lowpass', freq: 600 });
  tone({ freq: 140, gain: 0.2, durMs: 120, attackMs: 0, wet: 0.3 });
}

/**
 * Шах: два колокольчика (880 и 1047 Гц) по 120 мс с паузой 100 мс,
 * атака 10 мс + слабый обертон на октаву выше для металлического оттенка.
 */
export function checkSound(): void {
  tone({ freq: 880, gain: 0.2, durMs: 120, attackMs: 10, wet: 0.7 });
  tone({ freq: 1760, gain: 0.05, durMs: 120, attackMs: 10, wet: 0.7 });
  tone({ freq: 1047, gain: 0.2, durMs: 120, attackMs: 10, delayMs: 220, wet: 0.7 });
  tone({ freq: 2094, gain: 0.05, durMs: 120, attackMs: 10, delayMs: 220, wet: 0.7 });
}

/**
 * Эволюция: восходящее арпеджио E4–G#4–B4–E5 с шагом 70 мс (синус+треугольник
 * 50/50), в конце мягкий chime-аккорд E4+B4 на 400 мс.
 * Высокочастотный shimmer убран — свистел на заднем плане.
 */
export function evolutionSound(): void {
  const notes = [330, 415, 494, 659];
  notes.forEach((f, i) => {
    tone({ freq: f, gain: 0.075, durMs: 150, attackMs: 5, delayMs: i * 70, type: 'sine', wet: 0.8 });
    tone({ freq: f, gain: 0.075, durMs: 150, attackMs: 5, delayMs: i * 70, type: 'triangle', wet: 0.8 });
  });

  // Финальный chime: E4 + B4, 400 мс.
  tone({ freq: 330, gain: 0.06, durMs: 400, attackMs: 15, delayMs: 300, wet: 0.85 });
  tone({ freq: 494, gain: 0.06, durMs: 400, attackMs: 15, delayMs: 300, wet: 0.85 });
}

/**
 * Победа (мат): мажорный аккорд C-E-G-C, атака 50 мс, спад 1.5 с, реверберация
 * и лёгкий «хор» — слегка расстроенные копии с задержкой 20–30 мс.
 */
export function victorySound(): void {
  const chord = [262, 330, 392, 523];
  chord.forEach((f, i) => {
    tone({ freq: f, gain: 0.062, durMs: 1500, attackMs: 50, delayMs: i * 30, wet: 0.9 });
    // хоровая копия: расстройка ±7 центов, задержка 25 мс
    tone({
      freq: f,
      gain: 0.03,
      durMs: 1500,
      attackMs: 50,
      delayMs: i * 30 + 25,
      detune: i % 2 === 0 ? 7 : -7,
      wet: 0.9,
    });
  });
}

/** Ничья: два спокойных тона (не из ТЗ — сохранён приглушённый вариант). */
export function drawSound(): void {
  tone({ freq: 392, gain: 0.05, durMs: 450, attackMs: 30, wet: 0.8 });
  tone({ freq: 440, gain: 0.045, durMs: 600, attackMs: 30, delayMs: 200, wet: 0.8 });
}

/**
 * Падение флага: спокойный низкий тон 120 → 80 Гц за 500 мс, атака 30 мс,
 * долгий спад. Сигнал завершения, без тревожности.
 */
export function flagFallSound(): void {
  tone({ freq: 120, gain: 0.2, durMs: 900, attackMs: 30, slideTo: 80, slideMs: 500, wet: 0.6 });
}

/** Тихий щелчок последних секунд часов. */
export function tickSound(): void {
  noiseHit({ durMs: 30, gain: 0.035, filter: 'bandpass', freq: 2200, q: 3 });
}
