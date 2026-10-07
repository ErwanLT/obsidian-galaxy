// renderer.js — scène, caméra, fond encre, bloom et boucle.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060c);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(70, 60, 150);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.getElementById('app').appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55,      // strength — doux
    0.5,       // radius
    0.45,      // threshold — seules les braises les plus chaudes flamboient
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 40;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.88;

  // Voile d'étoiles lointaines : le champ respire dans l'encre.
  const N = 1400;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 250 + Math.random() * 900;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    sp[i * 3] = Math.sin(p) * Math.cos(t) * r;
    sp[i * 3 + 1] = Math.cos(p) * r * 0.7;
    sp[i * 3 + 2] = Math.sin(p) * Math.sin(t) * r;
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0x8a93b8, size: 0.7, sizeAttenuation: true,
    transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(stars);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, composer };
}

export function tick(renderer, composer, controls, time) {
  controls.update(time);
  composer.render();
}