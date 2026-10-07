import './style.css';
import * as THREE from 'three';
import { fetchUniverse, demoUniverse, ancestorsOf, VisualType, TYPE_LABEL, TYPE_COLOR } from './universe.js';
import { GalaxyRenderer } from './renderer.js';
import { createBody, createStar, createOrbit, disposeTree, seededRandom, nodeSeed, bodyRadius } from './objects.js';
import { discLayout, orbitLayout, placeMoons, orbitPoint, setOrbit, orbitShape } from './layout.js';
import { esc, dot } from './dom.js';
import { SearchPalette } from './search.js';
import { renderPanel } from './panel.js';
import { LabelLayer } from './labels.js';
import { LinkGraph } from './links.js';
import { hashFor, nodeForHash } from './url.js';
import { Constellation } from './constellation.js';

// ─── State ────────────────────────────────────────────────────────────────────
let renderer;
let universe;
let currentLevel = 'root';   // 'root' | 'directory'
let currentNode = null;      // currently "entered" node
let currentObjects = [];     // Three.js groups in the current view
let orbitObjects = [];       // orbit lines
let links = null;            // filaments et portails (créé avec le renderer)
let restoringUrl = false;    // navigation issue de l'URL : on remplace l'entrée d'historique
let holdUrl = false;         // étape intermédiaire : pas d'entrée d'historique
let constellation = null;    // vue globale du vault (null = vue système)
let constellationReturn = null;
let constSelected = null;    // repère de la note sélectionnée dans la constellation
let constHovered = null;
const CONSTELLATION_HASH = '#/@constellation';
let showLabels = true;
let selectedObject = null;
let navigationStack = [];    // breadcrumb stack [{node, camera, level}]

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 5;
const mouse = new THREE.Vector2();
let hoveredObject = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const loadingStatus = document.getElementById('loading-status');
const hud = document.getElementById('hud');
const infoPanel = document.getElementById('info-panel');
const btnBack = document.getElementById('btn-back');
const btnReset = document.getElementById('btn-reset');
const btnClosePanel = document.getElementById('btn-close-panel');
const btnSearch = document.getElementById('btn-search');
const btnFullscreen = document.getElementById('btn-fullscreen');
const breadcrumb = document.getElementById('breadcrumb');
const tooltip = document.getElementById('tooltip');
// Choisir une note l'ouvre dans son système (caméra comprise), un dossier y emmène.
const search = new SearchPalette(
  {
    overlay: document.getElementById('search-overlay'),
    input: document.getElementById('search-input'),
    results: document.getElementById('search-results'),
  },
  entry => (entry.node.type === 'MARKDOWN_FILE' ? goToNote(entry.node) : revealNode(entry)),
);
const labels = new LabelLayer(document.getElementById('label-layer'));

// Taille minimale à l'écran (rayon en px) d'une lune : une note ne doit jamais disparaître.
const MOON_MIN_PX = 3.5;

// ─── Utilities ────────────────────────────────────────────────────────────────

function setLoadingProgress(pct, statusText) {
  if (loadingFill) loadingFill.style.width = `${pct}%`;
  if (loadingStatus && statusText) loadingStatus.textContent = statusText;
}

function showHUD() {
  if (hud) {
    hud.classList.remove('hidden');
    setTimeout(() => hud.classList.add('visible'), 50);
  }
}

function hideLoading() {
  if (loadingScreen) {
    loadingScreen.classList.add('fade-out');
  }
}

// ─── Scene building ───────────────────────────────────────────────────────────

/** Étiquette HTML de l'astre (voir labels.js). */
function addLabel(obj, node) {
  labels.add(obj, node, TYPE_COLOR[node.visualType], node.type === 'MARKDOWN_FILE' ? 'note' : 'dir');
}

function clearScene() {
  // Retirer de la scène ne suffit pas : sans dispose(), géométries et textures
  // générées (surfaces de planètes, labels) restent en mémoire GPU à chaque vue.
  const drop = o => {
    renderer.scene.remove(o);
    disposeTree(o);
  };
  if (constellation) {
    constellation.dispose();
    constellation = null;
    constSelected = null;
    constHovered = null;
    document.body.classList.remove('is-constellation');
    document.getElementById('constellation-bar').hidden = true;
  }
  currentObjects.forEach(drop);
  labels.clear();
  orbitObjects.forEach(drop);
  if (links) links.clear();
  currentObjects = [];
  orbitObjects = [];
  hoveredObject = null;
  selectedObject = null;
  hideInfoPanel();
}

/**
 * Root view — all top-level galaxies arranged in a fibonacci sphere
 */
