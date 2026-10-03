/*
 * gantry.js: the start and finish gantry, and the line under it.
 *
 * The simulator has no start lights and no finish gantry: its start line is
 * a timing gate. This builds one across the track from the simulator's own
 * materials: the pale grey tube frame, a vinyl header with the chequer and the
 * event title lettered on it, three amber lamps and a green, and a small
 * scoreboard that shows the seal's fingerprint before the start.
 *
 * WHICH WAY IT FACES. The pack is filmed from the infield, side on, so the
 * gantry is seen edge on there: two posts and a beam across the track, and the
 * line is what the quads cross. It is built to be read from the other two
 * places a viewer stands: behind the grid, where the aerial shot comes down
 * the start straight, and past the line. The header is printed on both faces,
 * and the lamps are spheres standing proud of both, so the start reads from
 * either end. The scoreboard faces the grid, because the fingerprint is for
 * the people waiting to start.
 *
 * CLEARANCE. The fleet flies up to 4.0 m and a quad is half a metre across, so
 * the header's lower edge is at 5.2 m, and the uprights stand 7 m either side
 * of the centre of a track whose outermost lane is 5.2 m out.
 *
 * THE LINE. A chequered strip across the track at s = 0, two checks deep, a
 * thin plane a centimetre above the grass, painted with the simulator's own
 * chequer. It is the finish line the pack crosses in a still frame.
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
import { celMaterial } from '../sim/src/render/celmat.js';
import { BANNER, chequer, chequerDevice } from '../sim/src/art/banners.js';
import { INKS, drawRuns, wordWidth } from '../sim/src/ui/lettering.js';
import { toThree } from './frame.js';

const SPAN = 7.0;
const HEADER_BOTTOM = 5.2;
const HEADER_HEIGHT = 2.4;
/* The height of the lamps and the scoreboard: the lower zone of the header, under the title. */
const LOWER_ZONE = HEADER_BOTTOM + 0.62;
const POST_HEIGHT = HEADER_BOTTOM + HEADER_HEIGHT + 0.12;
const TUBE_R = 0.09;
const LAMP_R = 0.27;

const HEADER_CANVAS = Object.freeze({ w: 2048, h: 356 });
const BOARD_CANVAS = Object.freeze({ w: 512, h: 124 });

const AMBER_ON = 0xffd45c;
const AMBER_OFF = 0x3a2c10;
const GREEN_ON = 0x7dffb4;
const GREEN_OFF = 0x123322;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/*
 * The header's print: a chequer band along both edges, the chequer flag at
 * each end, and the title lettered in the upper half. The lower half is left
 * clear for the lamps and the scoreboard, which are real objects standing on
 * it. The checks are square: a band's height is two checks.
 */
function paintHeader(ctx, w, h, title) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);
  const band = h * 0.075;
  const cells = Math.round(w / (band / 2));
  chequer(ctx, 0, 0, w, band, cells);
  chequer(ctx, 0, h - band, w, band, cells);
  ctx.fillStyle = BANNER.vinylShade;
  ctx.fillRect(0, band, w, h * 0.012);
  ctx.fillRect(0, h - band - h * 0.012, w, h * 0.012);
  chequerDevice(ctx, w * 0.02, h * 0.15, w * 0.1, h * 0.7);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  chequerDevice(ctx, w * 0.02, h * 0.15, w * 0.1, h * 0.7);
  ctx.restore();

  const text = (title || 'WEBFPV RACE NAME PICKER').toUpperCase();
  const maxW = w * 0.56;
  let px = h * 0.34;
  const first = wordWidth(ctx, text, px);
  if (first > maxW) {
    px *= maxW / first;
  }
  const width = wordWidth(ctx, text, px);
  drawRuns(ctx, [{ text, fill: INKS.cream }], (w - width) / 2, h * 0.1 + px * 0.9, px);
}

