import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CASINGS,
  FACES,
  type MaterialOption,
  type PhysicalVector,
} from "../lib/config";
import {
  createDialRoughness,
  createDialTexture,
  createFloorTexture,
  type DialPattern,
} from "../lib/dialTexture";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Material system
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `useWatchMaterialSet()` builds the atelier's five materials once.
 *  · `MaterialDriver` is the state-coupling engine: it owns the physical
 *    vectors (color / roughness / metalness) and eases them toward the active
 *    preset every frame, so a click reads as a jeweller rotating a part under
 *    the light rather than a hard swap.
 *  · `collectMaterialTargets()` walks an imported GLTF scene graph, matches the
 *    named sub-meshes and clones their materials so overrides never leak into
 *    instances shared with other parts of the model.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MaterialKind = "casing" | "face";

export type MaterialTarget = {
  kind: MaterialKind;
  material: THREE.MeshPhysicalMaterial;
  /** Source object name — surfaced in dev for auditing the mapping. */
  source: string;
};

export type WatchConfig = {
  casing: MaterialOption;
  face: MaterialOption;
};

/* ────────────────────────────────────────────────────────────────────────────
   Procedural atelier materials
   ──────────────────────────────────────────────────────────────────────────── */
export type WatchMaterialSet = {
  casing: THREE.MeshPhysicalMaterial;
  face: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  lume: THREE.MeshStandardMaterial;
  movement: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
};

/**
 * Built exactly once. Material identity must stay stable for the lifetime of
 * the scene: if a click recreated the set, the bracelet's instanced batches
 * would be rebuilt and `MaterialDriver` would snap to the new preset instead of
 * easing into it. All live changes therefore mutate these instances in place.
 */
export function useWatchMaterialSet(): WatchMaterialSet {
  const set = useMemo<WatchMaterialSet>(() => {
    const initial: WatchConfig = { casing: CASINGS[0], face: FACES[0] };
    const casing = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initial.casing.color),
      roughness: initial.casing.roughness,
      metalness: initial.casing.metalness,
      envMapIntensity: 1.45,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
    });
    casing.name = "atelier-casing";

    const face = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initial.face.color),
      roughness: initial.face.roughness,
      metalness: initial.face.metalness,
      envMapIntensity: 1.2,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
    });
    face.name = "atelier-face";

    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#ffffff"),
      metalness: 0,
      roughness: 0.02,
      transparent: true,
      opacity: 0.18,
      ior: 1.77,
      reflectivity: 0.55,
      envMapIntensity: 2.4,
      depthWrite: false,
      side: THREE.FrontSide,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    });
    glass.name = "atelier-sapphire";

    const lume = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f4ead0"),
      roughness: 0.55,
      metalness: 0.05,
      emissive: new THREE.Color("#4a4030"),
      emissiveIntensity: 0.55,
    });
    lume.name = "atelier-lume";

    const movement = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#14141a"),
      roughness: 0.34,
      metalness: 0.92,
      envMapIntensity: 1.1,
    });
    movement.name = "atelier-movement";

    const floor = new THREE.MeshStandardMaterial({
      map: createFloorTexture(),
      transparent: true,
      roughness: 0.82,
      metalness: 0.12,
      envMapIntensity: 0.6,
      depthWrite: false,
    });
    floor.name = "atelier-floor";

    return { casing, face, glass, lume, movement, floor };
  }, []);

  useEffect(() => {
    const materials = Object.values(set);
    return () => materials.forEach((m) => m.dispose());
  }, [set]);

  return set;
}

export type FaceFinish = { map?: THREE.Texture; roughnessMap?: THREE.Texture };

const PATTERNS: DialPattern[] = ["sunburst", "fume", "guilloche"];

function buildFinishes(): Record<DialPattern, FaceFinish> {
  const entries = PATTERNS.map((pattern): [DialPattern, FaceFinish] => {
    try {
      return [
        pattern,
        {
          map: createDialTexture({ pattern }),
          roughnessMap: createDialRoughness(pattern),
        },
      ];
    } catch {
      /**
       * A dial texture is decorative: if a browser refuses a 2D context or an
       * OffscreenCanvas, the material still paints in its exact preset colour —
       * the finish detail is simply absent. The configurator never breaks.
       */
      return [pattern, {}];
    }
  });
  return Object.fromEntries(entries) as Record<DialPattern, FaceFinish>;
}

/**
 * All three dial finishes, generated up-front behind the loading overlay, so
 * that switching a variant is a pointer swap: no canvas work, no GPU uploads,
 * not a single dropped frame at the moment of interaction.
 *
 * The house marks are drawn with the display serif — if the webfont has not
 * landed yet the dial would be stamped in a fallback face, so the set is
 * regenerated once `document.fonts.ready` resolves (typically well inside the
 * boot ramp, and always behind the loading overlay).
 */
