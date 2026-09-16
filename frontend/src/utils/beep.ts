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