/* The scoreboard: the sealed fingerprint in the simulator's OSD amber, or a label when there is none. */
function paintBoard(ctx, w, h, label, value) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1116';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INKS.sakura;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INKS.slate;
  ctx.font = `800 ${Math.round(h * 0.17)}px ${FONT}`;
  ctx.fillText(label, w / 2, h * 0.31);
  ctx.fillStyle = INKS.amber;
  ctx.font = `700 ${Math.round(h * 0.42)}px ${MONO}`;
  ctx.fillText(value, w / 2, h * 0.82, w * 0.92);
}

export function buildGantry({ course }) {
  const group = new THREE.Group();
  group.name = 'gantry';

  /* The gantry's own frame: x to the left of travel, y up, z along it. See frame.js for why that is a right handed set. */
  const at = {};
  course.place(0, 0, 0, at);
  const origin = toThree(at.x, at.y, 0);
  const t3 = toThree(at.tx, at.ty, 0);
  /* The left normal (-ty, tx) in the plan is (-ty, 0, -tx) in Three. */
  group.matrixAutoUpdate = false;
  group.matrix.set(
    -at.ty, 0, t3.x, origin.x,
    0, 1, 0, 0,
    -at.tx, 0, t3.z, origin.z,
    0, 0, 0, 1,
  );
  group.matrixWorldNeedsUpdate = true;

  const tube = celMaterial({ color: 0x9aa2b0, rim: 0.26 });
  const fitting = celMaterial({ color: 0x767f8f, rim: 0.26 });
  const housing = celMaterial({ color: 0x1a2028, rim: 0.2 });

  const headerCanvas = document.createElement('canvas');
  headerCanvas.width = HEADER_CANVAS.w;
  headerCanvas.height = HEADER_CANVAS.h;
  const headerTexture = new THREE.CanvasTexture(headerCanvas);
  headerTexture.colorSpace = THREE.SRGBColorSpace;
  headerTexture.anisotropy = 4;
  const headerMaterial = celMaterial({ map: headerTexture, key: 'picker-gantry-header', rim: 0.2 });

  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BOARD_CANVAS.w;
  boardCanvas.height = BOARD_CANVAS.h;
  const boardTexture = new THREE.CanvasTexture(boardCanvas);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  boardTexture.anisotropy = 4;
  const boardMaterial = new THREE.MeshBasicMaterial({ map: boardTexture, fog: false });

  /* Two posts, two chords, and a moulded fitting at each of the four corners. */
  const post = new THREE.CylinderGeometry(TUBE_R, TUBE_R, POST_HEIGHT, 10);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(post, tube);
    m.position.set(side * SPAN, POST_HEIGHT / 2, 0);
    group.add(m);
    for (const y of [HEADER_BOTTOM - 0.05, HEADER_BOTTOM + HEADER_HEIGHT + 0.05]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(TUBE_R * 1.45, 10, 8), fitting);
      f.position.set(side * SPAN, y, 0);
      group.add(f);
    }
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R * 2.2, TUBE_R * 2.6, 0.12, 12), fitting);
    foot.position.set(side * SPAN, 0.06, 0);
    group.add(foot);
  }
  const chord = new THREE.CylinderGeometry(TUBE_R * 0.8, TUBE_R * 0.8, SPAN * 2, 10);
  chord.rotateZ(Math.PI / 2);
  for (const y of [HEADER_BOTTOM - 0.05, HEADER_BOTTOM + HEADER_HEIGHT + 0.05]) {
    const m = new THREE.Mesh(chord, tube);
    m.position.set(0, y, 0);
    group.add(m);
  }

  /* The header, printed on both faces: the one facing the grid is local -z, so it is turned half a turn. */
  const panel = new THREE.PlaneGeometry(SPAN * 2 - TUBE_R * 2, HEADER_HEIGHT);
  const toGrid = new THREE.Mesh(panel, headerMaterial);
  toGrid.rotation.y = Math.PI;
  toGrid.position.set(0, HEADER_BOTTOM + HEADER_HEIGHT / 2, -0.02);
  group.add(toGrid);
  const away = new THREE.Mesh(panel, headerMaterial);
  away.position.set(0, HEADER_BOTTOM + HEADER_HEIGHT / 2, 0.02);
  group.add(away);

  /* The lamp housing, in the middle of the header, and its four lamps standing proud of both faces. */
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 0.34), housing);
  box.position.set(0, LOWER_ZONE, 0);
  group.add(box);
  const lamps = [];
  const lampMaterials = [AMBER_OFF, AMBER_OFF, AMBER_OFF, GREEN_OFF].map((hex) => new THREE.MeshBasicMaterial({ color: hex, fog: false }));
  lampMaterials.forEach((material, k) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(LAMP_R, 16, 12), material);
    lamp.position.set((1.5 - k) * 0.66, LOWER_ZONE, 0);
    lamp.scale.z = 1.4;
    group.add(lamp);
    lamps.push(lamp);
  });

  /* The scoreboard, to the right of the lamps as the grid sees it, which is local -x. */
  const scoreboard = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.82), boardMaterial);
  scoreboard.rotation.y = Math.PI;
  scoreboard.position.set(-3.45, LOWER_ZONE, -0.05);
  group.add(scoreboard);

  /* The line: two checks deep across the track, a centimetre above the grass. */
  const lineCanvas = document.createElement('canvas');
  lineCanvas.width = 1024;
  lineCanvas.height = 128;
  const lctx = lineCanvas.getContext('2d');
  /* 16 checks across 12 m is 0.75 m a check, and two deep is 1.5 m: square. */
  chequer(lctx, 0, 0, 1024, 128, 16, BANNER.chequerDark, BANNER.chequerLight);
  const lineTexture = new THREE.CanvasTexture(lineCanvas);
  lineTexture.colorSpace = THREE.SRGBColorSpace;
  lineTexture.magFilter = THREE.NearestFilter;
  lineTexture.anisotropy = 8;
  const lineMaterial = celMaterial({ map: lineTexture, key: 'picker-finish-line', rim: 0 });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(course.width, course.width / 8), lineMaterial);
  line.rotation.x = -Math.PI / 2;
  /* The pitch's own paint is laid at 2 cm; the line is above it and wins the depth fight with an offset as well. */
  line.position.set(0, 0.04, 0);
  line.renderOrder = 1;
  lineMaterial.polygonOffset = true;
  lineMaterial.polygonOffsetFactor = -2;
  lineMaterial.polygonOffsetUnits = -2;
  group.add(line);

  let title = '';
  let label = 'SEALED';
  let value = '';

  function repaint() {
    paintHeader(headerCanvas.getContext('2d'), HEADER_CANVAS.w, HEADER_CANVAS.h, title);
    headerTexture.needsUpdate = true;
    paintBoard(boardCanvas.getContext('2d'), BOARD_CANVAS.w, BOARD_CANVAS.h, label, value);
    boardTexture.needsUpdate = true;
  }
  repaint();
  const board = (l, v) => {
    label = l;
    value = v;
    repaint();
  };
  board('WEBFPV', 'READY');

  return {
    group,
    /* The event title, lettered on the header. */
    setTitle(text) {
      title = text;
      repaint();
    },
    /* The seal's fingerprint on the scoreboard: three groups of four. Null puts the idle label back. */
    setFingerprint(text) {
      if (text) {
        board('SEALED', text);
      } else {
        board('WEBFPV', 'READY');
      }
    },
    /* Lamps: how many of the three amber are lit, and whether the green is. */
    setLamps(amber, green = false) {
      lampMaterials.forEach((material, k) => {
        if (k < 3) {
          material.color.setHex(k < amber ? AMBER_ON : AMBER_OFF);
        } else {
          material.color.setHex(green ? GREEN_ON : GREEN_OFF);
        }
      });
    },
    dispose() {
      for (const t of [headerTexture, boardTexture, lineTexture]) {
        t.dispose();
      }
      group.traverse((o) => {
        if (o.geometry) {
          o.geometry.dispose();
        }
      });
      for (const mat of [tube, fitting, housing, headerMaterial, boardMaterial, lineMaterial, ...lampMaterials]) {
        mat.dispose();
      }
      group.removeFromParent();
    },
  };
}