function buildRootView(universeData) {
  clearScene();
  currentLevel = 'root';
  currentNode = null;

  const dirs = universeData.children.filter(c => c.type === 'DIRECTORY');
  const files = universeData.children.filter(c => c.type === 'MARKDOWN_FILE');

  // Superamas (dossiers racines) disposés en spirale de Fermat
  const positions = discLayout(dirs.length);
  dirs.forEach((node, i) => {
    const pos = positions[i];
    const obj = createBody(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;

    addLabel(obj, node);

    currentObjects.push(obj);
  });

  // Notes posées à la racine du vault : lunes en halo, loin des superamas
  const rootRand = seededRandom(nodeSeed({ name: universeData.name || 'root' }, 'layout:'));
  const moons = placeMoons(files, 150, 270, rootRand);
  files.forEach((node, i) => {
    const pos = moons.positions[i];
    const obj = createBody(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    setOrbit(obj, pos, moons.planes[i].incl, moons.planes[i].omega, moons.shapes[i].ecc, moons.shapes[i].orient);
    addLabel(obj, node);
    currentObjects.push(obj);
  });

  links.build(currentObjects);
  updateBreadcrumb();
  updateBackButtonState();
  syncUrl(null);
}

// ─── Paramètres visuels par type d'astre ─────────────────────────────────────

/** Plages radiales (min, max) de l'anneau des enfants par type de dossier. */
const ORBIT_RANGE = {
  [VisualType.SUPERCLUSTER]: [90, 260],
  [VisualType.CLUSTER]:      [70, 210],
  [VisualType.GALAXY]:       [60, 180],
  [VisualType.STAR]:         [50, 150],
  [VisualType.PLANET]:       [42, 130],
  [VisualType.DWARF_PLANET]: [36, 110],
  [VisualType.SMALL_BODY]:   [34, 100],
};

/** Couleur du tracé d'orbite par type d'astre enfant. */
const ORBIT_COLOR = {
  [VisualType.SUPERCLUSTER]: 0x6D28D9,
  [VisualType.CLUSTER]:      0x8B5CF6,
  [VisualType.GALAXY]:       0xA78BFA, // violet éclairci : lisible sur l'encre
  [VisualType.STAR]:         0x22D3EE,
  [VisualType.PLANET]:       0x0891B2,
  [VisualType.DWARF_PLANET]: 0xF9A8D4,
  [VisualType.SMALL_BODY]:   0x9CA3AF,
  [VisualType.MOON]:         0x059669,
};

/** Opacité du tracé d'orbite par type : un repère discret (aucun tracé n'existe
 *  dans le vrai ciel), plus marqué pour les grands corps. */
const ORBIT_OPACITY = {
  [VisualType.SUPERCLUSTER]: 0.22,
  [VisualType.CLUSTER]:      0.22,
  [VisualType.GALAXY]:       0.26,
  [VisualType.STAR]:         0.2,
  [VisualType.PLANET]:       0.2,
  [VisualType.DWARF_PLANET]: 0.18,
  [VisualType.SMALL_BODY]:   0.18,
  [VisualType.MOON]:         0.1,
};

/**
 * Vue générique d'un dossier : le dossier devient l'astre central de son type
 * (superamas, amas, galaxie, étoile, planète…) et ses enfants — sous-dossiers
 * et notes — orbitent autour de lui. Même narration pour tous les niveaux.
 */
function buildDirectoryView(node) {
  clearScene();
  currentLevel = 'directory';
  currentNode = node;

  const children = node.children || [];
  const dirs = children.filter(c => c.type === 'DIRECTORY');
  const files = children.filter(c => c.type === 'MARKDOWN_FILE');

  const center = new THREE.Vector3(0, 0, 0);
  // Le soleil central a TOUJOURS sa propre représentation (étoile), quel que
  // soit le niveau : c'est lui que les corps célestes du dossier orbitent.
  const centralObj = createStar(renderer.scene, node, center, 0);
  centralObj.userData.clickable = false;
  currentObjects.push(centralObj);

  // Sous-dossiers : chaque enfant orbite selon son propre type céleste.
  const childType = dirs[0]?.visualType ?? VisualType.MOON;
  const range = ORBIT_RANGE[childType] || [36, 120];
  const rand = seededRandom(nodeSeed(node, 'layout:'));
  // Les notes orbitent juste au-dessus de la surface du soleil, les sous-dossiers
  // au-delà : sans ça, les lunes d'un gros dossier tournaient dans le soleil.
  const starEdge = (centralObj.userData.visualRadius ?? 30) + 8;
  const moons = placeMoons(files, starEdge, starEdge + 70, rand);
  const moonSizes = files.map(bodyRadius);
  const moonsOuter = files.length
    ? Math.max(...moons.positions.map((p, i) => p.length() * (1 + moons.shapes[i].ecc) + moonSizes[i]))
    : starEdge;
  const { positions, planes } = orbitLayout(dirs.length, Math.max(range[0], moonsOuter + 12), range[1], dirs.map(bodyRadius), rand);

  dirs.forEach((child, i) => {
    const pos = positions[i];
    const obj = createBody(renderer.scene, child, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    const { ecc, orient } = orbitShape(child, 0.04, 0.10);   // ellipse légère, Soleil au foyer
    setOrbit(obj, pos, planes[i].incl, planes[i].omega, ecc, orient);

    const orbit = createOrbit(
      renderer.scene, center, pos.length(),
      ORBIT_COLOR[childType],
      obj.userData.orbitIncl, obj.userData.orbitOmega,
      ecc, orient,
      ORBIT_OPACITY[childType] ?? 0.15,
    );
    orbitObjects.push(orbit);

    addLabel(obj, child);

    currentObjects.push(obj);
  });

  // Notes Markdown : lunes en orbite proche de l'astre.
  files.forEach((child, i) => {
    const pos = moons.positions[i];
    const obj = createBody(renderer.scene, child, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    setOrbit(obj, pos, moons.planes[i].incl, moons.planes[i].omega, moons.shapes[i].ecc, moons.shapes[i].orient);
    // Tracé très discret : il rend lisible le plan propre à chaque note.
    orbitObjects.push(createOrbit(
      renderer.scene, center, pos.length(), ORBIT_COLOR[VisualType.MOON],
      moons.planes[i].incl, moons.planes[i].omega, moons.shapes[i].ecc, moons.shapes[i].orient,
      files.length > 15 ? 0.05 : ORBIT_OPACITY[VisualType.MOON],
    ));
    addLabel(obj, child);
    currentObjects.push(obj);
  });

  links.build(currentObjects);
  updateBreadcrumb();
  updateBackButtonState();
  syncUrl(node);
}

// ─── Cadrage caméra ───────────────────────────────────────────────────────────

/**
 * Boîte englobante horizontale de la vue courante : centre et rayon.
 *
 * On mesure le centre plutôt que de viser l'origine, car la disposition
 * en spirale de Fermat n'est pas symétrique — avec quatre galaxies, son
 * barycentre est nettement décalé et la dernière sortait du cadre.
 */
function viewBounds() {
  if (currentObjects.length === 0) return { cx: 0, cz: 0, radius: 60 };

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  currentObjects.forEach(o => {
    const own = o.userData.visualRadius ?? 0;
    minX = Math.min(minX, o.position.x - own);
    maxX = Math.max(maxX, o.position.x + own);
    minZ = Math.min(minZ, o.position.z - own);
    maxZ = Math.max(maxZ, o.position.z + own);
  });

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
  return { cx, cz, radius: radius || 60 };
}

// Hauteur relative de la caméra (vue en plongée). En portrait, on plonge davantage :
// le plan des orbites s'étale alors en hauteur au lieu d'une fine bande.
const camElev = () => (renderer && renderer.w < renderer.h ? 0.62 : 0.34);
const FRAME_FILL = 0.88; // fraction du cadre occupée (laisse la marge des labels)

/** Position de caméra à la distance `d` du centre visé, inclinaison constante. */
function camPosAt(cx, cz, d) {
  return new THREE.Vector3(
    cx,
    d * camElev(),
    cz + d * Math.sqrt(1 - camElev() * camElev()),
  );
}

/**
 * Recule la caméra juste assez pour contenir la vue.
 *
 * On projette réellement les astres au lieu de calculer la distance
 * analytiquement : le plan des astres est vu en biais, donc la perspective
 * rapproche énormément les objets du bord proche. Une formule basée sur un
 * simple rayon laissait systématiquement sortir l'astre le plus près.
 */
function frameCurrentView(ms = 1000) {
  if (!renderer) return;
  const { cx, cz, radius } = viewBounds();
  const target = new THREE.Vector3(cx, 0, cz);

  // Points à contenir : chaque astre étendu de son rayon visuel.
  const pts = [];
  currentObjects.forEach(o => {
    const r = o.userData.visualRadius ?? 0;
    [[-r, 0, 0], [r, 0, 0], [0, 0, -r], [0, 0, r], [0, r, 0]].forEach(([dx, dy, dz]) => {
      pts.push(new THREE.Vector3(o.position.x + dx, o.position.y + dy, o.position.z + dz));
    });
  });

  const probe = renderer.camera.clone();
  probe.clearViewOffset();
  if (!(probe.aspect > 0)) probe.aspect = 16 / 9;
  // Avec le panneau ouvert, la vue est décalée de `shift` px : l'espace libre
  // se réduit de 2·shift en largeur, la marge horizontale aussi.
  const xLimit = FRAME_FILL - (2 * renderer.viewShiftTarget) / renderer.w;

  let d = Math.max(radius * 1.6, 40);
  for (let i = 0; i < 24 && pts.length > 0; i++) {
    probe.position.copy(camPosAt(cx, cz, d));
    probe.lookAt(target);
    probe.updateMatrixWorld();
    probe.updateProjectionMatrix();

    let worst = 0;
    for (const p of pts) {
      // z négatif en espace caméra = devant l'objectif. Un point derrière
      // rend la projection inexploitable, on force alors un recul.
      const local = p.clone().applyMatrix4(probe.matrixWorldInverse);
      if (local.z > -probe.near) { worst = Infinity; break; }
      const ndc = p.clone().project(probe);
      worst = Math.max(worst, (Math.abs(ndc.x) * FRAME_FILL) / xLimit, Math.abs(ndc.y));
    }

    if (worst <= FRAME_FILL) break;
    d *= Number.isFinite(worst) ? Math.max(1.08, worst / FRAME_FILL) : 1.5;
  }

  renderer.flyTo(camPosAt(cx, cz, d), target, ms);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function enterNode(node) {
  if (node.type === 'MARKDOWN_FILE') return;   // les notes n'ont pas de vue

  const savedCamera = {
    pos: renderer.camera.position.clone(),
    target: renderer.controls.target.clone(),
  };

  navigationStack.push({ node: currentNode, camera: savedCamera, level: currentLevel });

  // Plongée : la caméra fonce dans l'astre, puis le système apparaît depuis son soleil.
  leavingCamera = cameraSnapshot();
  const obj = currentObjects.find(o => o.userData.node === node);
  const open = () => {
    buildDirectoryView(node);
    renderer.camera.position.set(0, 10, 26);
    renderer.controls.target.set(0, 0, 0);
    frameCurrentView(1100);
  };
  if (!obj) {
    open();
    return;
  }
  const wp = obj.position.clone();
  const toCam = renderer.camera.position.clone().sub(wp).normalize();
  const close = (obj.userData.visualRadius ?? 10) * 0.6;
  renderer.flyTo(wp.clone().addScaledVector(toCam, close), wp, 480, open);
}

/**
 * Retour : le même historique que le bouton précédent du navigateur (chaque
 * étape mémorise sa caméra). Arrivé au début de la session, on remonte d'un
 * niveau dans l'arborescence à la place.
 */
function goBack() {
  if (histIndex() > 0) history.back();
  else if (navigationStack.length > 0) goBackTo(navigationStack.length - 1);
}

/** Remonte d'un coup à l'entrée `i` de la pile : une seule reconstruction, un seul vol. */
function goBackTo(i) {
  if (i < 0 || i >= navigationStack.length) return;
  const target = navigationStack[i];
  navigationStack = navigationStack.slice(0, i);
  if (target.level === 'root' || !target.node) buildRootView(universe);
  else buildDirectoryView(target.node);
  if (target.camera) renderer.flyTo(target.camera.pos, target.camera.target, 900);
  else frameCurrentView(900);
}

function resetToRoot() {
  navigationStack = [];
  buildRootView(universe);
  frameCurrentView(1200);
}

function updateBackButtonState() {
  if (btnBack) btnBack.disabled = histIndex() === 0 && navigationStack.length === 0;
  if (btnReset) btnReset.disabled = navigationStack.length === 0;
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

/** Ouvre un enfant depuis le panneau : on entre dans un dossier, on sélectionne une note. */
function openChild(child) {
  if (child.type !== 'MARKDOWN_FILE') {
    enterNode(child);
    return;
  }
  const obj = currentObjects.find(o => o.userData.node === child);
  if (obj) selectObject(obj);
  else goToNote(child);
}

function showInfoPanel(node) {
  renderPanel(node, {
    isCurrent: node === currentNode,
    onEnter: () => enterNode(node),
    onEntry: n => (node.type === 'MARKDOWN_FILE' ? goToNote(n) : openChild(n)),
  });
  infoPanel.classList.remove('panel-hidden');
  infoPanel.classList.add('panel-visible');
  // Recentre la scène dans l'espace laissé libre : à gauche du panneau sur
  // grand écran, au-dessus du tiroir (52 % de la hauteur) sur mobile.
  if (renderer) {
    if (window.innerWidth > 768) renderer.setViewShift(176, 0);
    else renderer.setViewShift(0, Math.round(window.innerHeight * 0.24));
  }
}

function hideInfoPanel() {
  if (infoPanel) {
    infoPanel.classList.add('panel-hidden');
    infoPanel.classList.remove('panel-visible');
  }
  if (renderer) renderer.setViewShift(0);
  selectedObject = null;
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function updateBreadcrumb() {
  if (!breadcrumb) return;
  breadcrumb.innerHTML = '';

  const addItem = (label, visualType, handler) => {
    if (breadcrumb.children.length > 0) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '/';
      breadcrumb.appendChild(sep);
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `bc-item${handler ? '' : ' active'}`;
    item.title = label;
    item.innerHTML = `${visualType ? dot(visualType, 'bc-dot') : ''}<span>${esc(label)}</span>`;
    if (handler) item.addEventListener('click', handler);
    else item.disabled = true;
    breadcrumb.appendChild(item);
  };

  addItem('Univers', null, navigationStack.length > 0 || constellation ? resetToRoot : null);

  navigationStack.forEach((entry, i) => {
    if (!entry.node || constellation) return;
    // L'entrée i de la pile est la vue « dans » entry.node : on y remonte directement.
    addItem(entry.node.name, entry.node.visualType, () => goBackTo(i));
  });

  if (constellation) addItem('Constellation', null, null);
  else if (currentNode) addItem(currentNode.name, currentNode.visualType, null);
  // Le dossier courant (en fin de fil) doit rester visible, même sur petit écran.
  breadcrumb.scrollLeft = breadcrumb.scrollWidth;
}

// ─── Raycasting / Interaction ─────────────────────────────────────────────────

function getClickableObjects() {
  return currentObjects.filter(o => o.userData.clickable);
}

function raycast(event) {
  if (!renderer) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, renderer.camera);
  const targets = getClickableObjects().flatMap(g => g.children.filter(c => c.userData?.isCore === true));
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length === 0) return null;

  const hitObj = hits[0].object;
  // Find parent group
  return getClickableObjects().find(g => g.children.includes(hitObj)) || null;
}

function onMouseMoveConstellation(event) {
  const note = pickStar(event);
  constHovered = note ? constellation.proxyOf(note) : null;
  renderer.domElement.style.cursor = note ? 'pointer' : 'grab';
  if (!tooltip) return;
  if (note) {
    const cites = (note._in || []).length;
    tooltip.innerHTML = `${dot(VisualType.MOON, 'tip-dot')}<span>${esc(note.name)}${cites ? ` · ${cites} citation${cites > 1 ? 's' : ''}` : ''}</span>`;
    tooltip.classList.add('visible');
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY - 10}px`;
  } else {
    tooltip.classList.remove('visible');
  }
}

function pickStar(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, renderer.camera);
  return constellation.pick(raycaster, renderer.camera);
}

function onMouseMove(event) {
  if (constellation) {
    onMouseMoveConstellation(event);
    return;
  }
  const hit = raycast(event);

  if (hit !== hoveredObject) {
    hoveredObject = hit;
    if (hoveredObject) {
      if (renderer) renderer.domElement.style.cursor = 'pointer';

      const node = hoveredObject.userData.node;
      if (tooltip) {
        tooltip.innerHTML = `${dot(node.visualType, 'tip-dot')}<span>${esc(node.name)}</span>`;
        tooltip.classList.add('visible');
      }
    } else {
      if (renderer) renderer.domElement.style.cursor = 'grab';
      if (tooltip) tooltip.classList.remove('visible');
    }
  }

  if (hoveredObject && tooltip) {
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY - 10}px`;
  }
}

let lastClickTime = 0;

function onClick(event) {
  if (constellation) {
    const note = pickStar(event);
    const now = Date.now();
    const isDouble = note && now - lastClickTime < 350;
    lastClickTime = now;
    if (isDouble) goToNote(note);   // double-clic : on rejoint la note dans son système
    else selectStar(note);
    return;
  }
  const hit = raycast(event);
  if (!hit) {
    // If not clicking UI, hide info panel
    if (!event.target.closest('#hud') && !event.target.closest('#tooltip')) {
      closePanel();
    }
    return;
  }

  const now = Date.now();
  const isDouble = now - lastClickTime < 350;
  lastClickTime = now;

  if (isDouble && hit.userData.node.type !== 'MARKDOWN_FILE') {
    enterNode(hit.userData.node);
    return;
  }

  selectObject(hit);
}

/** Sélectionne un astre : panneau d'infos, vol doux vers lui, URL si c'est une note. */
function selectObject(obj, ms = 700) {
  selectedObject = obj;
  const node = obj.userData.node;
  showInfoPanel(node);
  const wp = new THREE.Vector3();
  obj.getWorldPosition(wp);
  const dist = Math.max(30, (obj.userData.visualRadius ?? 10) * 5);
  const camOffset = renderer.camera.position.clone().sub(wp).normalize().multiplyScalar(dist);
  renderer.flyTo(
    { x: wp.x + camOffset.x, y: wp.y + camOffset.y + dist * 0.25, z: wp.z + camOffset.z },
    { x: wp.x, y: wp.y, z: wp.z },
    ms,
  );
  if (node.type === 'MARKDOWN_FILE') syncUrl(node);
}

/** Astres sélectionnables au clavier, dans l'ordre d'affichage. */
function cycleSelection(step) {
  const list = getClickableObjects();
  if (!list.length) return;
  const i = list.indexOf(selectedObject);
  selectObject(list[(i + step + list.length) % list.length], 500);
}

/** Va voir une note n'importe où dans le vault (liens, portails, URL). */
function goToNote(note) {
  // Une seule entrée d'historique (la note), pas une pour le dossier traversé.
  holdUrl = true;
  revealNode({ node: note, ancestors: ancestorsOf(note) }, { frame: false });
  holdUrl = false;
  const obj = currentObjects.find(o => o.userData.node === note);
  if (obj) selectObject(obj, 900);
  else {
    frameCurrentView(900);
    syncUrl(note);
  }
}

function onPortal(notes, folder) {
  if (notes.length === 1) goToNote(notes[0]);
  else revealNode({ node: folder, ancestors: ancestorsOf(folder) });
}

// ─── Constellation ────────────────────────────────────────────────────────────

function enterConstellation() {
  if (constellation || !universe) return;
  constellationReturn = currentNode;
  clearScene();
  constellation = new Constellation(renderer.scene, universe);
  for (const p of constellation.proxies) labels.add(p, p.userData.node, '#cbd5e1', 'note');
  const { center, radius } = constellation.bounds();
  renderer.flyTo(
    { x: center.x, y: center.y + radius * 0.55, z: center.z + radius * 1.55 },
    center,
    1300,
  );
  document.body.classList.add('is-constellation');
  document.getElementById('constellation-bar').hidden = false;
  setConstellationFilter('all');
  breadcrumb.innerHTML = '';
  updateBreadcrumb();
  setHash(CONSTELLATION_HASH);
}

function exitConstellation() {
  if (!constellation) return;
  if (constellationReturn) buildDirectoryView(constellationReturn);
  else buildRootView(universe);
  frameCurrentView(1100);
}

function toggleConstellation() {
  if (constellation) exitConstellation();
  else enterConstellation();
}

function setConstellationFilter(kind) {
  if (!constellation) return;
  constellation.setFilter(kind);
  document.querySelectorAll('#constellation-bar [data-filter]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.filter === kind);
  });
  document.getElementById('constellation-count').textContent = `${constellation.count()} notes`;
}

function selectStar(note) {
  constSelected = note ? constellation.proxyOf(note) : null;
  constellation.setFocus(note);
  if (!note) {
    hideInfoPanel();
    return;
  }
  showInfoPanel(note);
  const wp = new THREE.Vector3();
  constSelected.getWorldPosition(wp);
  const dir = renderer.camera.position.clone().sub(wp).normalize();
  renderer.flyTo(wp.clone().addScaledVector(dir, 90), wp, 800);
}

// ─── URL ──────────────────────────────────────────────────────────────────────

// Historique : chaque entrée porte son rang (i) et la caméra au moment où on l'a quittée.
// Caméra à mémoriser pour l'étape qu'on quitte, capturée avant une plongée
// (sinon on enregistrerait la caméra déjà rentrée dans l'astre).
let leavingCamera = null;

function cameraSnapshot() {
  return { pos: renderer.camera.position.toArray(), target: renderer.controls.target.toArray() };
}

function histIndex() {
  return (history.state && history.state.i) || 0;
}

function setHash(h, replace = false) {
  if (location.hash === h) return;
  if (replace || restoringUrl) {
    history.replaceState({ ...(history.state || {}), i: histIndex() }, '', h);
  } else {
    if (renderer) {
      history.replaceState({
        ...(history.state || {}),
        i: histIndex(),
        cam: leavingCamera || cameraSnapshot(),
      }, '', location.hash || '#/');
    }
    leavingCamera = null;
    history.pushState({ i: histIndex() + 1 }, '', h);
  }
  updateBackButtonState();
}

function syncUrl(node, replace = false) {
  if (!universe || !universe._index || holdUrl) return;
  setHash(hashFor(node, universe._index.vaultDir), replace);
}

function navigateFromUrl(cam = null) {
  const node = nodeForHash(location.hash, universe && universe._index);
  restoringUrl = true;
  try {
    if (location.hash === CONSTELLATION_HASH) {
      enterConstellation();
    } else if (!node) {
      navigationStack = [];
      buildRootView(universe);
      frameCurrentView(900);
    } else if (node.type === 'MARKDOWN_FILE') {
      goToNote(node);
    } else {
      revealNode({ node, ancestors: ancestorsOf(node) }, { panel: false });
    }
    // Retour dans l'historique : on retrouve la caméra telle qu'on l'avait laissée.
    if (cam) {
      renderer.flyTo(new THREE.Vector3(...cam.pos), new THREE.Vector3(...cam.target), 900);
    }
  } finally {
    restoringUrl = false;
    updateBackButtonState();
  }
}

/** Fermeture du panneau par l'utilisateur : l'URL revient au dossier affiché. */
function closePanel() {
  if (constellation) {
    selectStar(null);
    return;
  }
  hideInfoPanel();
  syncUrl(currentNode, true);
}

// ─── Animations ───────────────────────────────────────────────────────────────

// Horloge de simulation : les orbites peuvent ralentir (survol), s'arrêter
// (Espace) ou tourner au ralenti si le système demande moins d'animations.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let simT = 0;
let simRate = 1;
let lastFrame = null;
let orbitsPaused = false;

function advanceSim(time) {
  const dt = lastFrame === null ? 0 : Math.min(0.1, (time - lastFrame) / 1000);
  lastFrame = time;
  const target = orbitsPaused ? 0 : (hoveredObject ? 0.15 : 1) * (reducedMotion ? 0.3 : 1);
  simRate += (target - simRate) * Math.min(1, dt * 6);
  simT += dt * simRate;
  return simT;
}

function toggleOrbits() {
  orbitsPaused = !orbitsPaused;
  document.getElementById('pause-pill').hidden = !orbitsPaused;
}

function animateObjects(time) {
  const t = advanceSim(time);

  currentObjects.forEach((obj, i) => {
    const vt = obj.userData?.node?.visualType;
    const isClickable = obj.userData.clickable;

    // Orbite inclinée : tout corps non central tourne autour de son astre.
    const orbiting = isClickable && Number.isFinite(obj.userData?.orbitRadius);
    if (orbiting) {
      const baseAngle = obj.userData.orbitAngle ?? 0;
      const speed = obj.userData.orbitSpeed ?? 0.03;
      const angle = baseAngle + t * speed;
      const r = obj.userData.orbitRadius;
      const p = orbitPoint(
        r, angle,
        obj.userData.orbitIncl ?? 0, obj.userData.orbitOmega ?? 0,
        obj.userData.orbitEcc ?? 0, obj.userData.orbitOrient ?? 0,
      );
      obj.position.x = p.x;
      obj.position.y = p.y + Math.sin(t * 1.5 + i * 1.3) * 0.5;
      obj.position.z = p.z;
    }

    switch (vt) {
      case VisualType.SUPERCLUSTER:
      case VisualType.CLUSTER:
      case VisualType.GALAXY:
        // Le disque tourne autour de son propre axe (incliné) : les bras sont des
        // ondes de densité, ils ne « coulent » pas vers l'extérieur.
        (obj.userData.spins || []).forEach((sp, k) => { sp.rotation.y = t * (isClickable ? 0.03 : 0.01) * (1 + (k % 3) * 0.3); });
        break;
      case VisualType.STAR:
        obj.rotation.y = isClickable ? (t * 0.04 + i * 0.7) : (t * 0.005);
        break;
      default:
        // Planètes, planètes naines, petits corps et lunes
        obj.rotation.y = isClickable ? (t * 0.08) : (t * 0.01);
        break;
    }

    // Soleils (centraux ou en orbite) : pulsation douce + animation GPU des
    // shaders (plasma, couronne, protubérances). Indépendant du type du nœud :
    // un soleil central peut être un amas/planète dans la taxonomie.
    if (obj.userData.type === 'star') {
      const pulse = 1 + Math.sin(t * 2.2 + i * 1.7) * 0.035;
      obj.scale.setScalar(pulse);
      (obj.userData.sunUniforms || []).forEach(u => { u.value = t; });
    }

    // Couche de nuages des planètes : dérive indépendante de la rotation
    // du globe (t est cumulatif, on pose donc la rotation absolue).
    if (obj.userData.cloudSpin && obj.userData.cloudSkin) {
      obj.userData.cloudSkin.rotation.y = t * obj.userData.cloudSpin;
    }

    // Gentle float (locked oscillation around baseY to prevent accumulation drift)
    // Les corps orbitants sont exclus : leur y vient du plan orbital incliné.
    if (isClickable && !orbiting) {
      const baseY = obj.userData.baseY ?? 0;
      obj.position.y = baseY + Math.sin(t * 1.5 + i * 1.3) * 0.5;
    }
  });

  // Échelle : grossissement au survol, et taille minimale à l'écran pour les lunes.
  const cam = renderer.camera;
  const pxPerUnit = renderer.h / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  currentObjects.forEach(obj => {
    if (obj.userData.type === 'star' || !obj.userData.clickable) return;
    let s = obj === hoveredObject ? 1.08 : 1;
    const core = obj.userData.coreRadius;
    if (core) {
      const dist = obj.position.distanceTo(cam.position);
      s *= Math.max(1, (MOON_MIN_PX * dist) / pxPerUnit / core);
    }
    obj.scale.setScalar(s);
  });

}

// ─── Recherche ────────────────────────────────────────────────────────────────

function buildViewFor(node) {
  if (node.type === 'MARKDOWN_FILE') return false;
  buildDirectoryView(node);
  return true;
}

/**
 * Saute directement sur un nœud depuis la recherche. On reconstruit la pile
 * de navigation à partir des ancêtres, sinon le fil d'Ariane et le bouton
 * Retour se retrouveraient désynchronisés de la vue affichée.
 */
function revealNode(entry, { panel = true, frame = true } = {}) {
  const { node, ancestors } = entry;
  const isFile = node.type === 'MARKDOWN_FILE';
  // Un fichier n'a pas de vue propre : on ouvre son dossier parent.
  const viewNode = isFile ? ancestors[ancestors.length - 1] : node;
  const chain = isFile ? ancestors.slice(0, -1) : ancestors;

  // camera: null → au retour, on recadrera sur le contenu plutôt que de
  // restaurer une position que l'utilisateur n'a jamais occupée.
  navigationStack = [{ node: null, camera: null, level: 'root' }];
  chain.forEach(a => navigationStack.push({
    node: a, camera: null, level: 'directory',
  }));

  if (!viewNode || !buildViewFor(viewNode)) {
    navigationStack = [];
    buildRootView(universe);
  }

  updateBreadcrumb();
  updateBackButtonState();
  if (panel) showInfoPanel(node);   // après buildView (qui vide le panneau), avant le cadrage qui en tient compte
  if (frame) frameCurrentView(900);
}

// ─── Contrôles de vue ─────────────────────────────────────────────────────────

function zoomBy(factor) {
  if (!renderer) return;
  const target = renderer.controls.target;
  const pos = renderer.camera.position;
  const dir = new THREE.Vector3().subVectors(target, pos).normalize();
  const dist = pos.distanceTo(target);
  renderer.flyTo(pos.clone().addScaledVector(dir, dist * factor), target, 350);
}

function toggleLabels() {
  showLabels = !showLabels;
  labels.setVisible(showLabels);
  const btn = document.getElementById('btn-tool-labels');
  if (btn) btn.classList.toggle('is-off', !showLabels);
}

function recenter() {
  if (constellation) {
    const { center, radius } = constellation.bounds();
    renderer.flyTo({ x: center.x, y: center.y + radius * 0.55, z: center.z + radius * 1.55 }, center, 700);
    return;
  }
  frameCurrentView(700);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ─── Main loop ────────────────────────────────────────────────────────────────

// Astres dont l'étiquette passe en priorité : survolé, sélectionné, et ceux qui lui sont liés.
function focusSet() {
  const set = new Set();
  if (constellation) {
    if (constHovered) set.add(constHovered);
    if (constSelected) {
      set.add(constSelected);
      for (const o of constellation.neighborsOf(constSelected.userData.node)) set.add(o);
    }
    return set;
  }
  const anchor = selectedObject || hoveredObject;
  if (hoveredObject) set.add(hoveredObject);
  if (selectedObject) set.add(selectedObject);
  if (anchor && links) for (const o of links.neighbors(anchor)) set.add(o);
  return set;
}

// La caméra accompagne l'astre sélectionné sur son orbite (sinon il sort du champ).
let followed = null;
const followPrev = new THREE.Vector3();
function followSelection() {
  if (selectedObject !== followed) {
    followed = selectedObject;
    if (followed) followPrev.copy(followed.position);
    return;
  }
  if (!followed) return;
  if (!renderer.flying) {
    const delta = followed.position.clone().sub(followPrev);
    renderer.camera.position.add(delta);
    renderer.controls.target.add(delta);
  }
  followPrev.copy(followed.position);
}

function loop(time) {
  animateObjects(time);
  if (renderer) followSelection();
  if (renderer) {
    renderer.tick(time);
    const size = { w: renderer.w, h: renderer.h };
    labels.update(renderer.camera, size, focusSet());
    links.setPortals(selectedObject);
    links.update(selectedObject, hoveredObject, renderer.camera, size);
  }
  requestAnimationFrame(loop);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function startWith(data) {
  universe = data;
  search.setUniverse(universe);
  const initial = location.hash;
  restoringUrl = true;
  buildRootView(universe);
  restoringUrl = false;
  if (initial && initial !== '#/') {
    history.replaceState({ i: 0 }, '', initial);
    navigateFromUrl();
  } else {
    frameCurrentView(1600);   // se joue pendant le fondu de l'écran de chargement
  }
  setLoadingProgress(100, 'Prêt !');
  setTimeout(() => {
    hideLoading();
    showHUD();
  }, 600);
}

async function loadUniverse(kind) {
  const actions = document.getElementById('loading-actions');
  if (actions) actions.hidden = true;
  if (loadingFill) loadingFill.style.background = '';
  if (kind === 'demo') {
    startWith(demoUniverse());
    return;
  }
  try {
    setLoadingProgress(60, "Chargement de l'univers de notes…");
    const data = await fetchUniverse();
    setLoadingProgress(80, 'Génération de la carte stellaire…');
    startWith(data);
  } catch (err) {
    console.error('Failed to load universe:', err);
    if (loadingFill) loadingFill.style.background = '#F43F5E';
    setLoadingProgress(100, 'Impossible de joindre obsidian-back. Lance le backend (./mvnw spring-boot:run) puis réessaie.');
    if (actions) actions.hidden = false;
  }
}

async function init() {
  setLoadingProgress(10, "Initialisation de la scène 3D…");

  // Init Three.js renderer
  const canvas = document.getElementById('galaxy-canvas');
  if (!canvas) {
    console.error("Canvas element not found!");
    return;
  }
  renderer = new GalaxyRenderer(canvas);
  links = new LinkGraph(renderer.scene, document.getElementById('portal-layer'), onPortal);
  window.addEventListener('popstate', e => { if (universe) navigateFromUrl(e.state && e.state.cam); });
  setLoadingProgress(30, "Connexion à l'API obsidian-back…");

  await loadUniverse('real');

  document.getElementById('btn-retry')?.addEventListener('click', () => loadUniverse('real'));
  document.getElementById('btn-demo')?.addEventListener('click', () => loadUniverse('demo'));

  // ── Scène ──
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  // ── Navigation ──
  btnBack?.addEventListener('click', goBack);
  btnReset?.addEventListener('click', resetToRoot);
  btnClosePanel?.addEventListener('click', closePanel);

  // ── Header ──
  btnSearch?.addEventListener('click', () => search.open());
  btnFullscreen?.addEventListener('click', toggleFullscreen);

  // ── Toolbar ──
  document.getElementById('btn-tool-zoom-in')?.addEventListener('click', () => zoomBy(0.25));
  document.getElementById('btn-tool-zoom-out')?.addEventListener('click', () => zoomBy(-0.25));
  document.getElementById('btn-tool-labels')?.addEventListener('click', toggleLabels);
  document.getElementById('btn-tool-recenter')?.addEventListener('click', recenter);
  document.getElementById('btn-tool-constellation')?.addEventListener('click', toggleConstellation);
  document.querySelectorAll('#constellation-bar [data-filter]').forEach(b => {
    b.addEventListener('click', () => setConstellationFilter(b.dataset.filter));
  });
  document.getElementById('btn-exit-constellation')?.addEventListener('click', exitConstellation);

  // ── Recherche ──
  // ── Raccourcis clavier ──
  window.addEventListener('keydown', (e) => {
    if (search.isOpen) {
      if (e.key === 'Escape') { e.preventDefault(); search.close(); }
      return;   // la palette gère ses propres flèches / Entrée
    }
    // Cmd/Ctrl+K ou « / » ouvrent la recherche
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
      e.preventDefault(); search.open(); return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'Escape':    closePanel(); break;
      case 'g': case 'G': toggleConstellation(); break;
      case ' ': e.preventDefault(); toggleOrbits(); break;
      case 'ArrowRight': e.preventDefault(); cycleSelection(1); break;
      case 'ArrowLeft':  e.preventDefault(); cycleSelection(-1); break;
      case 'Enter':
        if (selectedObject && selectedObject.userData.node.type !== 'MARKDOWN_FILE') enterNode(selectedObject.userData.node);
        break;
      case 'Backspace': e.preventDefault(); goBack(); break;
      case 'r': case 'R': resetToRoot(); break;
      case 'l': case 'L': toggleLabels(); break;
      case 'c': case 'C': recenter(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case '+': case '=': zoomBy(0.25); break;
      case '-':           zoomBy(-0.25); break;
    }
  });

  // Start loop
  requestAnimationFrame(loop);
}

// Accès de debug (console) à l'état de la scène.
window.__obsidianGalaxy = {
  get renderer() { return renderer; },
  get objects() { return currentObjects; },
  get node() { return currentNode; },
  get stack() { return navigationStack; },
  get labels() { return labels; },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
