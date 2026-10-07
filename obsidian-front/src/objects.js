/**
 * objects.js — 3D object factories for each space entity type.
 * Une fabrique par corps céleste de la taxonomie (superamas, amas, galaxie,
 * étoile, planète, planète naine, petit corps, lune) + createBody(), le
 * dispatcher générique utilisé par les vues.
 */
import * as THREE from 'three';
import { VisualType } from './universe.js';

export const COLORS = {
  planet:       [0xF59E0B, 0xEF4444, 0x10B981, 0xF97316, 0xEC4899, 0x84CC16],
  // Teintes pâles glacées pour les planètes naines.
  dwarfPlanet:  [0xE5E7EB, 0xD8E3F0, 0xF3E8FF, 0xE0F2FE, 0xCBD5E1, 0xA7F3D0],
  // Gris rocheux pour les petits corps.
  smallBody:    [0x6B7280, 0x9CA3AF, 0x78716C, 0x8E9096, 0x7F8C8D, 0x57534E],
  // Teintes vertes : cohérentes avec la pastille « Lune / Note » de la légende.
  moon:         [0x34D399, 0x10B981, 0x6EE7B7, 0x059669, 0x2DD4BF, 0x14B8A6],
};

/**
 * Couleur d'un corps noir à la température T (K) — approximation de Tanner Helland.
 * 3 000 K : naine rouge, 5 800 K : Soleil, 10 000 K : étoile blanc-bleu.
 */
export function kelvinColor(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = v => Math.max(0, Math.min(255, v)) / 255;
  return new THREE.Color(c(r), c(g), c(b));
}

/** Plus un dossier est riche, plus son étoile est chaude (de naine rouge à étoile blanche). */
export function starTemperature(node) {
  const k = Math.min(1, Math.log10(1 + (node.markdownCount || 0)) / 2.2);
  return 3300 + k * 6200;
}

function pickColor(arr, idx) {
  return arr[idx % arr.length];
}

/**
 * Rayons visuels (half-bounding) utilisés par les fabriques 3D.
 * Exportés pour que le layout orbital (`orbitLayout`) dimensionne ses anneaux
 * à partir des mêmes valeurs que celles réellement rendues.
 */
export function galaxyRadius(node) {
  return 20 + Math.min(node.markdownCount * 0.5, 26);
}

export function superclusterRadius(node) {
  return galaxyRadius(node) * 1.8;
}

export function clusterRadius(node) {
  return galaxyRadius(node) * 1.25;
}

export function starRadius(node) {
  return (8 + Math.min(node.markdownCount * 0.3, 12)) * 2.6;
}

/** Rayon visuel d'une étoile-enfant (point brillant, jamais un soleil complet). */
export function compactStarRadius(node) {
  return (2.5 + Math.min(node.markdownCount * 0.15, 3.5)) * 2.2;
}

export function planetRadius(node) {
  return (4 + Math.min(node.markdownCount * 0.5, 8)) * 1.8;
}

export function dwarfPlanetRadius(node) {
  const size = 3 + Math.min(node.markdownCount * 0.4, 6);
  return size * 1.8;
}

export function smallBodyRadius(node) {
  const size = 1.5 + Math.min(node.markdownCount * 0.3, 4);
  return size * 2.5;
}

export function moonRadius(node) {
  const sizeInBytes = node.size || 0;
  const logScale = Math.log10(Math.max(1, sizeInBytes));
  return (1.0 + Math.min(logScale * 0.6, 2.5)) * 2.4;
}

/** Rayon visuel du corps correspondant au type céleste d'un nœud. */
export function bodyRadius(node) {
  switch (node.visualType) {
    case VisualType.SUPERCLUSTER: return superclusterRadius(node);
    case VisualType.CLUSTER:      return clusterRadius(node);
    case VisualType.GALAXY:       return galaxyRadius(node);
    case VisualType.STAR:         return compactStarRadius(node);
    case VisualType.DWARF_PLANET: return dwarfPlanetRadius(node);
    case VisualType.SMALL_BODY:   return smallBodyRadius(node);
    case VisualType.PLANET:       return planetRadius(node);
    default:                      return moonRadius(node);
  }
}

/**
 * Texture de lueur : dégradé radial opaque au centre, nul au bord.
 * Générée une seule fois et partagée par tous les astres.
 */
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.11)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.userData.shared = true;
  return _glowTex;
}

/**
 * Ajoute une lueur au groupe d'un astre.
 *
 * Un sprite à dégradé plutôt qu'une sphère `BackSide` : la sphère a un bord
 * franc et une luminosité constante, elle se lisait comme un disque gris posé
 * derrière l'astre au lieu d'un halo.
 */
function addGlow(group, color, radius, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color,
    transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(radius * 2, radius * 2, 1);
  group.add(sprite);
  return sprite;
}

/**
 * Build a Galaxy — bulbe central lumineux + disque à bras spiraux.
 *
 * L'ancienne version était une grosse sphère opaque : à plusieurs
 * galaxies à l'écran elles se chevauchaient en gros blocs de couleur.
 * Un disque de particules se lit en profondeur et laisse voir ce qui
 * est derrière.
 */
