// A short EVM-style confirmation beep, synthesized in the browser so it
// works fully offline (no audio asset to bundle or fail to load).
export const playVoteBeep = (): void => {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 1000;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    // Audio is a nice-to-have signal for the polling officer, not a
    // requirement -- never let it block or fail the vote flow.
  }
};
