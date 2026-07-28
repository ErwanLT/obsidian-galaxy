import './style.css';
import * as THREE from 'three';
import { fetchUniverse, VisualType, TYPE_LABEL, TYPE_COLOR } from './universe.js';
import { GalaxyRenderer } from './renderer.js';
import { createGalaxy, createSolarSystem, createPlanet, createMoon, createOrbit, createLabel } from './objects.js';

// ─── State ────────────────────────────────────────────────────────────────────
let renderer;
let universe;
let currentLevel = 'root';   // 'root' | 'galaxy' | 'solar' | 'planet'
let currentNode = null;      // currently "entered" node
let currentObjects = [];     // Three.js groups in the current view
let labelObjects = [];       // label sprites
let orbitObjects = [];       // orbit lines
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
const infoBadge = document.getElementById('info-badge');
const infoName = document.getElementById('info-name');
const infoPath = document.getElementById('info-path');
const infoStats = document.getElementById('info-stats');
const infoChildren = document.getElementById('info-children');
const infoChildrenSection = document.getElementById('info-children-section');
const btnEnter = document.getElementById('btn-enter');
const btnBack = document.getElementById('btn-back');
const btnReset = document.getElementById('btn-reset');
const btnClosePanel = document.getElementById('btn-close-panel');
const btnSearch = document.getElementById('btn-search');
const btnFullscreen = document.getElementById('btn-fullscreen');
const breadcrumb = document.getElementById('breadcrumb');
const tooltip = document.getElementById('tooltip');
const searchOverlay = document.getElementById('search-overlay');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Échappe le HTML — les noms de notes viennent du disque de l'utilisateur. */
function esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Pastille de couleur correspondant au type d'astre. */
function dot(visualType, cls = 'child-dot') {
  return `<span class="${cls}" style="background:${TYPE_COLOR[visualType] || '#fff'}"></span>`;
}

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

// ─── Layout helpers ───────────────────────────────────────────────────────────

/**
 * Disposition des galaxies racine en disque (spirale de Fermat).
 *
 * Remplace une sphère de Fibonacci : celle-ci plaçait les deux premières
 * galaxies aux pôles, soit exactement sur l'axe vertical (x = z = 0), donc
 * superposées à l'écran dès que le vault comptait peu de dossiers racine.
 * Un disque garde aussi la lecture « carte stellaire » vue en plongée.
 */
function discLayout(n) {
  if (n === 0) return [];
  if (n === 1) return [new THREE.Vector3(0, 0, 0)];

  // Espacement voisin ≈ radius/√n ; on veut ~110 unités entre deux
  // galaxies, dont le rayon peut atteindre 46.
  const radius = Math.max(150, 110 * Math.sqrt(n));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: n }, (_, i) => {
    const r = radius * Math.sqrt((i + 0.5) / n);
    const a = goldenAngle * i;
    return new THREE.Vector3(
      Math.cos(a) * r,
      Math.sin(i * 2.4) * radius * 0.07,   // relief léger, déterministe
      Math.sin(a) * r,
    );
  });
}

/**
 * Circular orbit layout for children of a node
 */
function orbitLayout(n, minR, maxR) {
  const positions = [];
  if (n === 0) return positions;
  if (n === 1) {
    positions.push(new THREE.Vector3(minR + 10, 0, 0));
    return positions;
  }
  // Multiple rings if many children
  const ringCap = 8;
  let placed = 0;
  let ring = 0;
  while (placed < n) {
    const inRing = Math.min(ringCap + ring * 4, n - placed);
    const r = minR + ring * ((maxR - minR) / Math.max(1, Math.ceil(n / ringCap)));
    const tilt = (ring % 2 === 0 ? 1 : -1) * (ring * 0.15);
    for (let i = 0; i < inRing; i++) {
      const angle = (i / inRing) * Math.PI * 2 + ring * 0.4;
      positions.push(new THREE.Vector3(
        Math.cos(angle) * r,
        Math.sin(tilt + angle * 0.05) * r * 0.1,
        Math.sin(angle) * r,
      ));
      placed++;
      if (placed >= n) break;
    }
    ring++;
  }
  return positions;
}

// ─── Scene building ───────────────────────────────────────────────────────────