export function createGalaxy(scene, node, position, index, opts = {}) {
  const sizeMul = opts.sizeMul ?? 1;
  const type = opts.type ?? 'galaxy';

  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type, index };

  const rnd = seededRandom(nodeSeed(node, 'galaxy:'));
  const radius = galaxyRadius(node) * sizeMul;   // rayon du disque
  const bulge = radius * 0.2;
  group.userData.visualRadius = radius;

  // Cible de clic : sphère transparente couvrant le disque. Sans elle il
  // faudrait viser le bulbe central au pixel près.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.8, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.userData = { isCore: true };
  group.add(hit);

  // Inclinaison propre à chaque galaxie (on ne les voit pas toutes de face) ;
  // la rotation du disque se fait autour de son propre axe, dans `spin`.
  const tilt = new THREE.Group();
  tilt.rotation.set((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9);
  const spin = new THREE.Group();
  tilt.add(spin);
  group.add(tilt);
  group.userData.spin = spin;

  // Bulbe : vieilles étoiles, jaune orangé.
  addGlow(spin, 0xFFE2B0, bulge * 2.6, 0.9);
  addGlow(spin, 0xFFF4E0, bulge * 1.1, 0.9);
  addGlow(group, 0xB8C8FF, radius * 1.05, 0.12);   // halo diffus du disque

  // Spirale logarithmique : r = a·e^(b·θ). 2 à 4 bras selon le dossier.
  const ARMS = 2 + Math.floor(rnd() * 3);
  const pitch = 0.22 + rnd() * 0.12;                // tan de l'angle d'ouverture
  const armAngle = r => Math.log(Math.max(r, bulge * 0.5) / (bulge * 0.5)) / pitch;

  const N = Math.min(2200 + node.markdownCount * 40, 6000);
  const stars = { pos: [], col: [] };
  const knots = { pos: [], col: [] };
  const dust = { pos: [] };
  const cBulge = new THREE.Color(0xFFD9A0);
  const cDisc = new THREE.Color(0xF2E6D8);
  const cYoung = new THREE.Color(0xA9C4FF);
  const cHII = new THREE.Color(0xFF6FA8);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

  for (let i = 0; i < N; i++) {
    // Profil exponentiel : densité forte au centre, qui s'éteint vers le bord.
    const r = Math.min(radius, bulge * 0.3 + (-Math.log(1 - rnd() * 0.97)) * radius * 0.28);
    const inArm = rnd() < 0.72;
    const arm = Math.floor(rnd() * ARMS);
    let theta = armAngle(r) + (arm / ARMS) * Math.PI * 2;
    theta += inArm ? gauss() * (0.18 + 0.25 * (r / radius)) : rnd() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const thick = radius * (r < bulge ? 0.12 : 0.025);
    const y = gauss() * thick;

    const k = r / radius;
    const c = r < bulge * 1.4
      ? cBulge.clone().lerp(cDisc, r / (bulge * 1.4))
      : inArm ? cDisc.clone().lerp(cYoung, Math.min(1, k * 1.4)) : cDisc.clone().multiplyScalar(0.55);
    const b = 0.55 + 0.45 * rnd();
    stars.pos.push(x, y, z);
    stars.col.push(c.r * b, c.g * b, c.b * b);

    // Régions HII (formation d'étoiles) : points roses sur les bras, à mi-disque.
    if (inArm && k > 0.3 && k < 0.9 && rnd() < 0.035) {
      knots.pos.push(x, y, z);
      knots.col.push(cHII.r, cHII.g, cHII.b);
    }
    // Bandes de poussière : le long du bord intérieur des bras.
    if (inArm && k > 0.15 && k < 0.85 && rnd() < 0.35) {
      const dt = theta - 0.12;
      dust.pos.push(Math.cos(dt) * r, y * 0.5, Math.sin(dt) * r);
    }
  }

  const points = (data, size, opacity, blending, colors = true) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
    if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: true, vertexColors: colors, color: colors ? 0xffffff : 0x0a0604,
      transparent: true, opacity, depthWrite: false, blending,
    }));
  };
  spin.add(points(dust, 2.4, 0.22, THREE.NormalBlending, false));
  spin.add(points(stars, 1.1, 0.85, THREE.AdditiveBlending));
  if (knots.pos.length) spin.add(points(knots, 2.2, 0.9, THREE.AdditiveBlending));

  scene.add(group);
  return group;
}

/**
 * Superamas — la plus vaste structure : grand disque de galaxies.
 */
export function createSupercluster(scene, node, position, index) {
  return createGalaxy(scene, node, position, index, {
    sizeMul: 1.8, type: 'supercluster',
  });
}

/**
 * Amas de galaxies — disque intermédiaire entre superamas et galaxie.
 */
export function createCluster(scene, node, position, index) {
  return createGalaxy(scene, node, position, index, {
    sizeMul: 1.25, type: 'cluster',
  });
}

/**
 * Texture procédurale des étoiles lointaines : cœur bokeh rond + croix de
 * diffraction anamorphique (spikes horizontaux/verticaux). Générée une fois,
 * partagée par toutes les étoiles-compactes.
 */
let _starSpikeTex = null;
function starSpikeTexture() {
  if (_starSpikeTex) return _starSpikeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const cx = 128, cy = 128;

  // Noyau bokeh
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 128);
  core.addColorStop(0.00, 'rgba(255,255,255,1)');
  core.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  core.addColorStop(0.55, 'rgba(255,255,255,0.10)');
  core.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 256, 256);

  // Spikes : rayons très allongés, doux
  ctx.globalCompositeOperation = 'lighter';
  const spike = (rot) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(1, 0.14);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
    g.addColorStop(0.00, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.30, 'rgba(255,255,255,0.35)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-128, -128, 256, 256);
    ctx.restore();
  };
  spike(0);
  spike(Math.PI / 2);

  _starSpikeTex = new THREE.CanvasTexture(c);
  _starSpikeTex.userData.shared = true;
  return _starSpikeTex;
}