export function useFaceFinishes(): Record<DialPattern, FaceFinish> {
  const [finishes, setFinishes] =
    useState<Record<DialPattern, FaceFinish>>(buildFinishes);

  useEffect(() => {
    let cancelled = false;
    let timeout = 0 as unknown as ReturnType<typeof setTimeout>;

    const regenerate = () => {
      if (cancelled) return;
      setFinishes((previous) => {
        const next = buildFinishes();
        Object.values(previous).forEach((finish) => {
          finish.map?.dispose();
          finish.roughnessMap?.dispose();
        });
        return next;
      });
    };

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      // Cap the wait so a stalled font request can never delay the studio.
      timeout = setTimeout(regenerate, 2500);
      fonts.ready.then(() => {
        clearTimeout(timeout);
        regenerate();
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const textures = finishes;
    return () => {
      Object.values(textures).forEach((finish) => {
        finish.map?.dispose();
        finish.roughnessMap?.dispose();
      });
    };
  }, [finishes]);

  return finishes;
}

/** Which finish does a preset id map to? */
export function patternForFace(presetId: string): DialPattern {
  if (presetId.includes("sunburst")) return "sunburst";
  if (presetId.includes("guilloche")) return "guilloche";
  return "fume";
}

const WatchMaterialsContext = createContext<WatchMaterialSet | null>(null);

export function WatchMaterialsProvider({
  value,
  children,
}: {
  value: WatchMaterialSet;
  children: ReactNode;
}) {
  return (
    <WatchMaterialsContext.Provider value={value}>
      {children}
    </WatchMaterialsContext.Provider>
  );
}

export function useWatchMaterials(): WatchMaterialSet {
  const set = useContext(WatchMaterialsContext);
  if (!set)
    throw new Error(
      "useWatchMaterials must be used inside <WatchMaterialsProvider>.",
    );
  return set;
}

/* ────────────────────────────────────────────────────────────────────────────
   GLTF sub-mesh targeting  (hot-swappable production model)
   ──────────────────────────────────────────────────────────────────────────── */
function matchesExact(name: string, option: MaterialOption) {
  return option.targets.some(
    (target) => name === target || name.startsWith(`${target}_`),
  );
}

function matchesKeyword(name: string, option: MaterialOption) {
  const lower = name.toLowerCase();
  return option.keywords.some((keyword) => lower.includes(keyword));
}

/**
 * Walks the loaded GLTF scene graph, identifies the target sub-meshes, clones
 * their materials and tags each clone with the configurator channel it belongs
 * to. Returns a flat list of { kind, material, source } for `MaterialDriver`.
 */
export function collectMaterialTargets(root: THREE.Object3D): MaterialTarget[] {
  const targets: MaterialTarget[] = [];
  const seen = new Set<THREE.Material>();

  const resolve = (names: string[]): MaterialKind | null => {
    const joined = names.filter(Boolean);
    for (const name of joined) {
      if (FACES.some((f) => matchesExact(name, f))) return "face";
      if (CASINGS.some((c) => matchesExact(name, c))) return "casing";
    }
    for (const name of joined) {
      if (FACES.some((f) => matchesKeyword(name, f))) return "face";
      if (CASINGS.some((c) => matchesKeyword(name, c))) return "casing";
    }
    return null;
  };

  const adopt = (
    mesh: THREE.Mesh,
    material: THREE.Material,
    kind: MaterialKind,
  ) => {
    // Clone: the override must never leak into instances shared with other parts.
    const clone = material.clone() as THREE.MeshPhysicalMaterial;
    clone.envMapIntensity = kind === "casing" ? 1.45 : 1.2;
    targets.push({ kind, material: clone, source: mesh.name || material.name });
    return clone;
  };

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const kind = resolve([
      mesh.name,
      mesh.parent?.name ?? "",
      materials.map((m) => m?.name ?? "").join(" "),
    ]);
    if (!kind) return;

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => {
        if (!m || seen.has(m)) return m;
        seen.add(m);
        return adopt(mesh, m, kind);
      });
    } else if (!seen.has(mesh.material)) {
      seen.add(mesh.material);
      mesh.material = adopt(mesh, mesh.material, kind);
    }
  });

  return targets;
}

/* ────────────────────────────────────────────────────────────────────────────
   The state-coupling engine
   ──────────────────────────────────────────────────────────────────────────── */
export function MaterialDriver({
  targets,
  config,
}: {
  targets: MaterialTarget[];
  config: WatchConfig;
}) {
  const scratch = useMemo(() => new THREE.Color(), []);
  const invalidate = useThree((state) => state.invalidate);

  // Re-render the frame loop as soon as the selection changes.
  useEffect(() => {
    invalidate();
  }, [config, invalidate]);

  useFrame((_, delta) => {
    // Frame-rate independent exponential easing (~140 ms to settle).
    const k = 1 - Math.exp(-11 * Math.min(delta, 0.1));
    let moving = false;
    for (const target of targets) {
      const preset: PhysicalVector =
        target.kind === "casing" ? config.casing : config.face;
      const m = target.material;
      if (!m) continue;
      scratch.set(preset.color);
      m.color.lerp(scratch, k);
      m.roughness += (preset.roughness - m.roughness) * k;
      m.metalness += (preset.metalness - m.metalness) * k;
      if (
        Math.abs(m.roughness - preset.roughness) > 0.001 ||
        Math.abs(m.metalness - preset.metalness) > 0.001 ||
        m.color.getHex() !== scratch.getHex()
      ) {
        moving = true;
      }
    }
    // Keep the loop awake only while a physical vector is still easing.
    if (moving) invalidate();
  });

  return null;
}
