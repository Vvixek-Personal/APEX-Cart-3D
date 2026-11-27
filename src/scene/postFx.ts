import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Hardware post-processing chain for the daylight cycle:
 *
 *   RenderPass (HDR HalfFloat target, ACES deferred) ->
 *   UnrealBloomPass (subtle: sun glints, lamp glow, signal lenses, headlights) ->
 *   OutputPass (ACES tone-map + sRGB, driven by renderer.toneMappingExposure)
 *
 * While rendering into composer targets three skips per-material tone mapping
 * (currentRenderTarget !== null), so OutputPass is the single tone-map site —
 * identical exposure on the plain-render software-WebGL path.
 *
 * Returns null when post-processing should be skipped (software rasterizers),
 * in which case callers keep using renderer.render(scene, camera) directly.
 */
export interface PostFx {
  render(): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx | null {
  try {
    const composer = new EffectComposer(renderer);

    // 4x MSAA on the HDR buffers (WebGL2 multisample renderbuffers, resolved
    // on sample) — EffectComposer's default targets have no MSAA, and this
    // replaces the canvas-level antialias flag the composer path bypasses.
    composer.renderTarget1.samples = 4;
    composer.renderTarget2.samples = 4;

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Soft bloom: threshold sits just under sun-lit speculars & emissives so
    // daytime stays crisp while night lamps/signs/headlights pick up a glow.
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        renderer.domElement.width || 1280,
        renderer.domElement.height || 720,
      ),
      0.34, // strength — restrained, this is realism not arcade glow
      0.62, // radius
      0.82, // luminance threshold
    );
    composer.addPass(bloomPass);

    composer.addPass(new OutputPass());

    return {
      render(): void {
        composer.render();
      },
      setSize(width: number, height: number): void {
        composer.setSize(width, height);
      },
      dispose(): void {
        renderPass.dispose?.();
        bloomPass.dispose();
        composer.dispose();
      },
    };
  } catch {
    // Any failure (context quirks, missing float-buffer support) falls back
    // to the plain renderer.render path.
    return null;
  }
}