/**
 * Étoile compacte — représentation d'un nœud « étoile » en orbite autour d'un
 * autre astre. Évite de voir plusieurs soleils complets dans une même vue :
 * seuls des billboards à croix de diffraction, et le dossier devient un vrai
 * soleil à l'entrée.
 */
function createCompactStar(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'star', index };

  const color = kelvinColor(starTemperature(node));
  const size = 2.5 + Math.min(node.markdownCount * 0.15, 3.5);
  group.userData.visualRadius = compactStarRadius(node);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: starSpikeTexture(),
    color,
    transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(size * 6, size * 6, 1);
  group.add(sprite);

  // Sphère de clic invisible : cible fiable et taille constante.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(size * 1.8, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.userData = { isCore: true };
  group.add(hit);

  scene.add(group);
  return group;
}

/**
 * Build a Star mesh — sun with GPU-animated plasma surface, volumetric corona
 * and solar eruptive particles. Everything animates in the shaders (uTime),
 * zero per-frame CPU cost.
 */
export function createStar(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'star', index };

  const color = kelvinColor(starTemperature(node));
  const size = 8 + Math.min(node.markdownCount * 0.3, 12);
  group.userData.visualRadius = starRadius(node);   // couronne + lueur

  // `sunUniforms` est alimenté par animateObjects pour animer tous les shaders
  // du soleil (bouture plasma, couronne, protubérances) d'un seul coup.
  const sunUniforms = [];

  // ── Surface plasma animée ──
  // Shader 100 % GPU : fBm avec domain warp qui « bout » en continu,
  // granulation (taches claires/sombres), assombrissement du limbe,
  // et éruptions brillantes localisées qui passent.
  const plasmaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vWorld;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSize;
      varying vec3 vN;
      varying vec3 vWorld;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
              mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
          mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
              mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.05;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 q = vWorld / uSize;

        // Le plasma « bout » : le bruit domine le domaine de façon continue
        float wob = fbm(q * 3.0 + vec3(uTime * 0.15, uTime * 0.1, 0.0));
        vec3 p = q + vec3(wob * 0.7, wob * 0.45, wob * 0.3);
        float n = fbm(p * 2.2 + vec3(0.0, uTime * 0.06, 0.0));

        // Granulation : taches chaudes vs pores sombres
        float spot = smoothstep(0.40, 0.72, n);

        // Palette plasma dérivée de la température de l'étoile : une naine rouge
        // bout en rouge sombre, une étoile chaude en blanc bleuté.
        vec3 deep = uColor * vec3(0.55, 0.30, 0.20);
        vec3 mid  = uColor * 0.95;
        vec3 hot  = mix(uColor, vec3(1.0), 0.6);

        vec3 col = mix(deep, mid, spot);
        col = mix(col, hot, smoothstep(0.55, 0.92, n) * 0.85);
        col *= 0.7 + 0.55 * spot;

        // Assombrissement du limbe (là où la surface est tangentielle à la vue)
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = 1.0 - abs(dot(normalize(vN), viewDir));
        col *= 1.0 - pow(fres, 2.2) * 0.7;

        // Éruptions brillantes localisées qui dérivent à la surface
        float burst = smoothstep(0.80, 0.98, fbm(q * 5.0 + vec3(uTime * 0.3, uTime * 0.2, 0.0)));
        col = mix(col, vec3(1.0, 0.95, 0.75) * 1.5, burst * 0.45);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  sunUniforms.push(plasmaMat.uniforms.uTime);

  const core = new THREE.Mesh(new THREE.SphereGeometry(size, 48, 48), plasmaMat);
  core.userData = { isCore: true, isSun: true };
  group.add(core);

  // ── Couronne diffuse ──
  // Sphère BackSide additive. La lueur ne dépend pas de l'angle de la surface
  // (ce qui dessinait une « bulle » au contour net) mais de la distance entre
  // le rayon de vue et le centre du soleil : forte au ras du disque, nulle
  // avant le bord de la sphère — aucune frontière visible.
  const CORONA_SCALE = 2.4;
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOuter: { value: size * CORONA_SCALE },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vCenter;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSize;
      uniform float uOuter;
      varying vec3 vWorld;
      varying vec3 vCenter;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
              mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
          mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
              mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.05;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // Distance minimale entre le rayon de vue et le centre du soleil.
        vec3 dir = normalize(vWorld - cameraPosition);
        float d = length(cross(vCenter - cameraPosition, dir));
        float t = clamp((d - uSize) / (uOuter - uSize), 0.0, 1.0);
        float fall = pow(1.0 - t, 3.2);

        float n = fbm((vWorld - vCenter) / (uSize * 0.42) + vec3(uTime * 0.03, uTime * 0.02, 0.0));
        // Filaments radiaux, discrets
        float filaments = fbm(normalize(vWorld - vCenter) * 3.0 + uTime * 0.05 + n);
        float glow = fall * (0.55 + 0.45 * n) * (0.75 + 0.35 * filaments);

        gl_FragColor = vec4(uColor * glow * 1.5, glow * 0.55);
      }
    `,
  });
  sunUniforms.push(coronaMat.uniforms.uTime);

  const corona = new THREE.Mesh(new THREE.SphereGeometry(size * CORONA_SCALE, 48, 48), coronaMat);
  group.add(corona);

  // ── Protubérances / éruptions solaires ──
  // Particules animées par le vertex shader : elles jaillissent de la surface
  // le long d'une boucle magnétique, s'éloignent puis s'éteignent. zéro CPU.
  // uColor = couleur du soleil : les éruptions sont de la même teinte.
  const N_ERUPT = 700;
  const origin = new Float32Array(N_ERUPT * 3);
  const dir = new Float32Array(N_ERUPT * 3);
  const seed = new Float32Array(N_ERUPT);
  const ev = new THREE.Vector3();
  for (let i = 0; i < N_ERUPT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    ev.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    const r0 = size * (1.02 + Math.random() * 0.12);
    origin[i * 3] = ev.x * r0;
    origin[i * 3 + 1] = ev.y * r0;
    origin[i * 3 + 2] = ev.z * r0;
    const d = ev.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35,
    )).normalize();
    dir[i * 3] = d.x;
    dir[i * 3 + 1] = d.y;
    dir[i * 3 + 2] = d.z;
    seed[i] = Math.random();
  }
  const eruptGeo = new THREE.BufferGeometry();
  eruptGeo.setAttribute('position', new THREE.BufferAttribute(origin, 3));
  eruptGeo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  eruptGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  // Grosse bounding sphere : les particules s'éloignent bien au-delà de la
  // surface, sinon le frustum culling les couperait.
  eruptGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), size * 6);

  const eruptMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aDir;
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vAlpha;
      varying float vBright;
      void main() {
        // Cycle : chaque particule a une éruption périodique déphasée
        float t = fract(uTime * 0.14 + aSeed);

        // Trajectoire : éjection radiale accélérée + dérive latérale ondulée
        vec3 p = position
          + aDir * (t * t * uSize * 3.0)
          + vec3(sin(t * 6.283 + aSeed * 100.0), 0.0, cos(t * 6.283 + aSeed * 90.0))
              * (t * uSize * 0.9);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (3.2 - t * 2.0) * (320.0 / -mv.z);
        gl_Position = projectionMatrix * mv;

        vAlpha = (1.0 - t) * (1.0 - t * 0.5);
        vBright = 0.4 + 0.6 * sin(t * 3.1415);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      varying float vBright;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * vBright * 1.8, a * vAlpha);
      }
    `,
  });
  sunUniforms.push(eruptMat.uniforms.uTime);

  const eruptions = new THREE.Points(eruptGeo, eruptMat);
  group.add(eruptions);

  group.userData.sunUniforms = sunUniforms;

  // Lueur diffuse en sprite derrière la couronne : donne de la profondeur.
  addGlow(group, color, size * 2.2, 0.45);

  // Disque protoplanétaire : voile de poussière diffus, fondu aux deux bords.
  // (Un anneau plat et uniforme se lisait comme un trait blanc net.)
  const dIn = size * 1.35;
  const dOut = size * 2.7;
  const discGeo = new THREE.RingGeometry(dIn, dOut, 128, 1);
  const duv = discGeo.attributes.uv;
  const dpos = discGeo.attributes.position;
  for (let k = 0; k < duv.count; k++) {
    duv.setXY(k, (Math.hypot(dpos.getX(k), dpos.getY(k)) - dIn) / (dOut - dIn), 0.5);
  }
  const ring = new THREE.Mesh(
    discGeo,
    new THREE.MeshBasicMaterial({
      color, map: _makeDiscTexture(), side: THREE.DoubleSide,
      transparent: true, opacity: 0.28, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2.5;
  group.add(ring);

  // Vraie source de lumière : la scène est éclairée par l'étoile.
  // Lumière solaire : sans atténuation (à l'échelle d'un système, la chute en 1/r²
  // rendrait les planètes externes noires), légèrement plus blanche que le disque.
  const sunlight = new THREE.PointLight(color.clone().lerp(new THREE.Color(0xffffff), 0.55), 1.7, 0, 0);
  group.add(sunlight);

  scene.add(group);
  return group;
}

// ─── Planètes uniques : textures procédurales seedées ────────────────────────
// Chaque planète reçoit une surface générée à partir d'un seed stable
// (dérivé du chemin du nœud) : deux planètes ne se ressemblent jamais, sans
// aucun asset externe.

function _lerp(a, b, t) { return a + (b - a) * t; }

function _hash2(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function _vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = (x - xi), yf = (y - yi);
  const ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf);
  return _lerp(
    _lerp(_hash2(xi, yi, s), _hash2(xi + 1, yi, s), ux),
    _lerp(_hash2(xi, yi + 1, s), _hash2(xi + 1, yi + 1, s), ux),
    uy,
  );
}

function _fbm(x, y, oct, s) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * _vnoise(x * f, y * f, s);
    f *= 2.07;
    a *= 0.5;
  }
  return v;
}