/**
 * Crée le label d'un astre et le rattache à son objet.
 *
 * Le lien explicite (`owner`) est indispensable : la boucle d'animation
 * appariait auparavant labels et objets par position dans les tableaux, ce
 * qui décalait chaque nom d'un cran dès que la vue contenait un astre
 * central non cliquable.
 */
function addLabel(obj, node, dy, fontSize, width) {
  if (!showLabels) return;
  const p = obj.position;
  const sprite = createLabel(
    node.name,
    new THREE.Vector3(p.x, p.y + dy, p.z),
    TYPE_COLOR[node.visualType],
    fontSize,
    width,
  );
  sprite.userData.owner = obj;
  sprite.userData.dy = dy;
  renderer.scene.add(sprite);
  labelObjects.push(sprite);
}

function clearScene() {
  currentObjects.forEach(o => renderer.scene.remove(o));
  labelObjects.forEach(o => renderer.scene.remove(o));
  orbitObjects.forEach(o => renderer.scene.remove(o));
  currentObjects = [];
  labelObjects = [];
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

  const galaxies = universeData.children;
  const positions = discLayout(galaxies.length);

  galaxies.forEach((node, i) => {
    const pos = positions[i];
    const obj = createGalaxy(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;

    addLabel(obj, node, 42, 42, 58);

    currentObjects.push(obj);
  });

  updateBreadcrumb();
  updateBackButtonState();
}

/**
 * Galaxy view — solar systems orbiting the galaxy
 */
function buildGalaxyView(galaxyNode) {
  clearScene();
  currentLevel = 'galaxy';
  currentNode = galaxyNode;

  const children = galaxyNode.children || [];
  const dirs = children.filter(c => c.type === 'DIRECTORY');
  const files = children.filter(c => c.type === 'MARKDOWN_FILE');

  // Central galaxy
  const center = new THREE.Vector3(0, 0, 0);
  const centralObj = createGalaxy(renderer.scene, galaxyNode, center, 0);
  centralObj.userData.clickable = false;
  currentObjects.push(centralObj);

  // Solar systems in orbit (more compact)
  const ssPositions = orbitLayout(dirs.length, 65, 155);
  dirs.forEach((node, i) => {
    const pos = ssPositions[i];
    const obj = createSolarSystem(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    obj.userData.orbitRadius = pos.length();
    obj.userData.orbitAngle = i * (Math.PI * 2 / Math.max(dirs.length, 1));

    const orbit = createOrbit(renderer.scene, center, pos.length(), 0x4C1D95, 0);
    orbitObjects.push(orbit);

    addLabel(obj, node, 24, 38, 40);

    currentObjects.push(obj);
  });

  // Loose markdown files as moons close in
  const moonPositions = orbitLayout(files.length, 36, 58);
  files.forEach((node, i) => {
    const pos = moonPositions[i];
    const obj = createMoon(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    obj.userData.orbitRadius = pos.length();
    obj.userData.orbitAngle = i * (Math.PI * 2 / Math.max(files.length, 1));
    addLabel(obj, node, 8, 30, 22);
    currentObjects.push(obj);
  });

  updateBreadcrumb();
  updateBackButtonState();
}

/**
 * Solar system view — planets orbiting the star
 */
function buildSolarSystemView(ssNode) {
  clearScene();
  currentLevel = 'solar';
  currentNode = ssNode;

  const children = ssNode.children || [];
  const dirs = children.filter(c => c.type === 'DIRECTORY');
  const files = children.filter(c => c.type === 'MARKDOWN_FILE');

  // Central star
  const center = new THREE.Vector3(0, 0, 0);
  const centralObj = createSolarSystem(renderer.scene, ssNode, center, 0);
  centralObj.userData.clickable = false;
  currentObjects.push(centralObj);

  // Planets (more compact)
  const pPositions = orbitLayout(dirs.length, 50, 120);
  dirs.forEach((node, i) => {
    const pos = pPositions[i];
    const obj = createPlanet(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    obj.userData.orbitRadius = pos.length();
    obj.userData.orbitAngle = i * (Math.PI * 2 / Math.max(dirs.length, 1));

    const orbit = createOrbit(renderer.scene, center, pos.length(), 0x0891B2, 0.05 * i);
    orbitObjects.push(orbit);

    addLabel(obj, node, 16, 34, 30);

    currentObjects.push(obj);
  });

  // Markdown files as moons near star
  const mPositions = orbitLayout(files.length, 35, 50);
  files.forEach((node, i) => {
    const pos = mPositions[i];
    const obj = createMoon(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    obj.userData.orbitRadius = pos.length();
    obj.userData.orbitAngle = i * (Math.PI * 2 / Math.max(files.length, 1));
    addLabel(obj, node, 7, 28, 20);
    currentObjects.push(obj);
  });

  updateBreadcrumb();
  updateBackButtonState();
}

/**
 * Planet view — moons orbiting
 */
function buildPlanetView(planetNode) {
  clearScene();
  currentLevel = 'planet';
  currentNode = planetNode;

  const children = planetNode.children || [];
  const dirs = children.filter(c => c.type === 'DIRECTORY');
  const files = children.filter(c => c.type === 'MARKDOWN_FILE');

  const center = new THREE.Vector3(0, 0, 0);
  const centralObj = createPlanet(renderer.scene, planetNode, center, 0);
  centralObj.userData.clickable = false;
  currentObjects.push(centralObj);

  // Sub-directories as sub-planets (more compact)
  const spPositions = orbitLayout(dirs.length, 36, 78);
  dirs.forEach((node, i) => {
    const pos = spPositions[i];
    const obj = createPlanet(renderer.scene, node, pos, i + 1);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    obj.userData.orbitRadius = pos.length();
    obj.userData.orbitAngle = i * (Math.PI * 2 / Math.max(dirs.length, 1));
    const orbit = createOrbit(renderer.scene, center, pos.length(), 0xF59E0B, 0.1 * i);
    orbitObjects.push(orbit);
    addLabel(obj, node, 12, 30, 24);
    currentObjects.push(obj);
  });

  // Moons (set to 35-50)
  const mPositions = orbitLayout(files.length, 35, 50);
  files.forEach((node, i) => {
    const pos = mPositions[i];
    const obj = createMoon(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;
    obj.userData.orbitRadius = pos.length();
    obj.userData.orbitAngle = i * (Math.PI * 2 / Math.max(files.length, 1));
    addLabel(obj, node, 6, 26, 18);
    currentObjects.push(obj);
  });

  updateBreadcrumb();
  updateBackButtonState();
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

const CAM_ELEV = 0.34;   // hauteur relative de la caméra — vue en plongée
const FRAME_FILL = 0.88; // fraction du cadre occupée (laisse la marge des labels)

/** Position de caméra à la distance `d` du centre visé, inclinaison constante. */
function camPosAt(cx, cz, d) {
  return new THREE.Vector3(
    cx,
    d * CAM_ELEV,
    cz + d * Math.sqrt(1 - CAM_ELEV * CAM_ELEV),
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
  if (!(probe.aspect > 0)) probe.aspect = 16 / 9;

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
      worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y));
    }

    if (worst <= FRAME_FILL) break;
    d *= Number.isFinite(worst) ? Math.max(1.08, worst / FRAME_FILL) : 1.5;
  }

  renderer.flyTo(camPosAt(cx, cz, d), target, ms);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function enterNode(node) {
  const savedCamera = {
    pos: renderer.camera.position.clone(),
    target: renderer.controls.target.clone(),
  };

  navigationStack.push({ node: currentNode, camera: savedCamera, level: currentLevel });

  switch (node.visualType) {
    case VisualType.GALAXY:
      buildGalaxyView(node);
      break;
    case VisualType.SOLAR_SYSTEM:
      buildSolarSystemView(node);
      break;
    case VisualType.PLANET:
      buildPlanetView(node);
      break;
    default:
      return; // moons/files don't enter
  }

  frameCurrentView(1000);
}

function goBack() {
  if (navigationStack.length === 0) return;
  const prev = navigationStack.pop();

  if (prev.level === 'root' || !prev.node) {
    buildRootView(universe);
  } else {
    switch (prev.node.visualType) {
      case VisualType.GALAXY: buildGalaxyView(prev.node); break;
      case VisualType.SOLAR_SYSTEM: buildSolarSystemView(prev.node); break;
      case VisualType.PLANET: buildPlanetView(prev.node); break;
      default: buildRootView(universe);
    }
  }

  if (prev.camera) {
    renderer.flyTo(prev.camera.pos, prev.camera.target, 900);
  } else {
    // Entrée synthétique (venue de la recherche) : pas de caméra à restaurer.
    frameCurrentView(900);
  }
}

function resetToRoot() {
  navigationStack = [];
  buildRootView(universe);
  frameCurrentView(1200);
}

function updateBackButtonState() {
  if (btnBack) btnBack.disabled = navigationStack.length === 0;
  if (btnReset) btnReset.disabled = navigationStack.length === 0;
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

const MAX_CHILDREN_SHOWN = 14;

function showInfoPanel(node) {
  const vt = node.visualType;

  if (infoBadge) {
    infoBadge.textContent = TYPE_LABEL[vt] || '';
    infoBadge.className = vt;
  }

  if (infoName) infoName.textContent = node.name;
  if (infoPath) infoPath.textContent = node.path || '';

  // Stats en lignes label → valeur : ça se scanne verticalement.
  const children = node.children || [];
  const folders = children.filter(c => c.type === 'DIRECTORY').length;
  if (infoStats) {
    const rows = [['Notes', node.markdownCount ?? 0]];
    if (folders > 0) rows.push(['Sous-dossiers', folders]);
    if (children.length > 0) rows.push(['Objets en orbite', children.length]);
    rows.push(['Profondeur', `Niveau ${node.depth ?? 0}`]);
    infoStats.innerHTML = rows.map(([lbl, val]) => `
      <div class="stat-row">
        <span class="stat-lbl">${esc(lbl)}</span>
        <span class="stat-val">${esc(val)}</span>
      </div>`).join('');
  }

  // Liste du contenu, numérotée
  if (infoChildren) {
    infoChildren.innerHTML = '';
    children.slice(0, MAX_CHILDREN_SHOWN).forEach((child, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'child-item';
      item.title = child.name;
      item.innerHTML = `
        <span class="child-num">${i + 1}</span>
        ${dot(child.visualType)}
        <span class="child-name">${esc(child.name)}</span>
      `;
      item.addEventListener('click', () => {
        if (child.type !== 'MARKDOWN_FILE') enterNode(child);
        else showInfoPanel(child);
      });
      infoChildren.appendChild(item);
    });
    if (children.length > MAX_CHILDREN_SHOWN) {
      const more = document.createElement('div');
      more.className = 'child-more';
      more.textContent = `+ ${children.length - MAX_CHILDREN_SHOWN} autres`;
      infoChildren.appendChild(more);
    }
  }

  // On masque toute la section quand il n'y a rien à lister, plutôt
  // que de laisser un titre orphelin.
  if (infoChildrenSection) {
    infoChildrenSection.style.display = children.length > 0 ? '' : 'none';
  }

  if (btnEnter) {
    const canEnter = vt !== VisualType.MOON && children.length > 0;
    btnEnter.style.display = canEnter ? 'flex' : 'none';
    btnEnter.onclick = canEnter ? () => enterNode(node) : null;
  }

  if (infoPanel) {
    infoPanel.classList.remove('panel-hidden');
    infoPanel.classList.add('panel-visible');
  }
}

function hideInfoPanel() {
  if (infoPanel) {
    infoPanel.classList.add('panel-hidden');
    infoPanel.classList.remove('panel-visible');
  }
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

  addItem('Univers', null, navigationStack.length > 0 ? resetToRoot : null);

  navigationStack.forEach((entry, i) => {
    if (!entry.node) return;
    addItem(entry.node.name, entry.node.visualType, () => {
      // Remonter jusqu'à ce niveau
      const stepsBack = navigationStack.length - i - 1;
      for (let s = 0; s < stepsBack; s++) goBack();
    });
  });

  if (currentNode) addItem(currentNode.name, currentNode.visualType, null);
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

function onMouseMove(event) {
  const hit = raycast(event);

  if (hit !== hoveredObject) {
    if (hoveredObject) {
      hoveredObject.scale.setScalar(1);
    }
    hoveredObject = hit;
    if (hoveredObject) {
      hoveredObject.scale.setScalar(1.08);
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
  const hit = raycast(event);
  if (!hit) {
    // If not clicking UI, hide info panel
    if (!event.target.closest('#hud') && !event.target.closest('#tooltip')) {
      hideInfoPanel();
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

  // Single click — select + info
  selectedObject = hit;
  showInfoPanel(hit.userData.node);

  // Fly camera gently toward it
  const wp = new THREE.Vector3();
  hit.getWorldPosition(wp);
  const camOffset = renderer.camera.position.clone().sub(wp).normalize().multiplyScalar(60);
  renderer.flyTo(
    { x: wp.x + camOffset.x, y: wp.y + camOffset.y + 15, z: wp.z + camOffset.z },
    { x: wp.x, y: wp.y, z: wp.z },
    700,
  );
}

// ─── Animations ───────────────────────────────────────────────────────────────

const clock = { start: performance.now() };

function animateObjects(time) {
  const t = (time - clock.start) * 0.001;

  currentObjects.forEach((obj, i) => {
    const vt = obj.userData?.node?.visualType;
    const isClickable = obj.userData.clickable;

    switch (vt) {
      case VisualType.GALAXY:
        // La galaxie centrale tourne très lentement, les galaxies périphériques un peu plus vite
        obj.rotation.y = isClickable ? (t * 0.01 + i * 1.2) : (t * 0.002);
        
        // Animation fluide des bras spiraux par écoulement radial
        obj.children.forEach(c => {
          if (c.userData?.isDisc) {
            const geo = c.geometry;
            const positions = geo.attributes.position.array;
            
            const u0s = c.userData.u0s;
            const radialSpeeds = c.userData.radialSpeeds;
            const arms = c.userData.arms;
            const jitters = c.userData.jitters;
            const rJitters = c.userData.rJitters;
            const bulge = c.userData.bulge;
            const radius = c.userData.radius;

            if (u0s && radialSpeeds && arms && jitters && rJitters) {
              const N = u0s.length;
              const ARMS = 2;
              for (let j = 0; j < N; j++) {
                // Écoulement radial : u augmente et boucle entre 0 et 1
                const u = (u0s[j] + t * radialSpeeds[j]) % 1.0;
                
                // Calcul de la position le long du bras spiral
                const r_base = bulge * 0.8 + u * radius;
                const rr = r_base * (1 + rJitters[j]);
                const angle = (arms[j] / ARMS) * Math.PI * 2 + u * 3.1 * Math.PI + t * 0.05 + jitters[j];
                
                positions[j * 3]     = Math.cos(angle) * rr;
                positions[j * 3 + 2] = Math.sin(angle) * rr;
              }
              geo.attributes.position.needsUpdate = true;
            }
          }
        });
        break;
      case VisualType.SOLAR_SYSTEM:
        obj.rotation.y = isClickable ? (t * 0.04 + i * 0.7) : (t * 0.005);
        break;
      case VisualType.PLANET: {
        // Orbite autour du centre si l'astre est cliquable (pas au centre de la vue)
        if (isClickable) {
          const baseAngle = obj.userData.orbitAngle ?? 0;
          const speed = 0.015 + i * 0.003;
          const angle = baseAngle + t * speed;
          const r = obj.userData.orbitRadius ?? 60;
          obj.position.x = Math.cos(angle) * r;
          obj.position.z = Math.sin(angle) * r;
        }
        obj.rotation.y = isClickable ? (t * 0.08) : (t * 0.01);
        break;
      }
      case VisualType.MOON: {
        if (isClickable) {
          const baseAngle = obj.userData.orbitAngle ?? 0;
          const speed = 0.04 + i * 0.006;
          const angle = baseAngle + t * speed;
          const r = obj.userData.orbitRadius ?? 20;
          obj.position.x = Math.cos(angle) * r;
          obj.position.z = Math.sin(angle) * r;
        }
        break;
      }
    }

    // Gentle float (locked oscillation around baseY to prevent accumulation drift)
    if (obj.userData.clickable) {
      const baseY = obj.userData.baseY ?? 0;
      obj.position.y = baseY + Math.sin(t * 1.5 + i * 1.3) * 0.5;
    }
  });

  // Chaque label suit l'astre auquel il est rattaché
  labelObjects.forEach(sprite => {
    const obj = sprite.userData.owner;
    if (!obj) return;
    sprite.position.set(
      obj.position.x,
      obj.position.y + sprite.userData.dy,
      obj.position.z,
    );
  });
}

// ─── Recherche ────────────────────────────────────────────────────────────────

let flatIndex = [];      // [{ node, ancestors }] — aplatissement de l'arbre
let searchHits = [];
let activeHit = 0;

function buildSearchIndex(universeData) {
  flatIndex = [];
  const walk = (node, ancestors) => {
    flatIndex.push({ node, ancestors });
    (node.children || []).forEach(c => walk(c, [...ancestors, node]));
  };
  (universeData.children || []).forEach(c => walk(c, []));
}

function levelForDepth(depth) {
  if (depth === 0) return 'galaxy';
  if (depth === 1) return 'solar';
  return 'planet';
}

function buildViewFor(node) {
  switch (node.visualType) {
    case VisualType.GALAXY:       buildGalaxyView(node); return true;
    case VisualType.SOLAR_SYSTEM: buildSolarSystemView(node); return true;
    case VisualType.PLANET:       buildPlanetView(node); return true;
    default: return false;
  }
}

/**
 * Saute directement sur un nœud depuis la recherche. On reconstruit la pile
 * de navigation à partir des ancêtres, sinon le fil d'Ariane et le bouton
 * Retour se retrouveraient désynchronisés de la vue affichée.
 */
function revealNode(entry) {
  const { node, ancestors } = entry;
  const isFile = node.type === 'MARKDOWN_FILE';
  // Un fichier n'a pas de vue propre : on ouvre son dossier parent.
  const viewNode = isFile ? ancestors[ancestors.length - 1] : node;
  const chain = isFile ? ancestors.slice(0, -1) : ancestors;

  // camera: null → au retour, on recadrera sur le contenu plutôt que de
  // restaurer une position que l'utilisateur n'a jamais occupée.
  navigationStack = [{ node: null, camera: null, level: 'root' }];
  chain.forEach(a => navigationStack.push({
    node: a, camera: null, level: levelForDepth(a.depth),
  }));

  if (!viewNode || !buildViewFor(viewNode)) {
    navigationStack = [];
    buildRootView(universe);
  }

  updateBreadcrumb();
  updateBackButtonState();
  frameCurrentView(900);
  showInfoPanel(node);   // après buildView, qui vide le panneau
}

function highlight(name, q) {
  const i = name.toLowerCase().indexOf(q);
  if (i < 0) return esc(name);
  return esc(name.slice(0, i))
    + `<mark>${esc(name.slice(i, i + q.length))}</mark>`
    + esc(name.slice(i + q.length));
}

function setActiveHit(i) {
  if (searchHits.length === 0) return;
  activeHit = (i + searchHits.length) % searchHits.length;
  [...searchResults.children].forEach((el, n) => {
    el.classList.toggle('is-active', n === activeHit);
  });
  searchResults.children[activeHit]?.scrollIntoView({ block: 'nearest' });
}

function renderSearchResults(query) {
  const q = query.trim().toLowerCase();
  searchResults.innerHTML = '';
  searchHits = [];
  if (!q) return;

  searchHits = flatIndex
    .filter(e => e.node.name.toLowerCase().includes(q))
    .sort((a, b) => {
      // Les correspondances en début de nom d'abord, puis les noms courts.
      const ai = a.node.name.toLowerCase().indexOf(q);
      const bi = b.node.name.toLowerCase().indexOf(q);
      return ai - bi || a.node.name.length - b.node.name.length;
    })
    .slice(0, 40);

  if (searchHits.length === 0) {
    searchResults.innerHTML =
      `<div class="search-empty">Aucun résultat pour « ${esc(query.trim())} »</div>`;
    return;
  }

  searchHits.forEach((entry, i) => {
    const { node, ancestors } = entry;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-hit';
    const parents = ancestors.map(a => a.name).join(' / ') || 'Univers';
    btn.innerHTML = `
      ${dot(node.visualType, 'search-hit-dot')}
      <span class="search-hit-text">
        <span class="search-hit-name">${highlight(node.name, q)}</span>
        <span class="search-hit-path">${esc(parents)}</span>
      </span>
      <span class="search-hit-type">${esc(TYPE_LABEL[node.visualType] || '')}</span>
    `;
    btn.addEventListener('click', () => { closeSearch(); revealNode(entry); });
    btn.addEventListener('mouseenter', () => setActiveHit(i));
    searchResults.appendChild(btn);
  });

  setActiveHit(0);
}

function openSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.remove('hidden');
  searchInput.value = '';
  renderSearchResults('');
  searchInput.focus();
}

function closeSearch() {
  if (!searchOverlay) return;
  searchOverlay.classList.add('hidden');
}

function isSearchOpen() {
  return searchOverlay && !searchOverlay.classList.contains('hidden');
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
  labelObjects.forEach(l => { l.visible = showLabels; });
  const btn = document.getElementById('btn-tool-labels');
  if (btn) btn.classList.toggle('is-off', !showLabels);
}

function recenter() {
  frameCurrentView(700);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function loop(time) {
  animateObjects(time);
  if (renderer) renderer.tick(time);
  requestAnimationFrame(loop);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  setLoadingProgress(10, "Initialisation de la scène 3D…");

  // Init Three.js renderer
  const canvas = document.getElementById('galaxy-canvas');
  if (!canvas) {
    console.error("Canvas element not found!");
    return;
  }
  renderer = new GalaxyRenderer(canvas);
  setLoadingProgress(30, "Connexion à l'API obsidian-back…");

  // Fetch data
  try {
    setLoadingProgress(60, "Chargement de l'univers de notes…");
    const raw = await fetchUniverse();
    setLoadingProgress(80, "Génération de la carte stellaire…");

    universe = raw;
    buildSearchIndex(universe);

    // Build scene
    buildRootView(universe);
    frameCurrentView(1600);   // se joue pendant le fondu de l'écran de chargement
    setLoadingProgress(100, "Prêt !");

    // Show app
    setTimeout(() => {
      hideLoading();
      showHUD();
    }, 600);

  } catch (err) {
    console.error('Failed to load universe:', err);
    if (loadingFill) loadingFill.style.background = '#F43F5E';
    if (loadingStatus) {
      loadingStatus.textContent =
        '⚠ Impossible de contacter l\'API obsidian-back (localhost:8080). Assure-toi que le backend tourne.';
    }
  }

  // ── Scène ──
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  // ── Navigation ──
  btnBack?.addEventListener('click', goBack);
  btnReset?.addEventListener('click', resetToRoot);
  btnClosePanel?.addEventListener('click', hideInfoPanel);

  // ── Header ──
  btnSearch?.addEventListener('click', openSearch);
  btnFullscreen?.addEventListener('click', toggleFullscreen);

  // ── Toolbar ──
  document.getElementById('btn-tool-zoom-in')?.addEventListener('click', () => zoomBy(0.25));
  document.getElementById('btn-tool-zoom-out')?.addEventListener('click', () => zoomBy(-0.25));
  document.getElementById('btn-tool-labels')?.addEventListener('click', toggleLabels);
  document.getElementById('btn-tool-recenter')?.addEventListener('click', recenter);

  // ── Recherche ──
  searchInput?.addEventListener('input', () => renderSearchResults(searchInput.value));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); setActiveHit(activeHit + 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveHit(activeHit - 1); }
    else if (e.key === 'Enter' && searchHits[activeHit]) {
      e.preventDefault();
      const entry = searchHits[activeHit];
      closeSearch();
      revealNode(entry);
    }
  });
  // Clic en dehors de la boîte = fermeture
  searchOverlay?.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  // ── Raccourcis clavier ──
  window.addEventListener('keydown', (e) => {
    if (isSearchOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
      return;   // la palette gère ses propres flèches / Entrée
    }
    // Cmd/Ctrl+K ou « / » ouvrent la recherche
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
      e.preventDefault(); openSearch(); return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'Escape':    hideInfoPanel(); break;
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

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
