/**
 * renderer.js — Three.js scene, camera, OrbitControls, starfield, nebula
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { kelvinColor, seededRandom } from './objects.js';

// Températures d'étoiles du ciel, pondérées comme le ciel réel vu à l'œil :
// beaucoup de blanches et jaunes, quelques orangées, rares bleues et rouges.
const SKY_TEMPS = [[3200, 0.08], [4300, 0.2], [5600, 0.3], [6800, 0.22], [8500, 0.12], [12000, 0.08]];
function skyTemperature(r) {
  let acc = 0;
  for (const [t, w] of SKY_TEMPS) {
    acc += w;
    if (r < acc) return t;
  }
  return 6000;
}

export class GalaxyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.viewShift = 0;
    this.viewShiftTarget = 0;
    this.viewShiftY = 0;
    this.viewShiftYTarget = 0;
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
    this.scene.fog = new THREE.FogExp2(0x010103, 0.0006);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this.w / this.h, 0.1, 6000);
    this.camera.position.set(0, 90, 240);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x010103, 1);
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

    // Lumière : seulement un faible ambiant neutre (lumière diffuse du ciel).
    // C'est le soleil de chaque système qui éclaire ses planètes.
    this.scene.add(new THREE.AmbientLight(0x9aa3b8, 0.18));

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
      { x: -1500, y:  620, z: -1100, s: 340, rot: 0.5,  o: 0.32, c: 0xFFE4C2 },
      { x:  1650, y: -480, z:  -900, s: 260, rot: -0.8, o: 0.28, c: 0xC9D6FF },
      { x: -1250, y: -700, z:   950, s: 200, rot: 1.1,  o: 0.22, c: 0xFFEAD0 },
      { x:  1400, y:  760, z:   800, s: 300, rot: -0.3, o: 0.2,  c: 0xD6DEFF },
      { x:   250, y: -900, z: -1700, s: 220, rot: 0.9,  o: 0.18, c: 0xFFF1DE },
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
    g.addColorStop(0.35, 'rgba(235,225,215,0.30)');
    g.addColorStop(0.65, 'rgba(200,200,215,0.10)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /**
   * Étoiles proches, en 3D (parallaxe quand on tourne) : couleurs de corps noir
   * et luminosités en loi de puissance — quelques brillantes, une foule de faibles.
   */
  _buildStars() {
    const rnd = seededRandom(0x5eed);
    const N = 7000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1300 + rnd() * 900;
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = kelvinColor(skyTemperature(rnd()));
      const b = Math.min(1, 0.18 + Math.pow(rnd(), 6) * 1.6);
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: true, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  /**
   * Ciel de fond (scene.background, équirectangulaire) : la Voie lactée.
   *
   * Bande inclinée de milliers d'étoiles faibles, cœur doré du côté du centre
   * galactique, nuages de poussière sombres et quelques nébuleuses (Hα rose,
   * OIII turquoise). Un fond n'a pas de bord (les anciennes sphères de
   * nébuleuse traçaient une ligne à l'écran) et ne subit pas le brouillard.
   */
  _buildNebula() {
    const W = 4096;
    const H = 2048;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const rnd = seededRandom(0xa11e);
    const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
    ctx.fillStyle = '#010103';
    ctx.fillRect(0, 0, W, H);

    // Plan galactique : grand cercle incliné de 0,5 rad ; centre galactique en λ0.
    const TILT = 0.5;
    const L0 = 1.9;
    const bandV = u => {
      const lat = Math.asin(Math.sin(TILT) * Math.sin(u * Math.PI * 2 - L0 + Math.PI / 2));
      return 0.5 - lat / Math.PI;
    };
    const coreWeight = u => {
      const d = Math.abs(((u * Math.PI * 2 - L0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return Math.exp(-(d * d) / 0.5);
    };
    const blob = (x, y, rad, rgb, a) => {
      for (const dx of [-W, 0, W]) {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
        g.addColorStop(0, `rgba(${rgb},${a})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
      }
    };

    // 1. Lueur diffuse de la bande, plus large et dorée vers le centre galactique.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 700; i++) {
      const u = rnd();
      const core = coreWeight(u);
      const v = bandV(u) + gauss() * 0.02 * (1 + core);
      const warm = core > 0.3;
      blob(u * W, v * H, (40 + rnd() * 90) * (1 + core * 1.5), warm ? '255,214,170' : '170,185,230', 0.02 + core * 0.03);
    }

    // 2. Étoiles : foule concentrée dans la bande + fond uniforme plus clairsemé.
    const dot = (x, y, size, color, b) => {
      ctx.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${b})`;
      ctx.fillRect(x, y, size, size);
    };
    for (let i = 0; i < 60000; i++) {
      const u = rnd();
      const inBand = i < 42000;
      const v = inBand ? bandV(u) + gauss() * 0.05 * (1 + coreWeight(u)) : rnd();
      const b = Math.pow(rnd(), 3);
      const size = b > 0.8 ? 2 : 1;
      dot(u * W, v * H, size, kelvinColor(skyTemperature(rnd())), 0.15 + b * 0.75);
    }

    // 3. Nuages de poussière : ils masquent la bande par endroits (rift).
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 260; i++) {
      const u = rnd();
      const v = bandV(u) + gauss() * 0.012 + 0.006 * Math.sin(u * 40);
      blob(u * W, v * H, 18 + rnd() * 60, '2,2,6', 0.35 + coreWeight(u) * 0.25);
    }

    // 4. Quelques nébuleuses colorées, petites et rares.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const u = rnd();
      const v = bandV(u) + gauss() * 0.03;
      blob(u * W, v * H, 20 + rnd() * 50, rnd() < 0.7 ? '255,90,140' : '80,220,210', 0.05 + rnd() * 0.05);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
  }

  /**
   * Décale le centre de projection de `px` vers la gauche (le panneau d'infos
   * occupe la droite) — animé dans tick(). Les clics restent justes : le
   * raycaster utilise la même matrice de projection.
   */
  setViewShift(px, py = 0) {
    this.viewShiftTarget = px;
    this.viewShiftYTarget = py;
  }

  _applyViewShift() {
    if (Math.abs(this.viewShift) < 0.5 && Math.abs(this.viewShiftY) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.w, this.h, this.viewShift, this.viewShiftY, this.w, this.h);
  }

  _resize() {
    this._measure();
    this._applyViewShift();
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
    const flight = (this._flight || 0) + 1;
    this._flight = flight;
    this.flying = true;

    const tick = (now) => {
      // Un vol plus récent a pris la main : celui-ci s'arrête, mais son action
      // de fin a lieu quand même (ex. ouvrir le dossier après une plongée).
      if (this._flight !== flight) {
        if (cb) cb();
        return;
      }
      const p = Math.min((now - t0) / ms, 1);
      const e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2,3)/2;   // ease-in-out cubic
      this.camera.position.lerpVectors(startPos, endPos, e);
      this.controls.target.lerpVectors(startTgt, endTgt, e);
      this.controls.update();
      if (p < 1) requestAnimationFrame(tick);
      else {
        this.flying = false;
        if (cb) cb();
      }
    };
    requestAnimationFrame(tick);
  }

  tick(t) {
    if (this.stars) this.stars.rotation.y = t * 0.00003;
    if (this.viewShift !== this.viewShiftTarget || this.viewShiftY !== this.viewShiftYTarget) {
      this.viewShift += (this.viewShiftTarget - this.viewShift) * 0.12;
      this.viewShiftY += (this.viewShiftYTarget - this.viewShiftY) * 0.12;
      if (Math.abs(this.viewShift - this.viewShiftTarget) < 0.5) this.viewShift = this.viewShiftTarget;
      if (Math.abs(this.viewShiftY - this.viewShiftYTarget) < 0.5) this.viewShiftY = this.viewShiftYTarget;
      this._applyViewShift();
    }
    this.controls.update();

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  get domElement() { return this.renderer.domElement; }
}
