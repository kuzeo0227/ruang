// One shader for everything outside the windows: a physical (Preetham) sky with clouds,
// stars at night, and the masked landscape photo re-lit for the time of day.
// Sky scattering and cloud code adapted from three.js examples/jsm/objects/Sky.js (MIT).

import * as THREE from 'three';

export interface BackdropMeta {
  elMinDeg: number;
  elMaxDeg: number;
  uNorth: number;
  hazeSRGB: [number, number, number];
  groundSRGB: [number, number, number];
  /** There is a night-lights texture (night_6k / night_3k.webp): lit windows, street lamps. */
  night?: boolean;
  /** Radiance of the brightest night lights (the texture is normalised to them). */
  nightPeak?: number;
  /** Strength of the light-pollution glow over the horizon at night (city views). */
  skyGlow?: number;
}

const vertexShader = /* glsl */ `
uniform vec3 sunDirection;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
varying vec3 vDir;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
const float e = 2.718281828459045;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vDir = worldPosition.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  gl_Position.z = gl_Position.w;
  vSunDirection = normalize(sunDirection);
  vSunE = sunIntensity(vSunDirection.y);
  // Below the horizon the Rayleigh term fades a little so twilight deepens.
  vSunfade = clamp(exp(min(vSunDirection.y, 0.0) * 2.0), 0.0, 1.0);
  float rayleighCoefficient = rayleigh - (1.0 - vSunfade);
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie(turbidity) * mieCoefficient;
}`;

