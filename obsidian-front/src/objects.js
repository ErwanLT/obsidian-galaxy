/**
 * objects.js — 3D object factories for each space entity type
 * Galaxy, Solar System, Planet, Moon — each with unique visuals
 */
import * as THREE from 'three';

export const COLORS = {
  galaxy: [0x7C3AED, 0x8B5CF6, 0xA78BFA, 0x6D28D9, 0x5B21B6, 0x4C1D95],
  solarSystem: [0x06B6D4, 0x0891B2, 0x22D3EE, 0x0E7490, 0x0284C7, 0x0369A1],
  planet: [0xF59E0B, 0xEF4444, 0x10B981, 0xF97316, 0xEC4899, 0x84CC16],
  moon: [0x94A3B8, 0xCBD5E1, 0xA1A1AA, 0xB0B0B0, 0xD4D4D4, 0x9CA3AF],
};

function pickColor(arr, idx) {
  return arr[idx % arr.length];
}

/**
 * Build a Galaxy mesh — large glowing sphere with particle ring
 */
export function createGalaxy(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'galaxy', index };

  const color = pickColor(COLORS.galaxy, index);
  const size = 18 + Math.min(node.markdownCount * 0.4, 20);

  // Core sphere
  const coreGeo = new THREE.SphereGeometry(size, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    opacity: 0.92,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.userData = { isCore: true };
  group.add(core);

  // Glow halo (additive sprite-like layer)
  const haloGeo = new THREE.SphereGeometry(size * 1.6, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  group.add(halo);

  // Outer halo
  const halo2Geo = new THREE.SphereGeometry(size * 2.8, 16, 16);
  const halo2Mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.04,
    side: THREE.BackSide,
  });
  group.add(new THREE.Mesh(halo2Geo, halo2Mat));

  // Point light
  const light = new THREE.PointLight(color, 1.2, size * 12);
  group.add(light);

  // Disc ring of particles
  const particleCount = 600 + node.markdownCount * 3;
  const pPos = new Float32Array(Math.min(particleCount, 1200) * 3);
  for (let i = 0; i < pPos.length / 3; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = size * 1.3 + Math.random() * size * 2.5;
    const spread = (Math.random() - 0.5) * size * 0.8;
    pPos[i * 3] = Math.cos(angle) * dist;
    pPos[i * 3 + 1] = spread * 0.2;
    pPos[i * 3 + 2] = Math.sin(angle) * dist;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color,
    size: 0.8,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.userData.isDisc = true;
  group.add(particles);

  scene.add(group);
  return group;
}

/**
 * Build a Solar System mesh — glowing ringed sphere
 */
export function createSolarSystem(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'solar-system', index };

  const color = pickColor(COLORS.solarSystem, index);
  const size = 8 + Math.min(node.markdownCount * 0.3, 12);

  // Star-like core
  const coreGeo = new THREE.SphereGeometry(size, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.0,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.userData = { isCore: true };
  group.add(core);

  // Halo
  const haloGeo = new THREE.SphereGeometry(size * 2, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.07,
    side: THREE.BackSide,
  });
  group.add(new THREE.Mesh(haloGeo, haloMat));

  // Saturn-like ring
  const ringGeo = new THREE.RingGeometry(size * 1.5, size * 2.5, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.25,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.5;
  group.add(ring);

  // Light
  const light = new THREE.PointLight(color, 0.8, size * 15);
  group.add(light);

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

  // Atmosphere halo
  const atmoGeo = new THREE.SphereGeometry(size * 1.2, 16, 16);
  const atmoMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide,
  });
  group.add(new THREE.Mesh(atmoGeo, atmoMat));

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
 * Build a Moon mesh — small sphere
 */
export function createMoon(scene, node, position, index) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.userData = { node, type: 'moon', index };

  const color = pickColor(COLORS.moon, index);
  const size = 1.2 + Math.random() * 0.8;

  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    emissive: color,
    emissiveIntensity: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { isCore: true };
  group.add(mesh);

  scene.add(group);
  return group;
}

/**
 * Create an orbit trail ellipse for orbital mechanics feel
 */
export function createOrbit(scene, center, radius, color = 0x333366, tilt = 0) {
  const points = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.15,
  });
  const orbit = new THREE.LineLoop(geo, mat);
  orbit.position.copy(center);
  orbit.rotation.x = tilt;
  scene.add(orbit);
  return orbit;
}

/**
 * Create a glowing label sprite
 */
export function createLabel(text, position, color = '#ffffff', fontSize = 48) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;

  ctx.clearRect(0, 0, 512, 128);
  ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 1. Draw a dark semi-transparent outline first for contrast
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 10;
  ctx.strokeText(text, 256, 64);

  // 2. Fill the text on top
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  sprite.scale.set(30, 8, 1);
  return sprite;
}
