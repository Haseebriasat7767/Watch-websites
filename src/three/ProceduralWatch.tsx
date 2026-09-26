import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three-stdlib";
import {
  buildBraceletLayout,
  buildCaseBackRing,
  buildCaseGeometry,
  buildCrownGeometry,
  buildCrystalGeometry,
  buildHands,
  buildIndices,
  buildLugGeometry,
  buildRehautGeometry,
  buildReserveNeedle,
  buildRotorGeometry,
  annulusGeometry,
  planarizeUV,
  HERO_TIME,
  LINK_GEOMETRY,
  SIDE_LINK_OFFSET,
  LUG_X,
  CASE,
} from "./geometry";
import {
  MaterialDriver,
  patternForFace,
  useFaceFinishes,
  useWatchMaterials,
  type WatchConfig,
} from "./materials";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The atelier timepiece
 * ─────────────────────────────────────────────────────────────────────────────
 *  A 40.5 mm automatic in polished metal, assembled from parametric geometry:
 *  fluted coin-edge bezel, domed sapphire, applied luminous indices, sword
 *  hands frozen at 10:09:36, power-reserve subdial, exhibition case back and a
 *  five-link bracelet laid on a wrist curve.
 *
 *  ~20 draw calls · < 90k triangles · materials shared and driven live by the
 *  configurator state. This is the asset that guarantees the 60 FPS budget on
 *  mobile — set `MODEL_URL` in lib/config.ts to load a hosted GLB instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ProceduralWatch({ config }: { config: WatchConfig }) {
  const materials = useWatchMaterials();
  const finishes = useFaceFinishes();
  const pattern = patternForFace(config.face.id);

  /* Geometry is built once — never per render, never per config change. */
  const geometry = useMemo(() => {
    const dial = planarizeUV(new THREE.CircleGeometry(CASE.dialRadius, 96));
    const reserve = annulusGeometry({
      inner: 0.168,
      outer: 0.2,
      segments: 72,
      dome: 0.004,
      wall: 0.02,
    });
    reserve.translate(0, -0.44, 0.016);
    planarizeUV(reserve);

    return {
      dial,
      reserve,
      case: buildCaseGeometry(),
      rehaut: buildRehautGeometry(),
      crystal: buildCrystalGeometry(),
      crown: buildCrownGeometry(),
      caseBack: buildCaseBackRing(),
      rotor: buildRotorGeometry(),
      lugTop: buildLugGeometry(1),
      lugBottom: buildLugGeometry(-1),
      insert: annulusGeometry({
        inner: CASE.bezelInner,
        outer: CASE.bezelOuter,
        segments: 144,
        dome: 0.018,
        wall: 0.06,
      }),
      indices: buildIndices(),
      hands: buildHands(),
      reserveNeedle: buildReserveNeedle(),
      hub: new THREE.CylinderGeometry(0.035, 0.042, 0.07, 24, 1),
      guard: new RoundedBoxGeometry(0.13, 0.3, 0.3, 3, 0.07),
      window: new THREE.CylinderGeometry(0.5, 0.5, 0.02, 48),
    };
  }, []);

  /* Swap the dial finish the instant the variant changes — a pointer move. */
  useLayoutEffect(() => {
    const finish = finishes[pattern] ?? {};
    materials.face.map = finish.map ?? null;
    materials.face.roughnessMap = finish.roughnessMap ?? null;
  }, [finishes, materials.face, pattern]);

  /* Bracelet: every link of both sides in two instanced draw calls. */
  const bracelet = useMemo(() => {
    const { center, side } = buildBraceletLayout();
    const matrix = new THREE.Matrix4();
    const offset = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);

    const centerMesh = new THREE.InstancedMesh(
      LINK_GEOMETRY.center(),
      materials.casing,
      center.length,
    );
    const sideMesh = new THREE.InstancedMesh(
      LINK_GEOMETRY.side(),
      materials.casing,
      side.length * 2,
    );

    center.forEach((link, i) => {
      matrix.compose(
        link.position,
        link.quaternion,
        scale.set(1, link.height, 1),
      );
      centerMesh.setMatrixAt(i, matrix);
    });
    let n = 0;
    side.forEach((link) => {
      for (const sign of [1, -1]) {
        offset
          .set(sign * SIDE_LINK_OFFSET, 0, 0)
          .applyQuaternion(link.quaternion)
          .add(link.position);
        matrix.compose(offset, link.quaternion, scale.set(1, link.height, 1));
        sideMesh.setMatrixAt(n++, matrix);
      }
    });
    for (const mesh of [centerMesh, sideMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
    }
    return { centerMesh, sideMesh };
  }, [materials.casing]);

  useEffect(
    () => () => {
      // The material set is disposed by its own hook — only geometry here.
      Object.values(geometry).forEach((value) => {
        if (value instanceof THREE.BufferGeometry) {
          value.dispose();
        } else {
          Object.values(value as Record<string, THREE.BufferGeometry>).forEach(
            (g) => g.dispose(),
          );
        }
      });
      bracelet.centerMesh.geometry.dispose();
      bracelet.sideMesh.geometry.dispose();
    },
    [geometry, bracelet],
  );

  const driverTargets = useMemo(
    () => [
      {
        kind: "casing" as const,
        material: materials.casing,
        source: "atelier-casing",
      },
      {
        kind: "face" as const,
        material: materials.face,
        source: "atelier-face",
      },
    ],
    [materials.casing, materials.face],
  );

  const { casing, face, glass, lume, movement } = materials;

  return (
    <group name="watch-root" rotation={[-0.36, 0, 0]}>
      {/* dial + power-reserve subdial scale */}
      <mesh geometry={geometry.dial} material={face} receiveShadow />
      <mesh geometry={geometry.reserve} material={face} />

      {/* applied indices: polished frames with luminous inlays */}
      <mesh
        geometry={geometry.indices.frame}
        material={casing}
        castShadow
        receiveShadow
      />
      <mesh geometry={geometry.indices.lume} material={lume} />
      <group position={[0, -0.44, 0.03]} rotation={[0, 0, -0.28]}>
        <mesh geometry={geometry.reserveNeedle} material={casing} />
      </group>

      {/* hand stack, frozen at 10:09:36 */}
      <mesh
        geometry={geometry.hands.hour}
        material={casing}
        rotation={[0, 0, HERO_TIME.hour]}
        castShadow
      />
      <mesh
        geometry={geometry.hands.hourLume}
        material={lume}
        rotation={[0, 0, HERO_TIME.hour]}
      />
      <mesh
        geometry={geometry.hands.minute}
        material={casing}
        rotation={[0, 0, HERO_TIME.minute]}
        castShadow
      />
      <mesh
        geometry={geometry.hands.minuteLume}
        material={lume}
        rotation={[0, 0, HERO_TIME.minute]}
      />
      <mesh
        geometry={geometry.hands.second}
        material={casing}
        rotation={[0, 0, HERO_TIME.second]}
      />
      <mesh
        geometry={geometry.hub}
        material={casing}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.13]}
      />

      {/* case, rehaut, bezel insert, domed sapphire */}
      <mesh
        geometry={geometry.case}
        material={casing}
        castShadow
        receiveShadow
      />
      <mesh geometry={geometry.rehaut} material={casing} />
      <mesh
        geometry={geometry.insert}
        material={face}
        position={[0, 0, 0.222]}
        receiveShadow
      />
      <mesh geometry={geometry.crystal} material={glass} />

      {/* screw-down crown between its guards */}
      <mesh geometry={geometry.crown} material={casing} castShadow />
      <mesh
        geometry={geometry.guard}
        material={casing}
        position={[1.13, 0.32, -0.06]}
        castShadow
      />
      <mesh
        geometry={geometry.guard}
        material={casing}
        position={[1.13, -0.32, -0.06]}
        castShadow
      />

      {/* lugs + bracelet */}
      <mesh
        geometry={geometry.lugTop}
        material={casing}
        position={[LUG_X, 0, 0]}
        castShadow
      />
      <mesh
        geometry={geometry.lugTop}
        material={casing}
        position={[-LUG_X, 0, 0]}
        castShadow
      />
      <mesh
        geometry={geometry.lugBottom}
        material={casing}
        position={[LUG_X, 0, 0]}
        castShadow
      />
      <mesh
        geometry={geometry.lugBottom}
        material={casing}
        position={[-LUG_X, 0, 0]}
        castShadow
      />
      <primitive object={bracelet.centerMesh} dispose={null} />
      <primitive object={bracelet.sideMesh} dispose={null} />

      {/* exhibition case back */}
      <mesh geometry={geometry.caseBack} material={casing} />
      <mesh
        geometry={geometry.window}
        material={glass}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.25]}
      />
      <mesh
        geometry={geometry.rotor}
        material={movement}
        position={[0, 0, -0.181]}
        rotation={[0, 0, 0.7]}
      />

      <MaterialDriver config={config} targets={driverTargets} />
    </group>
  );
}