const fragmentShader = /* glsl */ `
varying vec3 vDir;
varying vec3 vSunDirection;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
uniform float mieDirectionalG;
uniform float skyScale;
uniform float sunDiscScale;
uniform float night;
// How much of the night sky reaches the room (the sky in view is drawn brighter than a real
// night sky so the window doesn't read as a black hole; the light it sends in stays realistic).
uniform float nightLight;
uniform float twilight;
uniform float cloudCoverage;
uniform float cloudScale;
uniform float time;
uniform sampler2D landscape;
uniform float hasLandscape;
uniform float elMin;
uniform float elMax;
uniform float uNorth;
uniform vec3 landLight;
uniform vec3 groundColor;
uniform vec3 hazeColor;
uniform float hazeAmount;
// Night lights: the brightest lights' radiance (the texture is normalised to them), and how far
// they are switched on (dusk to night).
uniform sampler2D landNight;
uniform float hasNight;
uniform float nightPeak;
uniform float cityLights;
uniform float skyGlow;

const float pi = 3.141592653589793;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99995667694644844;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase(float cosTheta) { return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0)); }
float hgPhase(float cosTheta, float g) {
  float g2 = pow(g, 2.0);
  float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
  return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
}
vec2 gradient(vec2 i) {
  vec3 p = fract(i.xyx * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.xx + p.yz) * p.zy) * 2.0 - 1.0;
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(gradient(i), f);
  float b = dot(gradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(gradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(gradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
}
float fbm(vec2 p) {
  float r = 0.0;
  float amp = 1.0;
  for (int i = 0; i < 4; i++) { r += amp * noise(p); amp *= 0.5; p = p * 2.0 + 1.7; }
  return r;
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 skyRadiance(vec3 direction, out vec3 Fex) {
  float zenithAngle = acos(max(0.0, direction.y));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  Fex = exp(-(vBetaR * sR + vBetaM * sM));
  float cosTheta = dot(direction, vSunDirection);
  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase(cosTheta, mieDirectionalG);
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)), clamp(pow(1.0 - vSunDirection.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  // The model's ambient floor doesn't depend on the sun, so fade it out with the night.
  return Lin * 0.04 + (L0 * 0.04 + vec3(0.0, 0.0003, 0.00075)) * (1.0 - night);
}

void main() {
  vec3 direction = normalize(vDir);
  vec3 Fex;
  vec3 sky = skyRadiance(direction, Fex);
  float cosTheta = dot(direction, vSunDirection);

  // Clouds lit by the sky itself (from three.js Sky).
  if (direction.y > 0.0 && cloudCoverage > 0.0) {
    vec2 cloudUV = direction.xz / (direction.y * 0.55) * cloudScale;
    float cloudNoise = clamp(fbm(cloudUV * 1000.0 + time * 0.002) * 0.7 + 0.5, 0.0, 1.0);
    float region = noise(cloudUV * 300.0) * 0.37 + 0.5;
    float cov = clamp(cloudCoverage + (region - 0.5) * 0.6, 0.0, 1.0);
    float threshold = 1.0 - cov;
    float cloudMask = smoothstep(threshold, threshold + 0.3, cloudNoise) * smoothstep(0.0, 0.06, direction.y);
    vec3 sunColor = vSunE * Fex * 0.22 * 0.04;
    float depth = max(0.0, cloudNoise - threshold);
    float beer = exp(depth * -4.0);
    float shade = mix(0.45, 1.0, clamp(beer * (1.0 - beer * beer) * 2.6, 0.0, 1.0));
    vec3 cloudColor = sky * 0.6 + vec3(0.0, 0.0003, 0.00075) + sunColor * shade + sunColor * 0.25;
    sky = mix(sky, cloudColor, cloudMask * 0.9);
  }

  // Sun disc, kept moderate so reflections and bloom stay well behaved.
  float sundisc = clamp((cosTheta - sunAngularDiameterCos) * 50000.0, 0.0, 1.0);
  sky += sundisc * min(vSunE * Fex, vec3(80.0)) * sunDiscScale;

  // Twilight: the Preetham model goes dark as soon as the sun sets, so add the afterglow towards
  // the sunset and the blue-hour dome, fading over civil twilight.
  if (twilight > 0.0) {
    vec3 sunFlat = normalize(vec3(vSunDirection.x, 0.0, vSunDirection.z) + vec3(1e-5, 0.0, 0.0));
    vec3 dirFlat = normalize(vec3(direction.x, 0.0, direction.z) + vec3(1e-5, 0.0, 0.0));
    float toward = dot(dirFlat, sunFlat) * 0.5 + 0.5;
    float h = max(direction.y, 0.0);
    vec3 glow = mix(vec3(1.0, 0.42, 0.16), vec3(0.95, 0.55, 0.45), sqrt(h)) * pow(toward, 3.0) * exp(-h * 5.0);
    vec3 dome = mix(vec3(0.36, 0.44, 0.78), vec3(0.12, 0.18, 0.45), pow(h, 0.6));
    sky += (glow * 0.7 + dome * 0.3) * twilight;
  }

  // Night: deep blue gradient and stars.
  float up = max(direction.y, 0.0);
  // A dark country sky: hundreds of times dimmer than a lamp-lit room, as it looks from inside.
  vec3 nightSky = mix(vec3(0.00012, 0.00016, 0.0003), vec3(0.00003, 0.00004, 0.0001), pow(up, 0.5));
  vec3 starCell = floor(direction * 420.0);
  float star = step(0.9975, hash13(starCell)) * smoothstep(0.0, 0.15, up);
  float twinkle = 0.6 + 0.4 * hash13(starCell + 7.0);
  nightSky += star * twinkle * 0.012;
  // A city's own glow, reflected off the haze over it: orange low down, fading upwards.
  nightSky += vec3(0.00075, 0.0004, 0.0002) * skyGlow * cityLights * exp(-up * 7.0);
  sky = sky * skyScale + nightSky * night * nightLight;

  vec3 color = sky;
  if (hasLandscape > 0.5) {
    float el = degrees(asin(clamp(direction.y, -1.0, 1.0)));
    float az = atan(direction.x, -direction.z);
    float u = fract(uNorth + az / (2.0 * pi));
    vec3 land;
    float mask;
    if (el < elMin) {
      land = srgbToLinear(groundColor);
      mask = 1.0;
    } else {
      vec4 t = texture2D(landscape, vec2(u, (el - elMin) / (elMax - elMin)));
      land = srgbToLinear(t.rgb);
      mask = el > elMax ? 0.0 : t.a;
      land = mix(land, srgbToLinear(groundColor), 1.0 - smoothstep(elMin, elMin + 8.0, el));
    }
    land *= landLight * mix(1.0, nightLight, night);
    // Distant haze takes on the current sky colour near the horizon.
    float haze = hazeAmount * (1.0 - smoothstep(0.0, 6.0, abs(el))) ;
    vec3 horizonSky = skyRadiance(normalize(vec3(direction.x, 0.02, direction.z)), Fex) * skyScale + nightSky * night * nightLight;
    land = mix(land, horizonSky, haze);
    // Lit windows and street lamps (already dimmed by distance in the texture).
    if (hasNight > 0.5 && cityLights > 0.0 && el >= elMin) {
      vec3 lights = srgbToLinear(texture2D(landNight, vec2(u, (el - elMin) / (elMax - elMin))).rgb);
      land += lights * nightPeak * cityLights * mix(1.0, nightLight, night);
    }
    color = mix(sky, land, mask);
  }
  gl_FragColor = vec4(color, 1.0);
}`;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'RuangSky',
    uniforms: {
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      // Kuala Lumpur's humid air: a hazier, whiter sky than a dry clear day.
      turbidity: { value: 4 },
      rayleigh: { value: 1.2 },
      mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 },
      // Keeps clear-sky light in a realistic ratio to direct sun (about 1:4 on a horizontal surface).
      skyScale: { value: 0.25 },
      sunDiscScale: { value: 0.25 },
      night: { value: 0 },
      nightLight: { value: 1 },
      cloudCoverage: { value: 0.32 },
      cloudScale: { value: 0.0002 },
      time: { value: 0 },
      landscape: { value: null },
      hasLandscape: { value: 0 },
      elMin: { value: -80 },
      elMax: { value: 10 },
      uNorth: { value: 0 },
      landLight: { value: new THREE.Vector3(1, 1, 1) },
      groundColor: { value: new THREE.Vector3(0.45, 0.38, 0.3) },
      hazeColor: { value: new THREE.Vector3(0.6, 0.65, 0.7) },
      hazeAmount: { value: 0.15 },
      twilight: { value: 0 },
      landNight: { value: null },
      hasNight: { value: 0 },
      nightPeak: { value: 0.04 },
      cityLights: { value: 0 },
      skyGlow: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
}

export function applyBackdrop(mat: THREE.ShaderMaterial, tex: THREE.Texture | null, meta: BackdropMeta | null, nightTex: THREE.Texture | null = null) {
  mat.uniforms.landscape!.value = tex;
  mat.uniforms.hasLandscape!.value = tex && meta ? 1 : 0;
  mat.uniforms.landNight!.value = nightTex;
  mat.uniforms.hasNight!.value = nightTex && meta ? 1 : 0;
  mat.uniforms.nightPeak!.value = meta?.nightPeak ?? 0.04;
  mat.uniforms.skyGlow!.value = meta?.skyGlow ?? 0;
  if (meta) {
    mat.uniforms.elMin!.value = meta.elMinDeg;
    mat.uniforms.elMax!.value = meta.elMaxDeg;
    mat.uniforms.uNorth!.value = meta.uNorth;
    (mat.uniforms.groundColor!.value as THREE.Vector3).set(...meta.groundSRGB);
    (mat.uniforms.hazeColor!.value as THREE.Vector3).set(...meta.hazeSRGB);
  }
}

/** The one sky used everywhere: the backdrop sphere, the sky environment map and the daylight capture. */
export const skyMaterial = createSkyMaterial();
