import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Atelier room tone
 * ─────────────────────────────────────────────────────────────────────────────
 *  Synthesised, not streamed: two detuned sine partials under a low-passed
 *  noise bed, plus a 4 Hz escapement tick. Zero bytes of audio download, and
 *  nothing is created until the visitor explicitly asks for sound — the graph
 *  is built on the click that enables it, which also satisfies the browser's
 *  autoplay policy. It never starts unmuted on its own.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function useAtelierAudio() {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const tickTimer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (tickTimer.current) {
      window.clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
    const gain = master.current;
    const ctx = context.current;
    if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    void ctx?.suspend();
  }, []);

  const start = useCallback(() => {
    type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext;
    if (!Ctor) return false;

    if (!context.current) {
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);

      // Room tone: two detuned partials, gently filtered.
      const tone = ctx.createGain();
      tone.gain.value = 0.05;
      tone.connect(gain);
      [54, 81.5].forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const partial = ctx.createGain();
        partial.gain.value = index === 0 ? 1 : 0.35;
        osc.connect(partial).connect(tone);
        osc.start();
      });

      // Air: pink-ish noise through a low shelf.
      const seconds = 3;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let value = 0;
      for (let i = 0; i < data.length; i++) {
        value = (value + (Math.random() * 2 - 1) * 0.02) * 0.995;
        data[i] = value;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.5;
      noise.connect(filter).connect(noiseGain).connect(gain);
      noise.start();

      context.current = ctx;
      master.current = gain;
    }

    const ctx = context.current;
    const gain = master.current;
    if (!ctx || !gain) return false;
    void ctx.resume();
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2);

    // Escapement: eight beats a second, softened so it stays subliminal.
    if (!tickTimer.current) {
      tickTimer.current = window.setInterval(() => {
        const now = ctx.currentTime;
        const click = ctx.createOscillator();
        const env = ctx.createGain();
        click.type = "triangle";
        click.frequency.setValueAtTime(2400 + Math.random() * 300, now);
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(0.02, now + 0.002);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        click.connect(env).connect(gain);
        click.start(now);
        click.stop(now + 0.06);
      }, 250);
    }
    return true;
  }, []);

  const toggle = useCallback(() => {
    setEnabled((was) => {
      if (was) {
        stop();
        return false;
      }
      return start();
    });
  }, [start, stop]);

  useEffect(
    () => () => {
      if (tickTimer.current) window.clearInterval(tickTimer.current);
      void context.current?.close();
    },
    [],
  );

  return { enabled, toggle };
}
