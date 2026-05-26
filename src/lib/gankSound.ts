/**
 * Web Audio two-tone gank alert beep — no bundled asset.
 *
 * Lazily creates and reuses a single AudioContext (browsers block AudioContext
 * construction before user interaction, so we defer until first call). Plays a
 * quick two-tone pulse (~300ms total) with a gain envelope to avoid audible
 * clicks. Swallows all errors silently — a missing beep is never fatal.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    ctx = new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function playTone(
  audioCtx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
): void {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = "triangle";
  osc.frequency.setValueAtTime(frequency, startAt);

  // Quick attack + release to avoid clicks.
  const attackTime = 0.01;
  const releaseTime = 0.04;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.25, startAt + attackTime);
  gain.gain.setValueAtTime(0.25, startAt + duration - releaseTime);
  gain.gain.linearRampToValueAtTime(0, startAt + duration);

  osc.start(startAt);
  osc.stop(startAt + duration);
}

/**
 * Plays a brief two-tone alert (880 Hz → 1320 Hz, ~300ms total).
 * Safe to call before user interaction has occurred — it will silently no-op
 * on `NotAllowedError` from the autoplay policy.
 */
export function playGankAlertSound(): void {
  try {
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    // First tone: 880 Hz for 130ms, gap of 20ms, second tone: 1320 Hz for 150ms.
    playTone(audioCtx, 880, now, 0.13);
    playTone(audioCtx, 1320, now + 0.15, 0.15);
  } catch {
    // Autoplay policy, suspended context, or anything else — silently ignore.
  }
}