// Générateur pseudo-aléatoire seedé : un astre garde le même aspect à chaque visite.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nodeSeed(node, salt = '') {
  return _hashName(`${salt}${node.path || node.name}`) || 1;
}

const TEXTURE_SLOTS = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'bumpMap'];

/**
 * Libère la mémoire GPU d'un objet et de ses descendants (géométries, matériaux,
 * textures générées). Les textures partagées entre astres sont conservées.
 */
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const slot of TEXTURE_SLOTS) {
        const tex = m[slot];
        if (tex && !tex.userData?.shared) tex.dispose();
      }
      if (m.uniforms) {
        for (const u of Object.values(m.uniforms)) {
          if (u?.value?.isTexture && !u.value.userData?.shared) u.value.dispose();
        }
      }
      m.dispose();
    }
  });
}

function _hashName(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PLANET_ARCHETYPES = ['rocky', 'ocean', 'gas', 'ice', 'volcanic'];

// Teinte d'accent par archétype : sert à la lueur, à l'atmosphère et aux
// anneaux pour que toute la planète soit cohérente.
const ARCHETYPE_COLOR = {
  rocky:     new THREE.Color(0xC08A5E),
  ocean:     new THREE.Color(0x2F6FD0),
  gas:       new THREE.Color(0xE8B465),
  ice:       new THREE.Color(0x9FD8E8),
  volcanic:  new THREE.Color(0xF2621E),
};

const ARCHETYPE_ATMO = {
  rocky:     new THREE.Color(0xBFD8F0),
  ocean:     new THREE.Color(0x5AA2F0),
  gas:       new THREE.Color(0xF2D9A8),
  ice:       new THREE.Color(0xC9E8F2),
  volcanic:  new THREE.Color(0xF9A15C),
};

/**
 * Rend raccordable horizontalement une fonction de texture f(lon) : sur le
 * dernier quart, on fond f(lon) vers f(lon − 2π), qui vaut exactement le bord
 * gauche en lon = 2π. Sans ça, une couture verticale nette barre chaque astre.
 */
function _seamless(lon, f) {
  const w = _ss(lon / (Math.PI * 2), 0.75, 1);
  if (w <= 0) return f(lon);
  const a = f(lon);
  const b = f(lon - Math.PI * 2);
  return Array.isArray(a) ? a.map((v, k) => v + (b[k] - v) * w) : a + (b - a) * w;
}

// Lissage doux (smoothstep) : contraste net mais sans aliasing.
function _ss(t, a, b) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Calcule la couleur [r,g,b] d'un texel (lon, lat) en radians, seedé. */
function _planetPixel(lon, lat, x, y, s, archetype) {
  let r, g, b;

  if (archetype === 'ocean') {
    // Océan → continents avec bathymétrie. Le contraste est fort pour que la
    // planète soit reconnaissable même petite.
    const c = _fbm(lon * 1.6, lat * 2.2 + s * 0.01, 5, s * 1.7);
    const land = _ss(c, 0.46, 0.58);
    if (land > 0.05) {
      const h = _fbm(lon * 3.2, lat * 3.6 + 7.3, 4, s * 2.1);
      const peak = _ss(h, 0.62, 0.82);   // montagnes claires
      r = _lerp(0.16, 0.62, peak); g = _lerp(0.52, 0.55, peak); b = _lerp(0.18, 0.30, peak);
    } else {
      const co = _ss(c, 0.26, 0.44);     // abaissement vers la côte
      r = _lerp(0.015, 0.20, co); g = _lerp(0.06, 0.50, co); b = _lerp(0.34, 0.92, co);
    }
  } else if (archetype === 'gas') {
    // Ceintures turbulentes très contrastées : deux palettes (chaude / froide)
    // tirées au sort par seed.
    const sharp = 2.6 + _fbm(lon * 0.4, lat * 3.0, 3, s + 9) * 2.4;
    const band = Math.sin(lat * sharp + _fbm(lon * 1.3, lat * 5.0, 4, s * 1.3) * 1.8);
    const warm = (s & 1) === 0;
    const A = warm ? [1.00, 0.84, 0.60] : [0.55, 0.86, 1.00];
    const B = warm ? [0.58, 0.22, 0.08] : [0.06, 0.24, 0.55];
    const mag = _ss(band, -0.85, 0.85);
    const glint = 0.9 + 0.25 * _fbm(lon * 2.0, lat * 2.0, 3, s + 3);
    r = glint * _lerp(A[0], B[0], mag);
    g = glint * _lerp(A[1], B[1], mag);
    b = glint * _lerp(A[2], B[2], mag);
  } else if (archetype === 'ice') {
    // Banquise polaire : glace bleutée, crevasses sombres, calottes quasi pures.
    const n = _fbm(lon * 1.8, lat * 2.6 + 3.0, 4, s * 1.9);
    const cre = _ss(_fbm(lon * 6.0, lat * 6.0, 3, s * 2.7), 0.66, 0.74);
    const cap = Math.pow(Math.abs(Math.cos(lat)), 20);
    r = _lerp(0.68, 0.95, n) * _lerp(1, 0.30, cre * 0.85) * (1 - cap * 0.15) + Math.min(cap, 1) * 0.3;
    g = _lerp(0.80, 0.98, n) * _lerp(1, 0.35, cre * 0.80) * (1 - cap * 0.12) + Math.min(cap, 1) * 0.3;
    b = _lerp(0.94, 1.00, n) * _lerp(1, 0.42, cre * 0.70) + Math.min(cap, 1) * 0.2;
  } else if (archetype === 'volcanic') {
    // Basalte sombre craquelé, lave incandescente dans les failles.
    const h = _fbm(lon * 2.4, lat * 3.0 + 4.2, 5, s * 1.5);
    r = _lerp(0.035, 0.17, h); g = _lerp(0.030, 0.12, h); b = _lerp(0.045, 0.16, h);
    const lava = _fbm(lon * 5.0, lat * 5.0 + 7.7, 4, s * 2.3);
    const lm = _ss(lava, 0.68, 0.86);
    if (lm > 0) {
      const hot = lm * (1 + _ss(_fbm(lon * 9, lat * 9, 2, s * 5), 0.55, 0.8) * 0.5);
      r = _lerp(r, 1.0, hot); g = _lerp(g, 0.45, hot * 0.9); b = _lerp(b, 0.06, hot * 0.7);
    }
  } else {
    // rocheuse : régolithe brun-rouge, basins sombres et crêtes éclairées.
    const h = _fbm(lon * 2.2, lat * 3.0 + s * 0.01, 5, s * 1.3);
    r = _lerp(0.40, 0.74, h); g = _lerp(0.28, 0.60, h); b = _lerp(0.18, 0.42, h);
    const ma = _ss(_fbm(lon * 3.4, lat * 4.2 + 7.0, 4, s * 2.2), 0.55, 0.70);
    r = _lerp(r, 0.15, ma); g = _lerp(g, 0.11, ma); b = _lerp(b, 0.09, ma);
    const peak = _ss(_fbm(lon * 5.0, lat * 6.0 + 5.1, 4, s * 2.9), 0.62, 0.72);
    r = r * (1 - peak * 0.35) + peak * 0.25;
    g = g * (1 - peak * 0.35) + peak * 0.22;
    b = b * (1 - peak * 0.35) + peak * 0.18;
  }

  return [Math.round(Math.min(1, r) * 255), Math.round(Math.min(1, g) * 255), Math.round(Math.min(1, b) * 255)];
}

/** Texture de surface 256×128 d'une planète, unique par seed. */
function _makePlanetTexture(seed, archetype) {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI - Math.PI / 2;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const px = _seamless(lon, l => _planetPixel(l, lat, x, y, seed, archetype));
      const i = (y * W + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;   // les couleurs du canvas sont du sRGB
  return tex;
}

/** Couche de nuages : alpha blanc là où le bruit dépasse le seuil. */
function _makeCloudTexture(seed) {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n = _seamless(u * Math.PI * 2, l => _fbm((l / (Math.PI * 2)) * 4 + seed * 0.01, v * 6 + 3, 4, seed * 1.1));
      // Bords doux : un seuil franc donnait des nuages en blocs rectangulaires.
      const a = Math.floor(_ss(n, 0.52, 0.72) * 230);
      const i = (y * W + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Halo d'atmosphère : sphère légèrement plus grande, fresnel → anneau doux
 * qui s'illumine sur les bords du disque (coucher de soleil permanent).
 */
function makeAtmosphere(size, atmoColor) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: atmoColor } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vN;
      varying vec3 vWorld;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(normalize(vN), viewDir)), 2.6);
        // L'atmosphère ne diffuse que la lumière reçue : le soleil du système
        // est à l'origine, la face nuit ne garde qu'un liseré très ténu.
        float day = smoothstep(-0.25, 0.35, dot(normalize(vN), normalize(-vWorld)));
        float k = fres * (0.08 + 0.92 * day);
        gl_FragColor = vec4(uColor * k * 1.8, k * 0.85);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(size * 1.14, 32, 32), mat);
}

