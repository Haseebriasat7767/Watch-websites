import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Preload, useProgress } from "@react-three/drei";
import * as THREE from "three";
import {
  CASINGS,
  FACES,
  MATERIALS_LEDGER,
  MODEL_URL,
  SCENE,
  SPECS,
  type MaterialOption,
} from "./lib/config";
import { swatchBackground } from "./lib/color";
import { publishTelemetry, useDpr, useFps } from "./lib/telemetry";
import { WatchMaterialsProvider, useWatchMaterialSet } from "./three/materials";
import { ProceduralWatch } from "./three/ProceduralWatch";

import { StaticShadowBake, StudioFloor, StudioLights } from "./three/Studio";
import { useStageScale } from "./three/useStageScale";

/* ────────────────────────────────────────────────────────────────────────────
   Static configuration
   ──────────────────────────────────────────────────────────────────────────── */
const DPR_RANGE: [number, number] = [...SCENE.dpr];
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * The GLB lane is code-split and warmed before React commits, so Suspense
 * resolves in a single pass. While the bundled procedural timepiece is in use,
 * the glTF loader and the Draco decoder are never downloaded at all.
 */
const GLTFWatch = MODEL_URL
  ? lazy(() =>
      import("./three/GLTFWatch").then((module) => ({
        default: module.GLTFWatch,
      })),
    )
  : null;

if (MODEL_URL) {
  void import("./three/GLTFWatch").then((module) =>
    module.preloadModel(MODEL_URL!),
  );
}

function reference(config: { casing: MaterialOption; face: MaterialOption }) {
  const metal = config.casing.id.slice(0, 3).toUpperCase();
  const dial = config.face.id.slice(0, 3).toUpperCase();
  return `AUR·40·${metal}·${dial}`;
}

/* ────────────────────────────────────────────────────────────────────────────
   Boot sequence
   ──────────────────────────────────────────────────────────────────────────── */
/**
 * Progress blends the real asset queue (Draco payload, HDR preset) with a short
 * choreographed ramp, so the overlay always reads as deliberate craft rather
 * than a flash of nothing on a warm cache.
 *
 * The ramp state lives in the overlay rather than the page, so the 90-odd state
 * updates it emits during boot never re-render the studio tree.
 */
function useBootProgress(ready: boolean) {
  const { progress: assetProgress, active } = useProgress();
  const [ramp, setRamp] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 1500);
      setRamp(t * 100);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Failsafe: a scene that never reports ready (no GPU, blocked HDR, a driver
  // that drops the context) must not strand the visitor behind the overlay.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setStalled(true), 8000);
    return () => clearTimeout(timer);
  }, [ready]);

  const value = Math.max(ramp, active ? assetProgress : 0);
  return ready || stalled ? Math.max(value, 100) : Math.min(value, 99);
}

/* ────────────────────────────────────────────────────────────────────────────
   Scene internals
   ──────────────────────────────────────────────────────────────────────────── */
/** Slow turntable that yields to the user and resumes when they let go. */
function CameraRig() {
  const [autoRotate, setAutoRotate] = useState(!REDUCED_MOTION);
  const timer = useRef<number | null>(null);
  const interacting = useRef(false);

  const resume = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!interacting.current && !REDUCED_MOTION) setAutoRotate(true);
    }, 4500);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <OrbitControls
      makeDefault
      enableZoom
      enablePan={false}
      enableDamping
      dampingFactor={0.055}
      rotateSpeed={0.55}
      zoomSpeed={0.65}
      minDistance={SCENE.controls.minDistance}
      maxDistance={SCENE.controls.maxDistance}
      minPolarAngle={SCENE.controls.minPolarAngle}
      maxPolarAngle={SCENE.controls.maxPolarAngle}
      autoRotate={autoRotate}
      autoRotateSpeed={0.45}
      target={[0, 0, 0]}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      onStart={() => {
        interacting.current = true;
        setAutoRotate(false);
      }}
      onEnd={() => {
        interacting.current = false;
        resume();
      }}
    />
  );
}

/**
 * Keeps the device inside its comfortable thermal envelope: a rolling FPS
 * window nudges the render scale between three tiers, and the result is
 * published to the telemetry store shown in the HUD.
 */
