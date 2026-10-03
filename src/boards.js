/*
 * boards.js: the sponsor boards that ring the track, the background of the
 * race camera all the way round.
 *
 * The simulator's world has no billboards, so these are this app's own:
 * vinyl panels in the BANNER palette of sim/src/art/banners.js, painted the
 * way its painters paint a gate header (a pale sheet, a bound edge, a chequer
 * along the foot, the mark fitted and never cropped), on the simulator's
 * pale grey tube frames, standing between the track and the fence.
 *
 * THE RING. Boards are dealt round robin along the outside of the track at a
 * fixed standoff, spaced evenly along the offset curve and not along the
 * racing line: on the outside of a bend the offset curve is longer than the
 * line, and boards spaced by the line's own length would open into gaps
 * there. Each stands square to the line, facing the infield, where the race
 * camera is.
 *
 * WITH NO LOGOS the boards carry the lettered wordmark and webfpv.org, the
 * simulator's own lettering (sim/src/ui/lettering.js). With logos they are
 * dealt round robin. A logo with no transparency gets a panel the colour of
 * its own border, so a JPEG in a white box is not a sticker on a sticker;
 * the caller (src/sponsors.js) says which colour, because it has decoded
 * the image and this file has not.
 *
 * ONE DRAW CALL PER BOARD DESIGN. Every board with the same print is merged
 * into one geometry, and every frame into one, so a ring of eighty boards
 * with four sponsors is five draws and one more for the tubes. Nothing here
 * is instanced, so the world's own ink pass treats the boards as it treats a
 * gate: a line round each.
 *
 * This file is part of the WebFPV Race Name Picker.
 *
 * The WebFPV Race Name Picker is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * The WebFPV Race Name Picker is distributed in the hope that it will be
 * useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the WebFPV Race Name Picker. If not, see
 * <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from '../sim/src/render/celmat.js';
import { BANNER, chequer } from '../sim/src/art/banners.js';
import { INKS, drawRuns, wordWidth } from '../sim/src/ui/lettering.js';
import { toThree } from './frame.js';

/* Metres. A board is wider than it is tall, as a hoarding is, and stands off the ground on two legs. */
export const BOARD = Object.freeze({
  width: 4.0,
  height: 1.3,
  bottom: 0.45,
  /* From the racing line, outward: past the track's outer edge at 6 m, with room to run off. */
  standoff: 9.5,
  pitch: 4.8,
});

const CANVAS = Object.freeze({ w: 1024, h: 333 });
const FRAME_COLOUR = 0x9aa2b0;

/* The print. `logo` is { image, base } when a sponsor has one, and absent for the wordmark. */
export function paintBoard(ctx, w, h, logo = null) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = (logo && logo.base) || BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);
  /* The bound edge top and bottom, a shade darker, which is what stops a white sheet reading as a hole in the sky. */
  ctx.fillStyle = BANNER.vinylShade;
  ctx.fillRect(0, 0, w, h * 0.045);
  ctx.fillRect(0, h * 0.955 - h * 0.075, w, h * 0.045);
  /* Square checks: the band is 0.075 of the height and two checks deep. */
  chequer(ctx, 0, h * 0.88, w, h * 0.075, Math.round(w / (h * 0.0375)));
  /* The bottom hem under the chequer. */
  ctx.fillStyle = BANNER.vinylShade;
  ctx.fillRect(0, h * 0.955, w, h * 0.045);

  const boxX = w * 0.06;
  const boxY = h * 0.09;
  const boxW = w * 0.88;
  const boxH = h * 0.76;
  if (logo && logo.image) {
    const sw = logo.image.naturalWidth || logo.image.width;
    const sh = logo.image.naturalHeight || logo.image.height;
    if (sw > 0 && sh > 0) {
      const k = Math.min(boxW / sw, boxH / sh);
      ctx.drawImage(logo.image, boxX + (boxW - sw * k) / 2, boxY + (boxH - sh * k) / 2, sw * k, sh * k);
    }
    return;
  }
  /* The wordmark, lettered: WEB in cream and FPV in sakura, each with the ink outline the lettering gives it. */
  let px = boxH * 0.62;
  const widest = boxW * 0.78;
  const measured = wordWidth(ctx, 'WEBFPV', px);
  if (measured > widest) {
    px *= widest / measured;
  }
  const mark = wordWidth(ctx, 'WEBFPV', px);
  drawRuns(ctx, [{ text: 'WEB', fill: INKS.cream }, { text: 'FPV', fill: INKS.sakura }], boxX + (boxW - mark) / 2, boxY + px * 0.78, px);
  ctx.fillStyle = BANNER.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${Math.round(boxH * 0.17)}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.fillText('webfpv.org', w / 2, boxY + boxH * 0.98);
}

