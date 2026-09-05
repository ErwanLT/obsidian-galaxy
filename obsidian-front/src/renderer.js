/**
 * renderer.js — Three.js scene, camera, OrbitControls, starfield, nebula
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class GalaxyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this._measure();
    this._setup();
    window.addEventListener('resize', () => this._resize());
  }

  /**
   * Dimensions du viewport, garanties finies et non nulles.
   *
   * `window.innerWidth/innerHeight` peuvent valoir 0 au tout début du cycle
   * de vie de la page (et dans certains contextes embarqués) : le ratio
   * devenait alors 0/0 = NaN, ce qui contaminait la matrice de projection et
   * figeait toute la scène.
   */
  _measure() {
    this.w = Math.max(1, window.innerWidth  || this.canvas.clientWidth  || 1280);
    this.h = Math.max(1, window.innerHeight || this.canvas.clientHeight || 720);
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
    this.renderer.toneMappingExposure = 1.2;

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
    this.scene.add(new THREE.AmbientLight(0x111133, 2));
    const dl1 = new THREE.DirectionalLight(0x7C3AED, 1.5); dl1.position.set(100,100,50); this.scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0x06B6D4, 0.8); dl2.position.set(-100,-50,-100); this.scene.add(dl2);

    this._buildStars();
    this._buildNebula();
    this._buildDistantGalaxies();
    this._buildComposer();
  }

  _buildComposer() {
    const renderScene = new RenderPass(this.scene, this.camera);
    // Seuil ~0.62 : seuls les éclats (soles, couronnes, noyaux de galaxies,
    // étoiles proches) reçoivent le bloom, pas tout le fond stellaire.
    const bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.6, 0.55, 0.62);
    const output = new OutputPass();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloom);
    this.composer.addPass(output);
  }

  /**
   * Galaxies lointaines : de simples sprites floutés très loin de la scène.
   * Elles donnent une échelle au vide — sans elles le fond n'est qu'un
   * semis d'étoiles uniforme et on perd toute sensation de profondeur.
   */
  _buildDistantGalaxies() {
    const tex = this._makeGalaxyTexture();
    const specs = [
      { x: -1500, y:  620, z: -1100, s: 340, rot: 0.5,  o: 0.5,  c: 0xC4B5FD },
      { x:  1650, y: -480, z:  -900, s: 260, rot: -0.8, o: 0.42, c: 0xA5F3FC },
      { x: -1250, y: -700, z:   950, s: 200, rot: 1.1,  o: 0.34, c: 0xFBCFE8 },
      { x:  1400, y:  760, z:   800, s: 300, rot: -0.3, o: 0.3,  c: 0xDDD6FE },
      { x:   250, y: -900, z: -1700, s: 220, rot: 0.9,  o: 0.28, c: 0xBFDBFE },
    ];
    specs.forEach(d => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: d.c, transparent: true, opacity: d.o,
        depthWrite: false, blending: THREE.AdditiveBlending, rotation: d.rot,
      }));
      sprite.position.set(d.x, d.y, d.z);
      sprite.scale.set(d.s, d.s * 0.42, 1);   // aplati : vue de trois-quarts
      this.scene.add(sprite);
    });
  }

  /** Texture procédurale : noyau brillant qui s'estompe vers les bords. */
  _makeGalaxyTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.35, 'rgba(200,180,255,0.30)');
    g.addColorStop(0.65, 'rgba(150,140,220,0.10)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  _buildStars() {
    const N = 14000;
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
    // Additif : les étoiles se superposent au lieu de se masquer, ce qui
    // densifie visuellement le fond sans ajouter de géométrie.
    const mat = new THREE.PointsMaterial({
      size: 1.7, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: .95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _buildNebula() {
    // Rayons largement supérieurs aux distances de caméra usuelles (~300).
    // Avec des nuages de 200-360 unités, la caméra passait à l'intérieur et
    // on voyait le bord franc de la sphère traverser l'écran.
    const clouds = [
      { color:0x3b0764, r:1500, x:0,    y:0,    z:0,    o:.055 },
      { color:0x0c4a6e, r:1150, x:700,  y:-300, z:-900, o:.05  },
      { color:0x4c1d95, r:1000, x:-900, y:200,  z:500,  o:.06  },
      { color:0x0e7490, r:900,  x:400,  y:400,  z:850,  o:.04  },
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
    this._measure();
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.w, this.h);
    if (this.composer) {
      this.composer.setSize(this.w, this.h);
      this.composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    }
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

    // Une seule coordonnée non finie suffit à corrompre définitivement la
    // caméra : OrbitControls la repropage à chaque frame et la scène ne
    // revient jamais. Mieux vaut ignorer le déplacement.
    if (!Number.isFinite(endPos.x + endPos.y + endPos.z) ||
        !Number.isFinite(endTgt.x + endTgt.y + endTgt.z)) {
      console.warn('[flyTo] cible non finie, déplacement ignoré', { pos, look });
      if (cb) cb();
      return;
    }
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

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  get domElement() { return this.renderer.domElement; }
}
