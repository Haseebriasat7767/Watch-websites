import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Center, Preload, useGLTF } from "@react-three/drei";
import { DRACO_DECODER_PATH } from "../lib/config";
import {
  MaterialDriver,
  collectMaterialTargets,
  type WatchConfig,
} from "./materials";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Production GLB lane
 * ─────────────────────────────────────────────────────────────────────────────
 *  Activated by setting `MODEL_URL` in lib/config.ts to a hosted, Draco-encoded
 *  glTF/GLB. Nothing else in the component changes — the studio rig, the
 *  material driver and the controls are asset-agnostic.
 *
 *  · Draco is forced natively by passing the decoder path as `useGLTF`'s second
 *    argument; the decoder itself is served from `public/draco/`.
 *  · `<Preload all />` (rendered by the stage) compiles every shader program
 *    up-front, so the first interaction never hitches.
 *  · The scene graph is traversed once, its named sub-meshes are mapped to the
 *    casing / face channels, and each hit receives a cloned material.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function GLTFWatch({
  url,
  config,
}: {
  url: string;
  config: WatchConfig;
}) {
  const { scene } = useGLTF(url, DRACO_DECODER_PATH);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
    });
    return clone;
  }, [scene]);

  useEffect(
    () => () => {
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((material) => material?.dispose());
      });
    },
    [model],
  );

  // Target sub-mesh discovery happens once per loaded asset.
  const targets = useMemo(() => collectMaterialTargets(model), [model]);

  return (
    <>
      <Center>
        <primitive object={model} dispose={null} />
      </Center>
      <MaterialDriver config={config} targets={targets} />
      {/* Compile every program for the imported asset before the user touches it. */}
      <Preload all />
    </>
  );
}

/** Warms the loader before React commits, so Suspense resolves in one pass. */
export function preloadModel(url: string) {
  useGLTF.preload(url, DRACO_DECODER_PATH);
}