/* The ring's stations: [{ s, theta }] along the line, even along the offset curve. */
export function boardStations(course, standoff = BOARD.standoff, pitch = BOARD.pitch) {
  const at = {};
  /* The length of the offset curve, by the same factor the boards will be spaced with. */
  const steps = Math.round(course.lap / 0.25);
  const ds = course.lap / steps;
  let length = 0;
  for (let i = 0; i < steps; i += 1) {
    course.at((i + 0.5) * ds, at);
    length += ds * (1 - standoff * at.kappa);
  }
  const n = Math.max(8, Math.round(length / pitch));
  const spacing = length / n;
  const out = [];
  let a = spacing / 2;
  let s = 0;
  let travelled = 0;
  for (let i = 0; i < steps && out.length < n; i += 1) {
    course.at((i + 0.5) * ds, at);
    const step = ds * (1 - standoff * at.kappa);
    while (travelled + step >= a && out.length < n) {
      const f = (a - travelled) / step;
      out.push({ s: s + f * ds });
      a += spacing;
    }
    travelled += step;
    s += ds;
  }
  return out;
}

/*
 * Build the ring.
 *
 *   course   from makeCourse()
 *   logos    [{ image, base }]: the decoded marks that go on the boards; empty for the wordmark
 *   anisotropy  the renderer's maximum, so a board read at a slant stays legible
 *
 * Returns { group, dispose }.
 */
export function buildBoards({ course, logos = [], anisotropy = 4 }) {
  const group = new THREE.Group();
  group.name = 'boards';
  const designs = logos.length ? logos : [null];
  const textures = [];
  const materials = designs.map((logo, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS.w;
    canvas.height = CANVAS.h;
    paintBoard(canvas.getContext('2d'), CANVAS.w, CANVAS.h, logo);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    textures.push(texture);
    return celMaterial({ map: texture, key: `picker-board-${i}`, rim: 0.2 });
  });
  const frameMaterial = celMaterial({ color: FRAME_COLOUR, rim: 0.26 });

  const stations = boardStations(course);
  const panelGeo = new THREE.PlaneGeometry(BOARD.width, BOARD.height);
  const byDesign = designs.map(() => []);
  const frames = [];
  const legR = 0.035;
  const legH = BOARD.bottom + BOARD.height + 0.12;
  const leg = new THREE.CylinderGeometry(legR, legR, legH, 8);
  const rail = new THREE.CylinderGeometry(legR * 0.8, legR * 0.8, BOARD.width - 0.1, 8);
  rail.rotateZ(Math.PI / 2);
  const at = {};
  const origin = {};
  const t3 = {};
  const place = new THREE.Matrix4();

  stations.forEach((st, i) => {
    course.place(st.s, BOARD.standoff, 0, at);
    toThree(at.x, at.y, 0, origin);
    /*
     * The board's own frame in Three's: x along the way of travel, y up, z
     * toward the infield. The line's outward normal is (-ty, tx) in the plan
     * and (-ty, 0, -tx) in Three, and the face looks the other way, so z is
     * (ty, 0, tx), and x cross y is z as a right handed frame needs.
     */
    toThree(at.tx, at.ty, 0, t3);
    place.set(
      t3.x, 0, at.ty, origin.x,
      0, 1, 0, 0,
      t3.z, 0, at.tx, origin.z,
      0, 0, 0, 1,
    );
    const panel = panelGeo.clone();
    panel.applyMatrix4(new THREE.Matrix4().makeTranslation(0, BOARD.bottom + BOARD.height / 2, 0));
    panel.applyMatrix4(place);
    byDesign[i % designs.length].push(panel);

    for (const side of [-1, 1]) {
      const g = leg.clone();
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(side * (BOARD.width / 2 - 0.15), legH / 2, -0.03));
      g.applyMatrix4(place);
      frames.push(g);
    }
    for (const y of [BOARD.bottom + 0.04, BOARD.bottom + BOARD.height - 0.04]) {
      const g = rail.clone();
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, y, -0.03));
      g.applyMatrix4(place);
      frames.push(g);
    }
  });
  panelGeo.dispose();
  leg.dispose();
  rail.dispose();

  designs.forEach((_, k) => {
    if (!byDesign[k].length) {
      return;
    }
    const merged = mergeGeometries(byDesign[k], false);
    for (const g of byDesign[k]) {
      g.dispose();
    }
    const mesh = new THREE.Mesh(merged, materials[k]);
    mesh.name = `boards-${k}`;
    group.add(mesh);
  });
  const frameMesh = new THREE.Mesh(mergeGeometries(frames, false), frameMaterial);
  for (const g of frames) {
    g.dispose();
  }
  frameMesh.name = 'board-frames';
  group.add(frameMesh);

  return {
    group,
    count: stations.length,
    dispose() {
      for (const t of textures) {
        t.dispose();
      }
      group.traverse((o) => {
        if (o.geometry) {
          o.geometry.dispose();
        }
      });
      for (const mat of [...materials, frameMaterial]) {
        mat.dispose();
      }
      group.removeFromParent();
    },
  };
}

