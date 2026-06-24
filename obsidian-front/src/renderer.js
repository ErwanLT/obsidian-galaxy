/**
 * renderer.js — Three.js scene, camera, OrbitControls, starfield, nebula
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class GalaxyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this._setup();
    window.addEventListener('resize', () => this._resize());
  }

  _setup() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000010, 0.0006);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this.w / this.h, 0.1, 6000);
    this.camera.position.set(0, 90, 240);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x000010, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 2000;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 1.1;
    this.controls.panSpeed = 0.8;

    // Lights
    this.scene.add(new THREE.AmbientLight(0x111133, 3));
    const dl1 = new THREE.DirectionalLight(0x7C3AED, 2); dl1.position.set(100,100,50); this.scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0x06B6D4, 1); dl2.position.set(-100,-50,-100); this.scene.add(dl2);

    this._buildStars();
    this._buildNebula();
  }

  _buildStars() {
    const N = 9000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const sz  = new Float32Array(N);
    const palettes = [[1,1,1],[.8,.85,1],[1,.95,.8],[.7,.7,1],[1,.8,.6]];

    for (let i = 0; i < N; i++) {
      const r = 1300 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta) * 0.4;
      pos[i*3+2] = r * Math.cos(phi);
      const c = palettes[Math.floor(Math.random() * palettes.length)];
      col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
      sz[i] = Math.random() < 0.025 ? 3 + Math.random() * 2 : 0.7 + Math.random() * 1.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size:1.4, sizeAttenuation:true, vertexColors:true, transparent:true, opacity:.9 });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _buildNebula() {
    const clouds = [
      { color:0x3b0764, r:360, x:0,    y:0,   z:0,    o:.055 },
      { color:0x0c4a6e, r:270, x:170,  y:-70, z:-220, o:.045 },
      { color:0x4c1d95, r:200, x:-220, y:50,  z:120,  o:.065 },
      { color:0x0e7490, r:190, x:90,   y:90,  z:210,  o:.035 },
    ];
    clouds.forEach(d => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(d.r,16,16),
        new THREE.MeshBasicMaterial({ color:d.color, transparent:true, opacity:d.o, side:THREE.BackSide })
      );
      m.position.set(d.x,d.y,d.z);
      this.scene.add(m);
    });
  }

  _resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.w, this.h);
  }

  /**
   * Smooth cinematic fly-to.
   * @param {{x,y,z}} pos  target camera position
   * @param {{x,y,z}} look target orbit center
   * @param {number}  ms   duration
   * @param {Function} cb  callback when done
   */
  flyTo(pos, look, ms = 1100, cb) {
    const startPos = this.camera.position.clone();
    const startTgt = this.controls.target.clone();
    const endPos   = new THREE.Vector3(pos.x, pos.y, pos.z);
    const endTgt   = new THREE.Vector3(look.x, look.y, look.z);
    const t0 = performance.now();

    const tick = (now) => {
      const p = Math.min((now - t0) / ms, 1);
      const e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2,3)/2;   // ease-in-out cubic
      this.camera.position.lerpVectors(startPos, endPos, e);
      this.controls.target.lerpVectors(startTgt, endTgt, e);
      this.controls.update();
      if (p < 1) requestAnimationFrame(tick);
      else if (cb) cb();
    };
    requestAnimationFrame(tick);
  }

  tick(t) {
    if (this.stars) this.stars.rotation.y = t * 0.00003;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  get domElement() { return this.renderer.domElement; }
}
