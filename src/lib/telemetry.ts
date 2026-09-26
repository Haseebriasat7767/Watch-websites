import { useSyncExternalStore } from "react";

/**
 * Frame-telemetry store.
 *
 * The render loop samples FPS ~1.4×/second; publishing through an external
 * store means only the readout component re-renders — the configurator, the
 * sidebar and the HUD never see a single extra render because of it.
 */

let fps = 60;
let dpr = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishTelemetry(next: { fps?: number; dpr?: number }) {
  let changed = false;
  if (next.fps !== undefined && next.fps !== fps) {
    fps = next.fps;
    changed = true;
  }
  if (next.dpr !== undefined && Math.abs(next.dpr - dpr) > 0.01) {
    dpr = next.dpr;
    changed = true;
  }
  if (changed) emit();
}

export function useFps() {
  return useSyncExternalStore(
    subscribe,
    () => fps,
    () => 60,
  );
}

export function useDpr() {
  return useSyncExternalStore(
    subscribe,
    () => dpr,
    () => 1,
  );
}
