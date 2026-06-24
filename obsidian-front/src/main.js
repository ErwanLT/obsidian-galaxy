import './style.css';
import * as THREE from 'three';
import { fetchUniverse, VisualType, TYPE_EMOJI, TYPE_LABEL } from './universe.js';
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
const btnEnter = document.getElementById('btn-enter');
const btnBack = document.getElementById('btn-back');
const btnReset = document.getElementById('btn-reset');
const btnLabels = document.getElementById('btn-labels');
const breadcrumb = document.getElementById('breadcrumb');
const tooltip = document.getElementById('tooltip');

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

// ─── Layout helpers ───────────────────────────────────────────────────────────

/**
 * Fibonacci sphere layout for galaxies at root level
 */
function fibonacciSphere(n, radius) {
  const positions = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    positions.push(new THREE.Vector3(
      r * Math.cos(theta) * radius,
      y * radius * 0.4,
      r * Math.sin(theta) * radius,
    ));
  }
  return positions;
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
  const positions = fibonacciSphere(galaxies.length, 160);

  galaxies.forEach((node, i) => {
    const pos = positions[i];
    const obj = createGalaxy(renderer.scene, node, pos, i);
    obj.userData.clickable = true;
    obj.userData.baseX = pos.x;
    obj.userData.baseY = pos.y;
    obj.userData.baseZ = pos.z;

    // Label
    if (showLabels) {
      const labelPos = new THREE.Vector3(pos.x, pos.y + 30, pos.z);
      const emoji = TYPE_EMOJI[node.visualType] || '';
      const sprite = createLabel(`${emoji} ${node.name}`, labelPos, '#C4B5FD', 42);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }

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

    if (showLabels) {
      const lp = new THREE.Vector3(pos.x, pos.y + 18, pos.z);
      const emoji = TYPE_EMOJI[node.visualType] || '';
      const sprite = createLabel(`${emoji} ${node.name}`, lp, '#67E8F9', 38);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }

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
    if (showLabels) {
      const lp = new THREE.Vector3(pos.x, pos.y + 5, pos.z);
      const sprite = createLabel(node.name, lp, '#A1A1AA', 30);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }
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

    if (showLabels) {
      const lp = new THREE.Vector3(pos.x, pos.y + 12, pos.z);
      const emoji = TYPE_EMOJI[node.visualType] || '';
      const sprite = createLabel(`${emoji} ${node.name}`, lp, '#FCD34D', 34);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }

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
    if (showLabels) {
      const lp = new THREE.Vector3(pos.x, pos.y + 4, pos.z);
      const sprite = createLabel(node.name, lp, '#9CA3AF', 28);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }
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
    if (showLabels) {
      const lp = new THREE.Vector3(pos.x, pos.y + 8, pos.z);
      const emoji = TYPE_EMOJI[node.visualType] || '';
      const sprite = createLabel(`${emoji} ${node.name}`, lp, '#FCD34D', 30);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }
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
    if (showLabels) {
      const lp = new THREE.Vector3(pos.x, pos.y + 3, pos.z);
      const sprite = createLabel(node.name, lp, '#CBD5E1', 26);
      renderer.scene.add(sprite);
      labelObjects.push(sprite);
    }
    currentObjects.push(obj);
  });

  updateBreadcrumb();
  updateBackButtonState();
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

  // Fly to compact overview (adjusted zoom distance +20% again)
  renderer.flyTo(
    { x: 0, y: 60, z: 190 },
    { x: 0, y: 0, z: 0 },
    1000,
  );
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
  }
}

function resetToRoot() {
  navigationStack = [];
  buildRootView(universe);
  renderer.flyTo({ x: 0, y: 80, z: 220 }, { x: 0, y: 0, z: 0 }, 1200);
}

