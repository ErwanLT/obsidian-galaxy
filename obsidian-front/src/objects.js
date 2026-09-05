/**
 * objects.js — 3D object factories for each space entity type.
 * Une fabrique par corps céleste de la taxonomie (superamas, amas, galaxie,
 * étoile, planète, planète naine, petit corps, lune) + createBody(), le
 * dispatcher générique utilisé par les vues.
 */
import * as THREE from 'three';
import { VisualType } from './universe.js';

export const COLORS = {
  supercluster: [0x4C1D95, 0x5B21B6, 0x6D28D9, 0x7C3AED, 0x8B5CF6, 0xA78BFA],
  cluster:      [0x5B21B6, 0x6D28D9, 0x7C3AED, 0x8E3BFF, 0x8B5CF6, 0x9D6BFA],
  galaxy:       [0x7C3AED, 0x8B5CF6, 0xA78BFA, 0x6D28D9, 0x5B21B6, 0x4C1D95],
  // Cyans saturés de valeur moyenne : les teintes sombres (0x0E7490,
  // 0x0369A1) ressortaient en gris-bleu terne une fois éclairées.
  star:         [0x06B6D4, 0x0EA5E9, 0x22D3EE, 0x14B8A6, 0x38BDF8, 0x2DD4BF],
  planet:       [0xF59E0B, 0xEF4444, 0x10B981, 0xF97316, 0xEC4899, 0x84CC16],
  // Teintes pâles glacées pour les planètes naines.
  dwarfPlanet:  [0xE5E7EB, 0xD8E3F0, 0xF3E8FF, 0xE0F2FE, 0xCBD5E1, 0xA7F3D0],
  // Gris rocheux pour les petits corps.
  smallBody:    [0x6B7280, 0x9CA3AF, 0x78716C, 0x8E9096, 0x7F8C8D, 0x57534E],
  // Teintes vertes : cohérentes avec la pastille « Lune / Note » de la légende.
  moon:         [0x34D399, 0x10B981, 0x6EE7B7, 0x059669, 0x2DD4BF, 0x14B8A6],
};

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
  const colorKey = opts.colorKey ?? 'galaxy';
  const type = opts.type ?? 'galaxy';

  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type, index };

  const color = pickColor(COLORS[colorKey], index);
  const radius = galaxyRadius(node) * sizeMul;   // rayon du disque
  const bulge = radius * 0.22;
  group.userData.visualRadius = radius;

  // Cible de clic : sphère transparente couvrant le disque. Sans elle il
  // faudrait viser le bulbe central au pixel près.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.8, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.userData = { isCore: true };
  group.add(hit);

  // Bulbe central
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(bulge * 0.7, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xF5E9FF }),
  );
  group.add(core);

  addGlow(group, 0xFFFFFF, bulge * 2.2, 0.85);   // éclat du noyau
  addGlow(group, color, radius * 0.9, 0.35);      // lueur diffuse du disque

  group.add(new THREE.PointLight(color, 1.4, radius * 14));

  // ── Bras spiraux (Écoulement radial fluide) ──
  const ARMS = 2;
  const N = Math.min(1400 + node.markdownCount * 40, 5000);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);

  const u0s = new Float32Array(N);
  const radialSpeeds = new Float32Array(N);
  const arms = new Float32Array(N);
  const jitters = new Float32Array(N);
  const rJitters = new Float32Array(N);

  // En additif, le blanc sature très vite : on garde une teinte déjà
  // colorée au centre, sinon tout le disque part en blanc laiteux.
  const cHot = new THREE.Color(0xE9D5FF);                 // cœur, lavande clair
  const cArm = new THREE.Color(color);                    // teinte de la galaxie
  const cRim = new THREE.Color(0x0E7490);                 // périphérie, cyan sombre

  for (let i = 0; i < N; i++) {
    // u0 répartit les particules uniformément du centre vers la périphérie
    const u0 = Math.random();
    // Vitesse d'écoulement radial légèrement aléatoire pour le réalisme
    const radialSpeed = 0.012 + Math.random() * 0.012;
    const arm = i % ARMS;
    // Les bras s'épaississent vers l'extérieur (jitter plus grand à grand u0)
    const jitter = (Math.random() - 0.5) * (0.22 + u0 * 0.4);
    const rJitter = (Math.random() - 0.5) * 0.12;

    u0s[i] = u0;
    radialSpeeds[i] = radialSpeed;
    arms[i] = arm;
    jitters[i] = jitter;
    rJitters[i] = rJitter;

    // Position initiale à t = 0
    const r_base = bulge * 0.8 + u0 * radius;
    const rr = r_base * (1 + rJitter);
    const angle = (arm / ARMS) * Math.PI * 2 + u0 * 3.1 * Math.PI + jitter;

    pos[i * 3]     = Math.cos(angle) * rr;
    pos[i * 3 + 1] = (Math.random() - 0.5) * radius * 0.09 * (1 - u0 * 0.55);
    pos[i * 3 + 2] = Math.sin(angle) * rr;

    // Le cœur clair est confiné aux 15 % centraux
    const c = u0 < 0.15
      ? cHot.clone().lerp(cArm, u0 / 0.15)
      : cArm.clone().lerp(cRim, (u0 - 0.15) / 0.85);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const disc = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.25, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.7, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  disc.userData = {
    isDisc: true,
    u0s,
    radialSpeeds,
    arms,
    jitters,
    rJitters,
    bulge,
    radius
  };
  group.add(disc);

  scene.add(group);
  return group;
}

