// main.js — amorçage : scène, champ de mémoires, interactions, boucle.

import * as THREE from 'three';
import { createScene } from './renderer.js';
import { MemoryField, openNote } from './field.js';

const { scene, camera, renderer, controls, composer } = createScene();

const field = new MemoryField(scene);

async function boot() {
  try {
    const { notes, cores, edges } = await field.load();
    document.getElementById('stat-notes').textContent = `${notes.length} braises`;
    document.getElementById('stat-cores').textContent = `${cores.length - 1} cœurs`;
    document.getElementById('stat-links').textContent = `${edges.length} filaments`;
  } catch (err) {
    console.error(err);
    document.getElementById('brand-name').textContent = 'champ vide — back inaccessible';
  }
  loop();
}

const tooltip = document.getElementById('note-tooltip');
const canvas = renderer.domElement;

const toNdc = e => ({
  x: (e.clientX / window.innerWidth) * 2 - 1,
  y: -(e.clientY / window.innerHeight) * 2 + 1,
});

function updateTooltip(note, e) {
  if (!note) { tooltip.hidden = true; return; }
  tooltip.hidden = false;
  tooltip.style.left = `${e.clientX}px`;
  tooltip.style.top = `${e.clientY}px`;
  tooltip.querySelector('.tt-name').textContent = note.name;
  tooltip.querySelector('.tt-meta').textContent =
    `${note.degree} lien(s) · ${Math.round(note.size / 1024)} ko · ${note.depth} niveau(x)`;
}

let lastHover = null;
canvas.addEventListener('pointermove', e => {
  const ndc = toNdc(e);
  const idx = field.pick(camera, ndc.x, ndc.y);
  canvas.style.cursor = idx != null ? 'pointer' : 'grab';
  if (idx !== lastHover) {
    lastHover = idx;
    field.setHover(idx);
  }
  const note = idx == null ? null : field.field.notes[idx];
  updateTooltip(note, e);
});

canvas.addEventListener('pointerleave', () => {
  lastHover = null;
  field.setHover(null);
  tooltip.hidden = true;
});

// ── Fenêtre d'aperçu : le clic ne renvoie plus dans Obsidian, il propose ──
const preview = document.getElementById('note-preview');
const proj = new THREE.Vector3();

function openPreview(note) {
  field.selected = note._idx;
  preview.hidden = false;
  preview.querySelector('.np-name').textContent = note.name;
  preview.querySelector('.np-path').textContent = note.path;
  preview.querySelector('.np-meta').textContent =
    `${note.degree} lien(s) · ${Math.round(note.size / 1024)} ko · niveau ${note.depth}`;
  const siblings = note._links || [];
  preview.querySelector('.np-links').textContent = siblings.length
    ? `≈ ${siblings.length} voisin(s) dans la constellation`
    : 'aucun lien — braise isolée';
  tooltip.hidden = true;
}

function closePreview() {
  if (preview.hidden) return;
  preview.hidden = true;
  field.selected = null;
}

function pinPreview() {
  if (preview.hidden) return;
  const note = field.field.notes[field.selected];
  proj.set(note.x, note.y, note.z ?? 0).project(camera);
  if (proj.z > 1) { // derrière la caméra → on laisse la carte là où elle était
    preview.style.visibility = 'hidden';
    return;
  }
  preview.style.visibility = 'visible';
  preview.style.left = `${(proj.x * 0.5 + 0.5) * window.innerWidth}px`;
  preview.style.top = `${(-proj.y * 0.5 + 0.5) * window.innerHeight}px`;
}

canvas.addEventListener('click', e => {
  const ndc = toNdc(e);
  const idx = field.pick(camera, ndc.x, ndc.y);
  if (idx == null) { closePreview(); return; }
  const note = field.field.notes[idx];
  if (field.selected === idx) { closePreview(); return; }
  openPreview(note);
});

document.getElementById('np-open').addEventListener('click', e => {
  e.stopPropagation();
  const note = field.field.notes[field.selected];
  if (note) openNote(note);
});

document.getElementById('np-close').addEventListener('click', e => {
  e.stopPropagation();
  closePreview();
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePreview();
});

const clock = new THREE.Clock();
function loop() {
  const t = clock.getElapsedTime();
  field.tick(t, clock.getDelta());
  controls.update();
  pinPreview();
  composer.render();
  requestAnimationFrame(loop);
}

boot();