function updateBackButtonState() {
  if (btnBack) {
    if (navigationStack.length > 0) {
      btnBack.style.opacity = '1';
      btnBack.style.pointerEvents = 'all';
    } else {
      btnBack.style.opacity = '0.3';
      btnBack.style.pointerEvents = 'none';
    }
  }
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

function showInfoPanel(node) {
  const vt = node.visualType;

  if (infoBadge) {
    infoBadge.textContent = `${TYPE_EMOJI[vt] || ''} ${TYPE_LABEL[vt] || ''}`;
    infoBadge.className = `info-type-badge ${vt}`; // matching styling badge CSS
    infoBadge.classList.add(vt);
  }

  if (infoName) infoName.textContent = node.name;
  if (infoPath) infoPath.textContent = node.path || '';

  // Stats
  const childCount = node.children ? node.children.length : 0;
  if (infoStats) {
    infoStats.innerHTML = `
      <div class="stat">
        <span class="stat-val">${node.markdownCount ?? 0}</span>
        <span class="stat-lbl">Notes</span>
      </div>
      ${childCount > 0 ? `
      <div class="stat">
        <span class="stat-val">${childCount}</span>
        <span class="stat-lbl">Objets</span>
      </div>` : ''}
      <div class="stat">
        <span class="stat-val">${node.depth ?? 0}</span>
        <span class="stat-lbl">Niveau</span>
      </div>
    `;
  }

  // Children list
  if (infoChildren) {
    infoChildren.innerHTML = '';
    if (node.children && node.children.length > 0) {
      node.children.slice(0, 12).forEach(child => {
        const item = document.createElement('div');
        item.className = 'child-item';
        const dotColors = {
          [VisualType.GALAXY]: '#8B5CF6',
          [VisualType.SOLAR_SYSTEM]: '#06B6D4',
          [VisualType.PLANET]: '#F59E0B',
          [VisualType.MOON]: '#10B981',
        };
        const emoji = TYPE_EMOJI[child.visualType] || '';
        item.innerHTML = `
          <span class="child-dot" style="background:${dotColors[child.visualType] || '#fff'}"></span>
          <span>${emoji} ${child.name}</span>
        `;
        item.addEventListener('click', () => {
          if (child.type !== 'MARKDOWN_FILE') enterNode(child);
          else showInfoPanel(child);
        });
        infoChildren.appendChild(item);
      });
      if (node.children.length > 12) {
        const more = document.createElement('div');
        more.className = 'child-item';
        more.style.justifyContent = 'center';
        more.style.color = 'rgba(255,255,255,0.35)';
        more.textContent = `+ ${node.children.length - 12} autres…`;
        infoChildren.appendChild(more);
      }
    }
  }

  // Enter button
  if (btnEnter) {
    if (vt !== VisualType.MOON) {
      btnEnter.style.display = 'block';
      btnEnter.onclick = () => enterNode(node);
    } else {
      btnEnter.style.display = 'none';
    }
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

  const addItem = (label, depth, handler) => {
    if (breadcrumb.children.length > 0) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '›';
      breadcrumb.appendChild(sep);
    }
    const item = document.createElement('span');
    item.className = `bc-item${handler ? '' : ' active'}`;
    item.textContent = label;
    item.dataset.depth = depth;
    if (handler) item.addEventListener('click', handler);
    breadcrumb.appendChild(item);
  };

  addItem('🌌 Univers', -1, navigationStack.length > 0 ? resetToRoot : null);

  navigationStack.forEach((entry, i) => {
    if (entry.node) {
      const emoji = TYPE_EMOJI[entry.node.visualType] || '';
      addItem(
        `${emoji} ${entry.node.name}`,
        i,
        () => {
          // Navigate back to this point
          const stepsBack = navigationStack.length - i - 1;
          for (let s = 0; s < stepsBack; s++) goBack();
        }
      );
    }
  });

  if (currentNode) {
    const emoji = TYPE_EMOJI[currentNode.visualType] || '';
    addItem(`${emoji} ${currentNode.name}`, navigationStack.length, null);
  }
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
      const emoji = TYPE_EMOJI[node.visualType] || '';
      if (tooltip) {
        tooltip.textContent = `${emoji} ${node.name}`;
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
    if (!obj.userData.clickable && i === 0) return; // don't spin central obj heavily

    const vt = obj.userData?.node?.visualType;
    switch (vt) {
      case VisualType.GALAXY:
        obj.rotation.y = t * 0.02 + i * 1.2;
        // spin particle disc faster
        obj.children.forEach(c => {
          if (c.userData?.isDisc) c.rotation.y = -t * 0.03;
        });
        break;
      case VisualType.SOLAR_SYSTEM:
        obj.rotation.y = t * 0.04 + i * 0.7;
        break;
      case VisualType.PLANET: {
        // Orbit around center if not center obj
        if (obj.userData.clickable) {
          const baseAngle = obj.userData.orbitAngle ?? 0;
          const speed = 0.015 + i * 0.003;
          const angle = baseAngle + t * speed;
          const r = obj.userData.orbitRadius ?? 60;
          obj.position.x = Math.cos(angle) * r;
          obj.position.z = Math.sin(angle) * r;
        }
        obj.rotation.y = t * 0.08;
        break;
      }
      case VisualType.MOON: {
        if (obj.userData.clickable) {
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

  // Labels follow objects
  labelObjects.forEach((sprite, i) => {
    const obj = currentObjects.find((o, oi) => oi === i + 1 && o.userData.clickable);
    if (obj) {
      sprite.position.x = obj.position.x;
      sprite.position.z = obj.position.z;
    }
  });
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

    // Build scene
    buildRootView(universe);
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

  // Events
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  if (btnReset) btnReset.addEventListener('click', resetToRoot);
  if (btnBack) btnBack.addEventListener('click', goBack);

  if (btnLabels) {
    btnLabels.addEventListener('click', () => {
      showLabels = !showLabels;
      labelObjects.forEach(l => { l.visible = showLabels; });
      btnLabels.style.opacity = showLabels ? '1' : '0.4';
      const btnToolLabels = document.getElementById('btn-tool-labels');
      if (btnToolLabels) btnToolLabels.style.opacity = showLabels ? '1' : '0.4';
    });
  }

  // Left Toolbar Zoom & Label interactions
  const btnToolZoomIn = document.getElementById('btn-tool-zoom-in');
  const btnToolZoomOut = document.getElementById('btn-tool-zoom-out');
  const btnToolLabels = document.getElementById('btn-tool-labels');

  if (btnToolZoomIn) {
    btnToolZoomIn.addEventListener('click', () => {
      if (!renderer) return;
      const target = renderer.controls.target;
      const pos = renderer.camera.position;
      const dir = new THREE.Vector3().subVectors(target, pos).normalize();
      const dist = pos.distanceTo(target);
      const newPos = pos.clone().addScaledVector(dir, dist * 0.25);
      renderer.flyTo(newPos, target, 400);
    });
  }

  if (btnToolZoomOut) {
    btnToolZoomOut.addEventListener('click', () => {
      if (!renderer) return;
      const target = renderer.controls.target;
      const pos = renderer.camera.position;
      const dir = new THREE.Vector3().subVectors(target, pos).normalize();
      const dist = pos.distanceTo(target);
      const newPos = pos.clone().addScaledVector(dir, -dist * 0.25);
      renderer.flyTo(newPos, target, 400);
    });
  }

  if (btnToolLabels) {
    btnToolLabels.addEventListener('click', () => {
      showLabels = !showLabels;
      labelObjects.forEach(l => { l.visible = showLabels; });
      if (btnLabels) btnLabels.style.opacity = showLabels ? '1' : '0.4';
      btnToolLabels.style.opacity = showLabels ? '1' : '0.4';
    });
  }

  // Start loop
  requestAnimationFrame(loop);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