/**
 * Superamas — la plus vaste structure : grand disque de galaxies.
 */
export function createSupercluster(scene, node, position, index) {
  return createGalaxy(scene, node, position, index, {
    sizeMul: 1.8, colorKey: 'supercluster', type: 'supercluster',
  });
}

/**
 * Amas de galaxies — disque intermédiaire entre superamas et galaxie.
 */
export function createCluster(scene, node, position, index) {
  return createGalaxy(scene, node, position, index, {
    sizeMul: 1.25, colorKey: 'cluster', type: 'cluster',
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

  const color = pickColor(COLORS.star, index);
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

  const color = pickColor(COLORS.star, index);
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

        // Palette plasma : rouge profond → orange → jaune chauffé
        vec3 deep = vec3(0.55, 0.12, 0.02);
        vec3 mid  = vec3(1.00, 0.45, 0.05);
        vec3 hot  = vec3(1.00, 0.86, 0.42);

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

  // ── Couronne volumique ──
  // Sphère BackSide additive : anneau lumineux irrégulier qui scintille grâce
  // au bruit, densité plus forte près du disque, filaments vers l'extérieur.
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
    },
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
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.05;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(normalize(vN), viewDir)), 1.6);

        float n = fbm(vWorld / (uSize * 0.42) + vec3(uTime * 0.03, uTime * 0.02, 0.0));
        // Filaments radiaux : plus fins vers l'extérieur
        float filaments = fbm(normalize(vWorld) * 3.0 + uTime * 0.05 + n);
        float glow = fres * (0.35 + 0.7 * n) * (0.6 + 0.6 * filaments);

        gl_FragColor = vec4(uColor * glow * 2.2, glow * 0.85);
      }
    `,
  });
  sunUniforms.push(coronaMat.uniforms.uTime);

  const corona = new THREE.Mesh(new THREE.SphereGeometry(size * 2.4, 32, 32), coronaMat);
  group.add(corona);

  // ── Protubérances / éruptions solaires ──
  // Particules animées par le vertex shader : elles jaillissent de la surface
  // le long d'une boucle magnétique, s'éloignent puis s'éteignent. zéro CPU.
  const N_ERUPT = 700;
  const origin = new Float32Array(N_ERUPT * 3);
  const dir = new Float32Array(N_ERUPT * 3);
  const seed = new Float32Array(N_ERUPT);
  const v = new THREE.Vector3();
  for (let i = 0; i < N_ERUPT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    v.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    const r0 = size * (1.02 + Math.random() * 0.12);
    origin[i * 3] = v.x * r0;
    origin[i * 3 + 1] = v.y * r0;
    origin[i * 3 + 2] = v.z * r0;
    const d = v.clone().add(new THREE.Vector3(
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

  // Disque protoplanétaire : anneau fin et lumineux
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(size * 1.55, size * 1.95, 96),
    new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide,
      transparent: true, opacity: 0.7, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2.5;
  group.add(ring);

  // Vraie source de lumière : la scène est éclairée par l'étoile.
  group.add(new THREE.PointLight(color, 1.4, size * 18));

  scene.add(group);
  return group;
}

/**
 * Build a Planet mesh
 */
export function createPlanet(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'planet', index };

  const color = pickColor(COLORS.planet, index);
  const size = 4 + Math.min(node.markdownCount * 0.5, 8);
  group.userData.visualRadius = planetRadius(node);   // atmosphère + anneau éventuel

  // Planet sphere with texture-like variation
  // Émissif quasi nul : éclairé par le Soleil central (proche PointLight), la
  // moitié nuit reste dans l'ombre → phases réelles (terminateur visible).
  const geo = new THREE.SphereGeometry(size, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.06,
    roughness: 0.6,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  // Obliquité axiale : l'axe de rotation est incliné (comme sur Terre)
  mesh.rotation.z = (Math.random() - 0.5) * 1.2;
  mesh.rotation.x = (Math.random() - 0.5) * 0.5;
  group.add(mesh);

  addGlow(group, color, size * 1.9, 0.45);   // atmosphère

  // Optional thin ring (30% chance)
  if (Math.random() < 0.3) {
    const rGeo = new THREE.RingGeometry(size * 1.3, size * 1.8, 48);
    const rMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.15,
    });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.rotation.x = Math.PI / 3;
    group.add(ring);
  }

  scene.add(group);
  return group;
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
    emissiveIntensity: 0.12,
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

/**
 * Build a Moon mesh — small sphere
 */
export function createMoon(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'moon', index };

  const color = pickColor(COLORS.moon, index);
  
  // Dynamic size based on file size (node.size in bytes) using a log scale
  const sizeInBytes = node.size || 0;
  const logScale = Math.log10(Math.max(1, sizeInBytes));
  const size = 1.0 + Math.min(logScale * 0.6, 2.5); // min 1.0, max 3.5
  
  group.userData.visualRadius = moonRadius(node);   // halo compris

  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
    emissive: color,
    emissiveIntensity: 0.12,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  mesh.rotation.z = (Math.random() - 0.5) * 1.9;
  group.add(mesh);

  // Lueur discrète : les lunes sont minuscules, sans elle elles
  // disparaissent contre le fond étoilé.
  addGlow(group, color, size * 3, 0.5);

  scene.add(group);
  return group;
}

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
export function createOrbit(scene, center, radius, color = 0x333366, incl = 0, omega = 0, e = 0, orient = 0) {
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
    opacity: 0.15,
  });
  const orbit = new THREE.LineLoop(geo, mat);
  orbit.position.copy(center);
  scene.add(orbit);
  return orbit;
}

/**
 * Create a glowing label sprite
 */
export function createLabel(text, position, color = '#ffffff', fontSize = 48, width = 30) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Mesurer le texte pour adapter la taille du canvas
  ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
  const textWidth = ctx.measureText(text).width;

  // Marge pour éviter que les bords soient coupés (contour)
  const padding = 24;
  const canvasWidth = Math.max(512, Math.ceil(textWidth + padding));
  const canvasHeight = 128;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Réinitialiser le contexte car changer width le remet à zéro
  ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  // 1. Draw a dark semi-transparent outline first for contrast
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 10;
  ctx.strokeText(text, cx, cy);

  // 2. Fill the text on top
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);

  // Conserver le ratio du canvas pour ne pas déformer le texte
  const spriteHeight = width / 4;
  const spriteWidth = spriteHeight * (canvasWidth / canvasHeight);
  sprite.scale.set(spriteWidth, spriteHeight, 1);
  return sprite;
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