function AdaptiveQuality() {
  const gl = useThree((state) => state.gl);
  const setDpr = useThree((state) => state.setDpr);
  const frames = useRef(0);
  const last = useRef(performance.now());
  const tier = useRef(1);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed < 1000) return;

    const fps = (frames.current * 1000) / elapsed;
    frames.current = 0;
    last.current = now;

    const ceiling = Math.min(window.devicePixelRatio || 1, DPR_RANGE[1]);
    const ladder = [1, 1.35, ceiling];
    if (fps < 48 && tier.current > 0) tier.current -= 1;
    else if (fps > 57 && tier.current < ladder.length - 1) tier.current += 1;

    const next = Math.min(ladder[tier.current], ceiling);
    if (Math.abs(next - gl.getPixelRatio()) > 0.01) setDpr(next);
    publishTelemetry({ fps: Math.round(fps), dpr: gl.getPixelRatio() });
  });

  return null;
}

/** Scales the timepiece to the locked frustum — see useStageScale. */
function StageFit({ children }: { children: ReactNode }) {
  const scale = useStageScale();
  return <group scale={scale}>{children}</group>;
}

/** Fires once the first frame is genuinely on screen. */
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        onReady();
        raf = 0;
      }),
    );
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [onReady]);
  return null;
}

/**
 * The stage: camera matrix, studio rig, stage floor and the configurator-driven
 * timepiece inside a Suspense boundary.
 */
function WatchStage({
  config,
  onReady,
}: {
  config: { casing: MaterialOption; face: MaterialOption };
  onReady: () => void;
}) {
  const materials = useWatchMaterialSet();

  return (
    <WatchMaterialsProvider value={materials}>
      <CameraRig />
      <StudioLights />
      <StudioFloor />

      <Suspense fallback={null}>
        <StageFit>
          {GLTFWatch && MODEL_URL ? (
            <GLTFWatch url={MODEL_URL} config={config} />
          ) : (
            <ProceduralWatch config={config} />
          )}
        </StageFit>
      </Suspense>

      <StaticShadowBake />
      <AdaptiveQuality />
      <SceneReady onReady={onReady} />
      <Preload all />
    </WatchMaterialsProvider>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Overlay UI primitives
   ──────────────────────────────────────────────────────────────────────────── */
function GroupLabel({
  index,
  title,
  hint,
}: {
  index: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[9.5px] font-normal tracking-luxe text-white/45 uppercase">
        <span className="text-champagne-300/70">{index}</span> {title}
      </h2>
      {hint ? (
        <span className="font-mono text-[8.5px] text-white/25">{hint}</span>
      ) : null}
    </div>
  );
}

function MaterialOptionRow({
  option,
  active,
  onSelect,
}: {
  option: MaterialOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ease-out",
        active
          ? "border-champagne-400/45 bg-white/[0.07] shadow-[0_0_34px_-16px_rgba(212,175,55,0.75)]"
          : "border-white/[0.07] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.05]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-champagne-300/70",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "relative h-8 w-8 shrink-0 rounded-full ring-1 transition-transform duration-300 group-hover:scale-105",
          active ? "ring-champagne-300/70" : "ring-white/15",
        ].join(" ")}
        style={{ backgroundImage: swatchBackground(option.color) }}
      >
        <span className="absolute inset-x-1 top-0.5 h-2 rounded-full bg-white/25 blur-[3px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-tight tracking-[0.02em] text-white/90">
          {option.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[9px] tracking-[0.14em] text-white/35 uppercase">
          {option.caption}
        </span>
      </span>

      <span
        aria-hidden
        className={[
          "h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300",
          active
            ? "bg-champagne-300 shadow-[0_0_10px_2px_rgba(212,175,55,0.6)]"
            : "bg-white/15",
        ].join(" ")}
      />

      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          style={{ animation: "sweep 3.6s ease-in-out 1.2s infinite" }}
        />
      ) : null}
    </button>
  );
}

function MaterialOptionChip({
  option,
  active,
  onSelect,
}: {
  option: MaterialOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={option.name}
      className={[
        "flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 transition-all duration-300",
        active
          ? "border-champagne-400/50 bg-white/[0.07]"
          : "border-white/[0.07] bg-white/[0.015] active:bg-white/[0.05]",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "h-6 w-6 rounded-full ring-1 transition-transform duration-300",
          active ? "scale-110 ring-champagne-300/80" : "ring-white/15",
        ].join(" ")}
        style={{ backgroundImage: swatchBackground(option.color) }}
      />
      <span
        className={[
          "font-mono text-[8px] leading-tight tracking-[0.1em] uppercase",
          active ? "text-champagne-200" : "text-white/45",
        ].join(" ")}
      >
        {option.name.split(" ").slice(-1)[0]}
      </span>
    </button>
  );
}

