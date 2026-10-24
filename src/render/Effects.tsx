// Post-processing: ambient occlusion, bloom, auto exposure and white balance, AgX tone mapping,
// SMAA, light vignette.

import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette, wrapEffect } from '@react-three/postprocessing';
import { Effect, ToneMappingMode } from 'postprocessing';
import { useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { pointInPolygon } from '../shell/geom2d';
import { MAX_APERTURES, apertureTarget } from './daylight';
import { controls } from './Player';
import { QUALITY } from './quality';
import { registry } from './registry';

const METER = 64;

const fullscreenVertex = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Centre-weighted log luminance of the frame, 64 × 64, mipmapped down to the average; also the
 * average colour cast (log red/green and blue/green), for white balance under lamplight.
 */
const meterMaterial = new THREE.ShaderMaterial({
  uniforms: { tInput: { value: null as THREE.Texture | null } },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tInput;
    void main() {
      vec2 uv0 = (gl_FragCoord.xy - 0.5) / ${METER}.0;
      float sum = 0.0;
      vec2 tint = vec2(0.0);
      for (int y = 0; y < 3; y++) {
        for (int x = 0; x < 3; x++) {
          vec2 uv = uv0 + (vec2(float(x), float(y)) + 0.5) / (${METER}.0 * 3.0);
          vec3 c = texture2D(tInput, uv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          sum += log2(clamp(l, 1e-4, 64.0));
          // Black pixels say nothing about the colour of the light.
          float s = smoothstep(1e-5, 1e-4, l);
          vec3 cc = max(c, vec3(1e-6));
          tint += s * vec2(log2(cc.r / cc.g), log2(cc.b / cc.g));
        }
      }
      vec2 d = (gl_FragCoord.xy / ${METER}.0) - 0.5;
      float w = mix(0.35, 1.0, exp(-dot(d, d) * 6.0));
      gl_FragColor = vec4(sum / 9.0 * w, w, tint / 9.0 * w);
    }`,
  depthTest: false,
  depthWrite: false,
});

/**
 * Eye adaptation: moves the remembered average towards this frame's, faster towards bright. Photo
 * Mode can hold it at a set average (its noisy early samples would mislead the meter).
 */
const adaptMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tMeter: { value: null as THREE.Texture | null },
    tPrev: { value: null as THREE.Texture | null },
    dt: { value: 0 },
    reset: { value: 1 },
    hold: { value: 0 },
    holdAvg: { value: 0 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tMeter;
    uniform sampler2D tPrev;
    uniform float dt;
    uniform float reset;
    uniform float hold;
    uniform float holdAvg;
    void main() {
      vec4 m = textureLod(tMeter, vec2(0.5), 10.0);
      vec3 current = vec3(m.x, m.z, m.w) / max(m.y, 1e-4);
      vec3 prev = texture2D(tPrev, vec2(0.5)).rgb;
      float rate = current.x > prev.x ? 2.8 : 1.4;
      vec3 next = reset > 0.5 ? current : prev + (current - prev) * (1.0 - exp(-dt * rate));
      if (hold > 0.5) next = vec3(holdAvg, prev.yz);
      gl_FragColor = vec4(next, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

/** The eye's adapted average luminance (linear), or null before the first frame. */
export function adaptedAverage(gl: THREE.WebGLRenderer): number | null {
  const rt = registry.adapted;
  if (!rt) return null;
  const buf = new Uint16Array(4);
  gl.readRenderTargetPixels(rt, 0, 0, 1, 1, buf);
  return 2 ** THREE.DataUtils.fromHalfFloat(buf[0]!);
}

const quadScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), meterMaterial);
quad.frustumCulled = false;
quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * Auto exposure plus white balance, like a camera. Exposure follows the average brightness of the
 * view within limits set by the time of day. By day the white reference is the light coming
 * through the openings (bluish skylight looks neutral to the eye); under downlights it corrects
 * half way, so evenings stay warm.
 */
class ExposureEffectImpl extends Effect {
  private meter = new THREE.WebGLRenderTarget(METER, METER, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  });
  private adapted = [0, 1].map(
    () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }),
  );
  private current = 0;
  private fresh = true;

  constructor() {
    super(
      'ExposureEffect',
      /* glsl */ `
      uniform sampler2D tAdapted;
      uniform vec3 exposureParams; // key, min, max
      uniform float bias;
      uniform sampler2D apTex;
      uniform int apCount;
      uniform float apWeight[${MAX_APERTURES}];
      uniform float daylight;
      uniform vec3 nightWB;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 adapted = texture2D(tAdapted, vec2(0.5)).rgb;
        float avg = exp2(adapted.x);
        float exposure = clamp(exposureParams.x / avg, exposureParams.y, exposureParams.z) * bias;
        vec3 d = vec3(0.0);
        for (int i = 0; i < ${MAX_APERTURES}; i++) {
          if (i >= apCount) break;
          d += texelFetch(apTex, ivec2(0, i), 0).rgb * apWeight[i];
        }
        float lum = dot(d, vec3(0.2126, 0.7152, 0.0722));
        vec3 dayWB = lum > 1e-5 ? mix(vec3(1.0), d.g / max(d, vec3(1e-5)), 0.55) : vec3(1.0);
        // Under lamplight: take out most of the warm cast the view actually has (like a camera's
        // auto white balance), never more than the lamps' own colour calls for, never cooling.
        vec3 lampWB = vec3(exp2(-max(adapted.y, 0.0) * 0.6), 1.0, exp2(-min(adapted.z, 0.0) * 0.6));
        lampWB = clamp(lampWB, min(nightWB, vec3(1.0)), max(nightWB, vec3(1.0)));
        vec3 wb = mix(lampWB, dayWB, daylight);
        wb /= dot(wb, vec3(0.2126, 0.7152, 0.0722));
        outputColor = vec4(inputColor.rgb * exposure * wb, inputColor.a);
      }`,
      {
        uniforms: new Map<string, THREE.Uniform>([
          ['tAdapted', new THREE.Uniform(null)],
          ['exposureParams', new THREE.Uniform(new THREE.Vector3(0.18, 1, 6))],
          ['bias', new THREE.Uniform(1)],
          ['apTex', new THREE.Uniform(apertureTarget.texture)],
          ['apCount', new THREE.Uniform(0)],
          ['apWeight', new THREE.Uniform(new Array<number>(MAX_APERTURES).fill(1))],
          ['daylight', new THREE.Uniform(1)],
          ['nightWB', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ]),
      },
    );
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number) {
    const prevTarget = renderer.getRenderTarget();
    quad.material = meterMaterial;
    meterMaterial.uniforms.tInput!.value = inputBuffer.texture;
    renderer.setRenderTarget(this.meter);
    renderer.render(quadScene, quadCam);

    const prev = this.adapted[this.current]!;
    const next = this.adapted[1 - this.current]!;
    quad.material = adaptMaterial;
    adaptMaterial.uniforms.tMeter!.value = this.meter.texture;
    adaptMaterial.uniforms.tPrev!.value = prev.texture;
    adaptMaterial.uniforms.dt!.value = Math.min(deltaTime ?? 0.016, 0.1);
    adaptMaterial.uniforms.reset!.value = this.fresh || registry.exposureReset ? 1 : 0;
    adaptMaterial.uniforms.hold!.value = registry.exposureHold === null ? 0 : 1;
    adaptMaterial.uniforms.holdAvg!.value = registry.exposureHold ?? 0;
    registry.exposureReset = false;
    renderer.setRenderTarget(next);
    renderer.render(quadScene, quadCam);
    this.current = 1 - this.current;
    this.fresh = false;
    this.uniforms.get('tAdapted')!.value = next.texture;
    registry.adapted = next;
    renderer.setRenderTarget(prevTarget);
  }

  override dispose() {
    this.meter.dispose();
    for (const t of this.adapted) t.dispose();
    super.dispose();
  }
}
const Exposure = wrapEffect(ExposureEffectImpl);

/** The openings of the room the walker is in, so white balance follows the light of that room. */
function roomApertureWeights(out: number[], dt: number) {
  const shell = registry.shell;
  if (!shell) return;
  const p = controls.position;
  const space = shell.spaces.find((sp) => pointInPolygon({ x: p.x * 1000, y: p.z * 1000 }, sp.polygon));
  const zone = space?.zone;
  const any = shell.apertures.some((a) => a.zone === zone);
  const k = Math.min(1, dt * 1.5);
  for (let i = 0; i < out.length; i++) {
    const a = shell.apertures[i];
    const want = a && (!any || a.zone === zone) ? 1 : 0;
    out[i] = out[i]! + (want - out[i]!) * k;
  }
}

function ExposureDriver({ target }: { target: React.RefObject<ExposureEffectImpl | null> }) {
  useFrame((_, dt) => {
    const u = target.current?.uniforms;
    if (!u) return;
    roomApertureWeights(u.get('apWeight')!.value as number[], dt);
    const e = registry.exposure;
    (u.get('exposureParams')!.value as THREE.Vector3).set(e.key, e.min, e.max);
    u.get('bias')!.value = e.bias;
    u.get('apCount')!.value = Math.min(registry.shell?.apertures.length ?? 0, MAX_APERTURES);
    u.get('daylight')!.value = registry.whiteBalance.daylight;
    const n = registry.whiteBalance.night;
    (u.get('nightWB')!.value as THREE.Vector3).set(n.r, n.g, n.b);
  });
  return null;
}

export function Effects() {
  const quality = useStore((s) => s.quality);
  // The path tracer computes real occlusion; screen-space AO would only darken its image.
  const photo = useStore((s) => s.photo !== null);
  const q = QUALITY[quality];
  const exposure = useRef<ExposureEffectImpl>(null);
  return (
    <>
      <ExposureDriver target={exposure} />
      <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType} enableNormalPass={false}>
        {q.ao && !photo ? <N8AO aoRadius={0.55} distanceFalloff={0.7} intensity={2.2} halfRes={q.aoHalfRes} quality={q.aoHalfRes ? 'medium' : 'high'} color="black" /> : <></>}
        {q.bloom ? <Bloom mipmapBlur intensity={0.32} luminanceThreshold={0.95} luminanceSmoothing={0.25} radius={0.7} /> : <></>}
        <Exposure ref={exposure} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
        <Vignette offset={0.32} darkness={0.42} />
      </EffectComposer>
    </>
  );
}
