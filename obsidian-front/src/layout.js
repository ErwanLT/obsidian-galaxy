import * as THREE from 'three';
import { bodyRadius, seededRandom, nodeSeed } from './objects.js';

// Disposition des astres : calcul pur (positions, plans et formes d'orbite),
// sans scène ni DOM — testable et partagé par toutes les vues.

// Au-delà de ce nombre de notes, elles forment une ceinture serrée (une orbite chacune).
export const BELT_THRESHOLD = 10;
// Écart radial entre deux orbites voisines, en fraction de la somme de leurs rayons visuels.
const BELT_SPACING = 0.19;

/**
 * Disposition des galaxies racine en disque (spirale de Fermat).
 *
 * Remplace une sphère de Fibonacci : celle-ci plaçait les deux premières
 * galaxies aux pôles, soit exactement sur l'axe vertical (x = z = 0), donc
 * superposées à l'écran dès que le vault comptait peu de dossiers racine.
 * Un disque garde aussi la lecture « carte stellaire » vue en plongée.
 */
export function discLayout(n) {
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
 * Layout orbital minimaliste : UN astre par rayon, jamais de partage d'anneau.
 *
 * Chaque corps reçoit son propre rayon orbital, strictement croissant : le
 * rayon suivant commence juste après l'enveloppe du corps précédent
 * (rayon visuel + marge). Comme les ellipses décalent chaque corps sur son
 * propre plan orbital et que les angles sont répartis uniformément, aucun
 * objet ne peut recoller son voisin : c'est la garantie « un objet par rayon ».
 *
 * `sizes` = rayons visuels de chaque corps (servent à l'espacement) ; les plus
 * gros sont placés au plus près de l'astre central.
 */
export function orbitLayout(n, minR, maxR, sizes = [], rand = Math.random) {
  const positions = new Array(n);
  const planes = new Array(n);
  if (n === 0) return { positions, planes };

  // Les plus gros au centre (l'index original est préservé via `order`).
  const order = sizes
    .map((vr, i) => ({ vr: vr || 8, i }))
    .sort((a, b) => b.vr - a.vr);

  const offset = rand() * Math.PI * 2;
  let prevEdge = minR;

  for (let k = 0; k < n; k++) {
    const { vr, i } = order[k];
    // Rayon orbital : juste après le bord externe du corps précédent + marge.
    // Pas de clamp maxR (mettre tous les corps sur un même rayon recreerait
    // les chevauchements) ni de facteur (1-SIN_TILT) : chaque corps a SON plan
    // orbital, incliné différemment de ses voisins.
    const center = prevEdge + vr + 8;

    // Angles espacés uniformément : deux rayons voisins ne sont jamais
    // alignés sur le même axe, ça double la marge entre eux.
    const angle = offset + (n > 1 ? (k * Math.PI * 2) / n : 0);

    positions[i] = new THREE.Vector3(
      Math.cos(angle) * center,
      0,
      Math.sin(angle) * center,
    );

    planes[i] = {
      // Plan propre à chacun, nettement incliné (7° à 33°) : des orbites quasi
      // coplanaires se lisaient comme un seul disque.
      incl: 0.12 + rand() * 0.45,
      omega: rand() * Math.PI * 2,
    };

    prevEdge = center + vr;
  }
  return { positions, planes };
}

/**
 * Ceinture képlérienne pour les dossiers très peuplés.
 *
 * Chaque corps a SA propre orbite : demi-grand axe unique, inclinaison et
 * excentricité propres, vitesse en 1/√a (3e loi de Kepler, appliquée par
 * setOrbit) — les lunes intérieures doublent donc les extérieures, comme
 * dans un vrai système. Pour rester compact, l'écart radial entre deux
 * orbites voisines est serré ; deux voisines démarrent à l'angle d'or l'une
 * de l'autre, elles ne se croisent que rarement et brièvement.
 */
export function beltLayout(n, minR, sizes = [], rand = Math.random) {
  const positions = new Array(n);
  const planes = new Array(n);
  const shapes = new Array(n);
  // Ordre de distance mélangé (pas trié par taille : un vrai système ne l'est pas).
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const offset = rand() * Math.PI * 2;
  let r = minR + (sizes[order[0]] || 6) * 0.5;
  let prev = sizes[order[0]] || 6;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const vr = sizes[i] || 6;
    if (k > 0) {
      const gap = Math.max(2, (vr + prev) * BELT_SPACING * (0.8 + rand() * 0.4));
      r += gap;
    }
    prev = vr;
    const a = offset + k * GOLDEN;
    positions[i] = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Comme les lunes irrégulières : la plupart entre 5° et 23°, un quart
    // très penchées (29° à 57°).
    const incl = rand() < 0.25 ? 0.5 + rand() * 0.5 : 0.08 + rand() * 0.32;
    planes[i] = { incl, omega: rand() * Math.PI * 2 };
    // Excentricité faible, bornée pour que le corps reste dans sa bande.
    const ecc = Math.min(0.01 + rand() * rand() * 0.12, (2 * vr) / r);
    shapes[i] = { ecc, orient: rand() * Math.PI * 2 };
  }
  return { positions, planes, shapes };
}

export function placeMoons(files, minR, maxR, rand) {
  const sizes = files.map(bodyRadius);
  if (files.length > BELT_THRESHOLD) return beltLayout(files.length, minR, sizes, rand);
  const { positions, planes } = orbitLayout(files.length, minR, maxR, sizes, rand);
  return { positions, planes, shapes: files.map(f => orbitShape(f, 0.05, 0.10)) };
}

/**
 * Point d'un corps sur son plan orbital incliné.
 *
 * La rotation est : inclinaison autour de X (le plan plonge vers l'axe Y),
 * puis longitude du nœud ascendant autour de Y. Même transformation que celle
 * appliquée aux sommets du tracé d'orbite dans `createOrbit`.
 */
const _orbitPt = new THREE.Vector3();
export function orbitPoint(r, angle, incl, omega, e = 0, orient = 0) {
  // Ellipse dans son plan, Soleil au foyer (origine) : x = a·cos(θ) − a·e
  const a = r;
  const b = a * Math.sqrt(Math.max(0, 1 - e * e));
  const c = a * e;
  const t = angle + orient;
  const lx = a * Math.cos(t) - c;
  const lz = b * Math.sin(t);

  const y1 = -lz * Math.sin(incl);
  const z1 = lz * Math.cos(incl);

  const so = Math.sin(omega);
  const co = Math.cos(omega);
  _orbitPt.set(
    lx * co + z1 * so,
    y1,
    -lx * so + z1 * co,
  );
  return _orbitPt;
}

/**
 * Affecte les données d'orbite d'un astre cliquable.
 *
 * Orbites képlériennes : excentricité e (ellipse, Soleil au foyer) et vitesse
 * angulaire proportionnelle à 1/√a (3e loi de Képler). L'anneau tourne « en
 * bloc » : tous les corps d'un même anneau partagent vitesse et plan, deux
 * voisins ne se dépassent jamais.
 *
 * On repositionne immédiatement l'astre sur son plan incliné pour éviter tout
 * saut à la première frame.
 */
export function setOrbit(obj, pos, incl = 0, omega = 0, e = 0, orient = 0) {
  const r = pos.length();

  obj.userData.orbitRadius = r;
  obj.userData.orbitAngle = Math.atan2(pos.z, pos.x);
  obj.userData.orbitSpeed = 0.6 / Math.sqrt(r);   // Képler : ω ∝ a^(−1/2)
  obj.userData.orbitIncl = incl;
  obj.userData.orbitOmega = omega;
  obj.userData.orbitEcc = e;
  obj.userData.orbitOrient = orient;

  const p = orbitPoint(r, obj.userData.orbitAngle, incl, omega, e, orient);
  obj.userData.baseX = p.x;
  obj.userData.baseY = p.y;
  obj.userData.baseZ = p.z;
  obj.position.set(p.x, p.y, p.z);
}

// Excentricité et orientation d'orbite propres à chaque astre, stables d'une visite à l'autre.
export function orbitShape(node, eMin, eSpan) {
  const r = seededRandom(nodeSeed(node, 'orbit:'));
  return { ecc: eMin + r() * eSpan, orient: r() * Math.PI * 2 };
}
