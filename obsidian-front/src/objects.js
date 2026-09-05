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
    case VisualType.STAR:         return starRadius(node);
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
 * Build a Star mesh — glowing ringed sphere
 */
export function createStar(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'star', index };

  const color = pickColor(COLORS.star, index);
  const size = 8 + Math.min(node.markdownCount * 0.3, 12);
  group.userData.visualRadius = starRadius(node);   // anneau + lueur

  // Cœur d'étoile : émissif fort, il doit paraître être sa propre source
  // de lumière et non une bille éclairée de l'extérieur.
  const coreGeo = new THREE.SphereGeometry(size, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    // Émissif modéré : au-delà de ~0.5, le tonemapping ACES fait virer
    // l'astre au blanc et on perd le codage par couleur.
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.0,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.userData = { isCore: true };
  group.add(core);

  addGlow(group, color, size * 2.6, 0.75);

  // Anneau fin et lumineux plutôt qu'un large disque translucide
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(size * 1.55, size * 1.95, 96),
    new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide,
      transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2.5;
  group.add(ring);

  group.add(new THREE.PointLight(color, 1.1, size * 16));

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
  const geo = new THREE.SphereGeometry(size, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2,
    roughness: 0.6,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
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
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
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
 * @param {number} incl  inclinaison en radians — tilt du plan orbital
 * @param {number} omega longitude du nœud ascendant en radians — rotation du plan autour de Y
 */
export function createOrbit(scene, center, radius, color = 0x333366, incl = 0, omega = 0) {
  const points = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
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
    case VisualType.STAR:         return createStar(scene, node, position, index);
    case VisualType.DWARF_PLANET: return createDwarfPlanet(scene, node, position, index);
    case VisualType.SMALL_BODY:   return createSmallBody(scene, node, position, index);
    case VisualType.PLANET:       return createPlanet(scene, node, position, index);
    default:                      return createMoon(scene, node, position, index);
  }
}
