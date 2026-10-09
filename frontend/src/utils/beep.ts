// A long, loud EVM-style confirmation beep -- a real EVM holds a single
// continuous tone for about a second, which is what makes it noticeable
// across a noisy polling booth. Synthesized in the browser so it works
// fully offline (no audio asset to bundle or fail to load).
export const playVoteBeep = (): void => {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    // Square wave reads as louder/more piercing than sine at the same
    // amplitude -- closer to the harsh buzz of a real EVM than a soft tone.
    oscillator.type = 'square';
    oscillator.frequency.value = 900;

    const now = ctx.currentTime;
    const duration = 1.1; // seconds -- long enough to be unmistakable
    const peak = 0.8; // loud, but leaves headroom to avoid clipping

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.03); // fast attack
    gain.gain.setValueAtTime(peak, now + duration - 0.05); // sustain at full volume
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // quick release

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    // Audio is a nice-to-have signal for the polling officer, not a
    // requirement -- never let it block or fail the vote flow.
  }
};

// A short, soft tick (and a tiny buzz on phones that allow it) each time a
// voter taps a candidate, so they know the tap registered. Deliberately
// brief and gentle so it can't be confused with the long beep that
// confirms the ballot was cast. The same for every candidate, so it gives
// away nothing about the choice.
export const playSelectTick = (): void => {
  try {
    navigator.vibrate?.(30);
  } catch {
    // Vibration is optional (not offered on iPhone, iPad or laptops).
  }
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 1300;

    const now = ctx.currentTime;
    const duration = 0.09; // seconds -- a tick, not a beep
    const peak = 0.35;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    // Never let the sound block or fail a selection.
  }
};