function Telemetry() {
  const fps = useFps();
  const dpr = useDpr();
  const healthy = fps >= 55;
  return (
    <div className="flex items-center justify-end gap-2 font-mono text-[9px] tracking-[0.16em] text-white/30 uppercase">
      <span
        className={[
          "h-1 w-1 rounded-full",
          healthy
            ? "bg-emerald-400/80 shadow-[0_0_8px_1px_rgba(52,211,153,0.55)]"
            : "bg-amber-400/80",
        ].join(" ")}
      />
      <span className="tabular-nums">{fps} fps</span>
      <span className="text-white/15">·</span>
      <span className="tabular-nums">{dpr.toFixed(2)}×</span>
    </div>
  );
}

function LoadingOverlay({ ready }: { ready: boolean }) {
  const progress = useBootProgress(ready);
  const visible = progress < 100;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={[
        "absolute inset-0 z-40 flex items-center justify-center bg-obsidian-950/45 px-6 transition-opacity duration-700 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
    >
      <div className="glass-panel relative w-full max-w-sm overflow-hidden rounded-3xl px-8 py-9 text-center">
        {/* armillary sweep */}
        <div className="relative mx-auto mb-7 h-16 w-16">
          <span className="absolute inset-0 rounded-full border border-white/10" />
          <span
            className="absolute inset-0 rounded-full border border-transparent border-t-champagne-300/80"
            style={{ animation: "orbit 2.4s linear infinite" }}
          />
          <span
            className="absolute inset-2 rounded-full border border-transparent border-b-champagne-400/45"
            style={{ animation: "orbit 1.7s linear infinite reverse" }}
          />
          <span className="absolute inset-[38%] rounded-full bg-champagne-300/80 shadow-[0_0_18px_3px_rgba(212,175,55,0.55)]" />
        </div>

        <h1 className="font-display text-[19px] font-light tracking-[0.16em] text-white/92">
          Optimizing 3D Mesh Assets...
        </h1>
        <p className="mt-2 font-mono text-[9px] tracking-[0.26em] text-white/35 uppercase">
          Draco · KTX2 · Tangent Space
        </p>

        <div className="mt-7 h-px w-full overflow-hidden bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-champagne-600 via-champagne-200 to-champagne-400 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[9px] tracking-[0.2em] text-white/35">
          <span>ATELIER SEQUENCE</span>
          <span className="tabular-nums text-champagne-200/80">
            {String(Math.round(progress)).padStart(3, "0")}%
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * If WebGL is unavailable or the context is lost, the studio must degrade to a
 * composed message rather than a blank page — the configuration UI stays whole.
 */
class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[AURELIS] 3D studio unavailable:", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="absolute inset-0 z-[1] flex items-center justify-center px-6">
        <div className="glass-panel max-w-sm rounded-2xl px-7 py-6 text-center">
          <p className="font-mono text-[9px] tracking-[0.26em] text-champagne-200/80 uppercase">
            Studio offline
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-white/70">
            This browser could not open a WebGL context, so the 3D atelier is
            unavailable. Your specification is intact — it is recorded above.
          </p>
        </div>
      </div>
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   The component
   ──────────────────────────────────────────────────────────────────────────── */
export default function WatchCustomizer() {
  const [casing, setCasing] = useState<MaterialOption>(CASINGS[0]);
  const [face, setFace] = useState<MaterialOption>(FACES[0]);
  const [ready, setReady] = useState(false);

  const config = useMemo(() => ({ casing, face }), [casing, face]);
  const onReady = useCallback(() => setReady(true), []);

  return (
    <main className="atelier-app relative h-dvh w-full overflow-hidden bg-obsidian-950 select-none">
      {/* ── ambient studio glow behind the canvas ─────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute left-1/2 top-1/2 h-[78vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.05) 42%, transparent 70%)",
            animation: "halo 7s ease-in-out infinite",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px hairline opacity-40" />
      </div>

      {/* ── the studio ────────────────────────────────────────────────────── */}
      <CanvasBoundary>
        <Canvas
          className="absolute inset-0 z-[1] touch-none"
          dpr={DPR_RANGE}
          shadows="soft"
          frameloop="always"
          camera={{
            position: SCENE.camera.position,
            fov: SCENE.camera.fov,
            near: SCENE.camera.near,
            far: SCENE.camera.far,
          }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            stencil: false,
            preserveDrawingBuffer: false,
          }}
          performance={{ min: 0.55 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.02;
            gl.shadowMap.needsUpdate = true;
            publishTelemetry({ dpr: gl.getPixelRatio() });
          }}
        >
          <WatchStage config={config} onReady={onReady} />
        </Canvas>
      </CanvasBoundary>

      {/* ── left sidebar · state configuration engine ─────────────────────── */}
      <aside
        className="absolute left-6 top-6 bottom-6 z-10 hidden w-80 flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur-md shadow-[0_28px_80px_-34px_rgba(0,0,0,0.9)] lg:flex"
        style={{ animation: "rise 0.9s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <header className="shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-[26px] leading-none font-light tracking-[0.3em] gold-text">
              AURELIS
            </h1>
            <span className="font-mono text-[8.5px] tracking-[0.22em] text-white/30">
              EST·1897
            </span>
          </div>
          <p className="mt-2 font-mono text-[9px] tracking-[0.24em] text-white/35 uppercase">
            Bespoke Atelier · Genève
          </p>
          <div className="mt-5 h-px w-full hairline opacity-60" />
        </header>

        <div className="rail-scroll -mx-2 my-5 min-h-0 flex-1 overflow-y-auto px-2">
          <section>
            <GroupLabel index="I" title="Casing Materials" hint={casing.id} />
            <div className="flex flex-col gap-2">
              {CASINGS.map((option) => (
                <MaterialOptionRow
                  key={option.id}
                  option={option}
                  active={option.id === casing.id}
                  onSelect={() => setCasing(option)}
                />
              ))}
            </div>
          </section>

          <section className="mt-7">
            <GroupLabel
              index="II"
              title="Bezel & Dial Face Variants"
              hint={face.id}
            />
            <div className="flex flex-col gap-2">
              {FACES.map((option) => (
                <MaterialOptionRow
                  key={option.id}
                  option={option}
                  active={option.id === face.id}
                  onSelect={() => setFace(option)}
                />
              ))}
            </div>
          </section>

          <section className="mt-7">
            <GroupLabel index="III" title="Specification" />
            <ul className="space-y-1.5 font-mono text-[9.5px] tracking-[0.1em] text-white/40">
              {MATERIALS_LEDGER.map((spec) => (
                <li
                  key={spec.label}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-white/25 uppercase">{spec.label}</span>
                  <span className="text-right text-white/60">{spec.value}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="shrink-0">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[8.5px] tracking-[0.22em] text-white/30 uppercase">
                Allocation
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-champagne-200/90">
                {reference(config)}
              </p>
            </div>
            <p className="font-display text-[17px] font-light tracking-[0.06em] text-white/85">
              CHF 48,900
            </p>
          </div>

          <button
            type="button"
            className="group relative w-full overflow-hidden rounded-xl px-5 py-3.5 transition-transform duration-300 ease-out will-change-transform hover:scale-[1.03] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-champagne-200/70"
            style={{
              backgroundImage:
                "linear-gradient(105deg,#8c6d1f 0%,#d4af37 26%,#f6ecd2 50%,#e2c886 68%,#b8912b 100%)",
            }}
          >
            <span className="relative z-10 block font-mono text-[10.5px] font-medium tracking-[0.22em] text-obsidian-950 uppercase">
              Reserve Custom Timepiece
            </span>
            <span
              aria-hidden
              className="absolute inset-y-0 -left-1/4 w-1/4 bg-white/45 blur-md transition-transform duration-700 group-hover:translate-x-[420%]"
            />
          </button>
          <p className="mt-3 text-center font-mono text-[8px] tracking-[0.2em] text-white/25 uppercase">
            Complimentary engravings · 14-week atelier lead time
          </p>
        </footer>
      </aside>

      {/* ── right details HUD · monospaced dossier ────────────────────────── */}
      <aside className="pointer-events-none absolute right-6 top-6 bottom-6 z-10 hidden w-64 flex-col justify-between text-right lg:flex">
        <section className="glass-panel rounded-2xl px-5 py-5">
          <p className="font-mono text-[8.5px] tracking-[0.28em] text-white/35 uppercase">
            Technical Dossier
          </p>
          <div className="mt-4 h-px w-full hairline opacity-40" />
          <dl className="mt-4 space-y-3.5">
            {SPECS.map((spec) => (
              <div key={spec.label}>
                <dt className="font-mono text-[8.5px] tracking-[0.24em] text-white/35 uppercase">
                  {spec.label}
                </dt>
                <dd className="mt-1 font-mono text-[11px] tracking-[0.05em] text-champagne-100/90">
                  {spec.value}
                </dd>
                {spec.note ? (
                  <dd className="font-mono text-[8.5px] tracking-[0.12em] text-white/25">
                    {spec.note}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </section>

        <section className="glass-panel rounded-2xl px-5 py-4">
          <p className="font-mono text-[8.5px] tracking-[0.28em] text-white/35 uppercase">
            Live Configuration
          </p>
          <div className="mt-3 space-y-2 font-mono text-[9.5px] tracking-[0.08em]">
            <p className="flex items-center justify-end gap-2 text-white/55">
              <span className="text-white/25 uppercase">Case</span>
              <span className="text-champagne-100/85">
                {config.casing.name}
              </span>
            </p>
            <p className="flex items-center justify-end gap-2 text-white/55">
              <span className="text-white/25 uppercase">Bezel/Dial</span>
              <span className="text-champagne-100/85">{config.face.name}</span>
            </p>
          </div>
          <div className="mt-4 h-px w-full hairline opacity-40" />
          <div className="mt-3">
            <Telemetry />
          </div>
        </section>

        <section className="glass-panel rounded-2xl px-5 py-4">
          <p className="font-mono text-[8.5px] tracking-[0.28em] text-white/35 uppercase">
            Viewport
          </p>
          <p className="mt-2 font-mono text-[9.5px] leading-relaxed tracking-[0.1em] text-white/45">
            Drag to orbit · Scroll to zoom
            <br />
            <span className="text-white/25">
              Polar lock {Math.round((Math.PI / 1.8) * 57.3)}°
            </span>
          </p>
        </section>
      </aside>

      {/* ── mobile header + spec strip ────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-start justify-between lg:hidden">
        <div>
          <h1 className="font-display text-[22px] leading-none font-light tracking-[0.28em] gold-text">
            AURELIS
          </h1>
          <p className="mt-1.5 font-mono text-[8px] tracking-[0.22em] text-white/35 uppercase">
            Bespoke Atelier
          </p>
        </div>
        <div className="glass-panel rounded-xl px-3 py-2 text-right">
          {SPECS.map((spec) => (
            <p
              key={spec.label}
              className="font-mono text-[8px] leading-[1.7] tracking-[0.1em]"
            >
              <span className="text-white/30 uppercase">
                {spec.label.slice(0, 6)}{" "}
              </span>
              <span className="text-champagne-100/85">{spec.value}</span>
            </p>
          ))}
        </div>
      </div>

      {/* ── mobile configurator sheet ─────────────────────────────────────── */}
      <section className="absolute inset-x-4 bottom-4 z-10 lg:hidden">
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[8.5px] tracking-luxe text-white/40 uppercase">
              Configure
            </span>
            <span className="font-mono text-[8.5px] tracking-[0.14em] text-champagne-200/85">
              {reference(config)}
            </span>
          </div>

          <div className="mt-3">
            <GroupLabel index="I" title="Casing" />
            <div className="flex gap-2">
              {CASINGS.map((option) => (
                <MaterialOptionChip
                  key={option.id}
                  option={option}
                  active={option.id === casing.id}
                  onSelect={() => setCasing(option)}
                />
              ))}
            </div>
          </div>

          <div className="mt-3">
            <GroupLabel index="II" title="Bezel & Dial" />
            <div className="flex gap-2">
              {FACES.map((option) => (
                <MaterialOptionChip
                  key={option.id}
                  option={option}
                  active={option.id === face.id}
                  onSelect={() => setFace(option)}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="relative mt-4 w-full overflow-hidden rounded-xl px-4 py-3 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99]"
            style={{
              backgroundImage:
                "linear-gradient(105deg,#8c6d1f 0%,#d4af37 26%,#f6ecd2 50%,#e2c886 68%,#b8912b 100%)",
            }}
          >
            <span className="block font-mono text-[10px] font-medium tracking-[0.2em] text-obsidian-950 uppercase">
              Reserve Custom Timepiece
            </span>
          </button>
        </div>
      </section>

      <LoadingOverlay ready={ready} />

      {/* ── provenance footnote ───────────────────────────────────────────── */}
      <p className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 font-mono text-[8px] tracking-[0.24em] text-white/20 uppercase lg:block">
        {MODEL_URL
          ? "Production GLB · Draco compressed"
          : "Procedural atelier mesh · zero-network asset"}
        {" · "}shader preload active
      </p>
    </main>
  );
}