/**
 * Build a Planet mesh — chaque planète est un cas unique : texture de surface
 * procédurale seedée selon son archétype (rocheuse, océan, géante gazeuse,
 * glace, volcanique), couche de nuages qui dérive, atmosphère fresnel et
 * éventuellement des anneaux. Éclairée par le Soleil central (phases réelles).
 */
export function createPlanet(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'planet', index };

  const size = 4 + Math.min(node.markdownCount * 0.5, 8);
  group.userData.visualRadius = planetRadius(node);   // atmosphère + anneau éventuel

  const seed = nodeSeed(node);
  const rnd = seededRandom(seed ^ 0x51ed27);
  const archetype = PLANET_ARCHETYPES[seed % PLANET_ARCHETYPES.length];
  const baseColor = ARCHETYPE_COLOR[archetype];

  // Surface unique — `emissiveMap` = même texture en émissif modéré : la
  // planète reste lisible même loin du Soleil, le terminateur s'adoucit
  // mais les détails ne disparaissent jamais.
  const tex = _makePlanetTexture(seed, archetype);
  const geo = new THREE.SphereGeometry(size, 40, 40);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    // Émission minime : la face nuit reste devinable, c'est le soleil qui éclaire.
    emissiveIntensity: 0.05,
    roughness: 0.8,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  // Obliquité axiale : l'axe de rotation est incliné (comme sur Terre)
  mesh.rotation.z = (rnd() - 0.5) * 1.2;
  mesh.rotation.x = (rnd() - 0.5) * 0.5;
  group.add(mesh);

  // Nuages qui dérivent (rocheuses et océans surtout, gazeuses un peu)
  const cloudChance = archetype === 'gas' ? 0.45 : 0.85;
  if (rnd() < cloudChance) {
    const cloudTex = _makeCloudTexture(seed ^ 0x9E3779B9);
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(size * 1.03, 28, 28),
      // Matériau éclairé : les nuages ne doivent pas briller sur la face nuit.
      new THREE.MeshStandardMaterial({
        map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false,
        roughness: 1, metalness: 0,
      }),
    );
    cloud.rotation.set(mesh.rotation.x, mesh.rotation.z, 0);
    group.add(cloud);
    group.userData.cloudSpin = 0.012 + rnd() * 0.02;
    group.userData.cloudSkin = cloud;
  }

  // Atmosphère fresnel
  group.add(makeAtmosphere(size, ARCHETYPE_ATMO[archetype]));

  // Lueur diffuse
  addGlow(group, baseColor, size * 1.9, 0.4);

  // Anneaux : fréquents sur gazeuses/glace, rares ailleurs
  const ringish = archetype === 'gas' || archetype === 'ice';
  if (rnd() < (ringish ? 0.85 : 0.22)) {
    const rIn = size * (1.35 + rnd() * 0.22);
    const rOut = rIn * (1.4 + rnd() * 0.5);
    const rColor = baseColor.clone().offsetHSL(rnd() * 0.1 - 0.05, 0, 0.05);
    const ringGeo = new THREE.RingGeometry(rIn, rOut, 96, 1);
    // UV radiales : u = 0 au bord interne, 1 au bord externe, pour y poser les bandes.
    const uv = ringGeo.attributes.uv;
    const p = ringGeo.attributes.position;
    for (let k = 0; k < uv.count; k++) {
      const d = Math.hypot(p.getX(k), p.getY(k));
      uv.setXY(k, (d - rIn) / (rOut - rIn), 0.5);
    }
    const bands = _makeRingTexture(seed ^ 0x2545F491);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({
        color: rColor, map: bands, alphaMap: bands, side: THREE.DoubleSide,
        transparent: true, opacity: 0.55 + rnd() * 0.3,
        depthWrite: false, roughness: 1, metalness: 0,
        emissive: rColor, emissiveIntensity: 0.04,
      }),
    );
    ring.rotation.x = Math.PI / 2 - (rnd() - 0.5) * 0.35;
    group.add(ring);
  }

  scene.add(group);
  return group;
}

