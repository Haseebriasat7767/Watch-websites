/**
 * Exhibition storyboard renderer.
 *
 *   npx tsx scripts/storyboard.ts            (all chapters, desktop + mobile)
 *   npx tsx scripts/storyboard.ts dial       (one chapter)
 *
 * Browsers are not available in CI containers, so the *composition* of the
 * scroll journey is verified headlessly: for every chapter the scene sampler is
 * evaluated at the chapter's readable beat and the resulting camera pose and
 * watch transform are fed to the software rasterizer in `render.ts`.
 *
 * It answers the questions a screenshot would: is the timepiece inside the
 * frame, at the intended scale, from the intended angle — and does the camera
 * ever end up inside the case. Shading is stylised, not a PBR match.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { render } from "./render";
import { STORY_CHAPTERS, CAMERA_HOLD } from "../src/story/storyConfig";
import * as THREE from "three";
import { applyFraming, createSample, sampleStory } from "../src/three/CameraWaypoints";

const only = process.argv[2];
const sample = createSample();

mkdirSync("preview/story", { recursive: true });

/** Same viewport fit the live stage applies (see StoryWatchStage). */
const fitFactor = (width: number, height: number) =>
  Math.min(1, Math.max(0.6, width / height / 0.78));

const shots = [
  { width: 1200, height: 750, label: "desktop" },
  { width: 420, height: 880, label: "mobile" },
] as const;

console.log("AURELIS · exhibition storyboard");

for (const chapter of STORY_CHAPTERS) {
  if (only && chapter.id !== only) continue;

  // Evaluate the journey exactly where the chapter's narrative is legible.
  const beat = chapter.start + (chapter.end - chapter.start) * (CAMERA_HOLD * 0.5);
  sampleStory(beat, sample);

  for (const shot of shots) {
    const fit = fitFactor(shot.width, shot.height);
    const label = `story/${chapter.id}-${shot.label}`;

    // Identical framing maths to the live camera rig.
    const position = new THREE.Vector3(...sample.position);
    const target = new THREE.Vector3(...sample.target);
    applyFraming(position, target, sample, shot.width / shot.height);
    render({
      width: shot.width,
      height: shot.height,
      stageScale: fit,
      label,
      floor: false,
      pose: {
        position: [sample.watchPosition[0] * fit, sample.watchPosition[1], sample.watchPosition[2]],
        rotation: sample.watchRotation,
        scale: sample.watchScale,
        exhibition: sample.exhibition,
      },
      view: {
        position: [position.x, position.y, position.z],
        target: [target.x, target.y, target.z],
        fov: sample.fov,
      },
    });

    // PNG is what a human can actually look at.
    const ppm = `preview/${label}.ppm`;
    if (existsSync(ppm)) {
      try {
        execFileSync("convert", [ppm, `preview/${label}.png`]);
      } catch {
        console.log("    (ImageMagick unavailable — PPM only)");
      }
    }
  }
}

console.log("done");