/** Profil du disque protoplanétaire : bosse douce, bandes de poussière légères. */
let _discTex = null;
function _makeDiscTexture() {
  if (_discTex) return _discTex;
  const W = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 1;
  const ctx = c.getContext('2d');
  for (let x = 0; x < W; x++) {
    const u = x / (W - 1);
    const hump = Math.exp(-Math.pow((u - 0.35) / 0.28, 2));        // densité max côté intérieur
    const bands = 0.8 + 0.2 * Math.sin(u * 42) * Math.sin(u * 13);  // stries discrètes
    const v = Math.round(255 * hump * bands * _ss(u, 0, 0.18) * (1 - _ss(u, 0.75, 1)));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, 1);
  }
  _discTex = new THREE.CanvasTexture(c);
  _discTex.colorSpace = THREE.SRGBColorSpace;
  _discTex.userData.shared = true;
  return _discTex;
}

/** Bandes d'anneau (façon Saturne) : densité variable, divisions sombres. */
function _makeRingTexture(seed) {
  const W = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 1;
  const ctx = c.getContext('2d');
  const rnd = seededRandom(seed);
  const gaps = [0.3 + rnd() * 0.15, 0.62 + rnd() * 0.15];
  for (let x = 0; x < W; x++) {
    const u = x / (W - 1);
    let d = 0.55 + 0.45 * Math.sin(u * 37 + rnd() * 0.4) * Math.sin(u * 11.3);
    d = 0.35 + 0.65 * Math.abs(d);
    for (const g of gaps) d *= Math.min(1, Math.abs(u - g) * 28);
    d *= Math.min(1, u * 8) * Math.min(1, (1 - u) * 6);   // bords adoucis
    const v = Math.round(255 * Math.max(0, Math.min(1, d)));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a Dwarf Planet mesh — petite sphère pâle et irrégulière, sans anneau.
 */
export function createDwarfPlanet(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'dwarf-planet', index };

  const color = pickColor(COLORS.dwarfPlanet, index);
  const size = 3 + Math.min(node.markdownCount * 0.4, 6);
  group.userData.visualRadius = dwarfPlanetRadius(node);

  const geo = new THREE.SphereGeometry(size, 24, 24);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    emissive: color,
    emissiveIntensity: 0.04,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  group.add(mesh);

  addGlow(group, color, size * 2.0, 0.3);

  scene.add(group);
  return group;
}

/**
 * Build a Small Body mesh — rocher gris compact, la plus petite structure.
 */
export function createSmallBody(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'small-body', index };

  const color = pickColor(COLORS.smallBody, index);
  const size = 1.5 + Math.min(node.markdownCount * 0.3, 4);
  group.userData.visualRadius = smallBodyRadius(node);

  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  group.add(mesh);

  addGlow(group, color, size * 2.6, 0.35);

  scene.add(group);
  return group;
}

/** Texel d'une lune : régolithe gris, mers sombres, cratères, teinte propre. */
function _moonPixel(lon, lat, s) {
  const n = _fbm(lon * 3.0, lat * 3.4 + 2.0, 4, s * 1.3);
  // Base poussière lunaire, avec un léger décalage de teinte par lune
  // (gris chaud, gris froid, beige…) pour qu'aucune lune ne ressemble à la
  // suivante même à petite taille.
  const tint = (s & 15) / 15;
  let r = _lerp(0.40 + tint * 0.08, 0.62 + tint * 0.08, n);
  let g = _lerp(0.38 + tint * 0.02, 0.59 + tint * 0.02, n);
  let b = _lerp(0.36 + (1 - tint) * 0.10, 0.55 + (1 - tint) * 0.10, n);

  // Mers sombres (basaltes)
  const maria = _ss(_fbm(lon * 2.0, lat * 2.6 + 3.0, 3, s * 1.7), 0.55, 0.66);
  r = _lerp(r, 0.25, maria); g = _lerp(g, 0.23, maria); b = _lerp(b, 0.24, maria);

  // Cratères : petites taches plus sombres, bord éclairé
  const cr = _ss(_fbm(lon * 6.0, lat * 6.0 + 5.0, 3, s * 2.3), 0.72, 0.80);
  r = _lerp(r, 0.16, cr); g = _lerp(g, 0.15, cr); b = _lerp(b, 0.15, cr);

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Texture de surface d'une lune (128×64), unique par seed. */
function _makeMoonTexture(seed) {
  const W = 128, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI - Math.PI / 2;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const px = _seamless(lon, l => _moonPixel(l, lat, seed));
      const i = (y * W + x) * 4;
      data[i] = px[0]; data[i + 1] = px[1]; data[i + 2] = px[2]; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a Moon mesh — petite sphère, surface lunaire procédurale unique
 * (chaque note a sa propre lune : poussière teintée, mers, cratères).
 */
export function createMoon(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'moon', index };

  // Dynamic size based on file size (node.size in bytes) using a log scale
  const sizeInBytes = node.size || 0;
  const logScale = Math.log10(Math.max(1, sizeInBytes));
  const size = 1.0 + Math.min(logScale * 0.6, 2.5); // min 1.0, max 3.5

  group.userData.visualRadius = moonRadius(node);   // halo compris

  const seed = nodeSeed(node);
  // Halo selon la rareté (taille relative de la note dans le vault).
  const color = RARITY_GLOW[node.rarity] ?? pickColor(COLORS.moon, index);
  const glowBoost = node.rarity === 'legendaire' ? 1.6 : node.rarity === 'rare' ? 1.25 : 1;
  group.userData.coreRadius = size;

  const tex = _makeMoonTexture(seed);
  const geo = new THREE.SphereGeometry(size, 24, 24);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.07,
    roughness: 0.9,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  mesh.rotation.z = ((seed % 1000) / 1000 - 0.5) * 1.9;
  group.add(mesh);

  // Lueur discrète : les lunes sont minuscules, sans elle elles
  // disparaissent contre le fond étoilé.
  addGlow(group, color, size * 3 * glowBoost, 0.5 * glowBoost);

  scene.add(group);
  return group;
}

const RARITY_GLOW = { rare: 0x60A5FA, legendaire: 0xC084FC };

/**
 * Create an orbit trail ellipse for orbital mechanics feel.
 *
 * L'ellipse est tracée avec le Soleil au foyer (origine) : x = a·cos(θ) − a·e,
 * comme `orbitPoint` dans main.js — le tracé et l'astre partagent le plan et
 * le foyer.
 *
 * @param {number} incl  inclinaison en radians — tilt du plan orbital
 * @param {number} omega longitude du nœud ascendant en radians — rotation du plan autour de Y
 * @param {number} e     excentricité (0 = cercle)
 * @param {number} orient rotation dans le plan (orientation du péricentre)
 */
export function createOrbit(scene, center, radius, color = 0x333366, incl = 0, omega = 0, e = 0, orient = 0, opacity = 0.15) {
  const points = [];
  const segments = 128;
  const b = radius * Math.sqrt(Math.max(0, 1 - e * e));
  const c = radius * e;
  for (let i = 0; i <= segments; i++) {
    const angle = orient + (i / segments) * Math.PI * 2;
    const lx = radius * Math.cos(angle) - c;
    const lz = b * Math.sin(angle);
    points.push(new THREE.Vector3(lx, 0, lz));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);

  // On incline les sommets avec la même rotation (Y après X) que celle
  // appliquée au corps en animation : le tracé et l'astre partagent le plan.
  if (incl || omega) {
    const m = new THREE.Matrix4()
      .makeRotationY(omega)
      .multiply(new THREE.Matrix4().makeRotationX(incl));
    geo.applyMatrix4(m);
  }

  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  const orbit = new THREE.LineLoop(geo, mat);
  orbit.position.copy(center);
  scene.add(orbit);
  return orbit;
}

/**
 * createBody — dispatcher générique : construit le corps céleste du type
 * du nœud. Utilisé par toutes les vues (racine, dossier, notes).
 */
export function createBody(scene, node, position, index) {
  switch (node.visualType) {
    case VisualType.SUPERCLUSTER: return createSupercluster(scene, node, position, index);
    case VisualType.CLUSTER:      return createCluster(scene, node, position, index);
    case VisualType.GALAXY:       return createGalaxy(scene, node, position, index);
    case VisualType.STAR:         return createCompactStar(scene, node, position, index);
    case VisualType.DWARF_PLANET: return createDwarfPlanet(scene, node, position, index);
    case VisualType.SMALL_BODY:   return createSmallBody(scene, node, position, index);
    case VisualType.PLANET:       return createPlanet(scene, node, position, index);
    default:                      return createMoon(scene, node, position, index);
  }
}
