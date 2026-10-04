/*
 * spray.test.js: a sponsor's mark on the grass is the shape it was drawn, as
 * the glass shows it, from every camera the show has.
 *
 * The test flies the app's own cameras (src/camera.js: the paddock's orbit,
 * the aerial, the rail, the winner's picture) past the arrays src/spray.js
 * writes for the mesh, and projects every vertex through a pinhole lens
 * built the way Three.js builds a camera that looks at a point. What it
 * measures is the picture on the glass: the mark must be a rectangle, in the
 * logo's own width over height, the right way up and not mirrored, and the
 * size a mark standing at that spot would have. It cannot see the meshes, the
 * material or the order things are drawn in, which are src/marks.js and which
 * scripts/shots.js reads off a rendered frame.
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCourse } from '../src/course.js';
import { makeShots } from '../src/camera.js';
import { makePlan } from '../src/choreo.js';
import { toThree } from '../src/frame.js';
import {
  MARK, markPlan, markSize, markStations, markTopology, sprayMark,
} from '../src/spray.js';

const course = makeCourse();
const shots = makeShots({ course });

/* Four shapes: a circle, a wide plate, a tall one and a banner. */
const ASPECTS = [1, 3, 0.5, 8];
const places = markPlan(course, ASPECTS);

const ROWS = MARK.rows;
const topology = markTopology();
const TAN_MIN = Math.tan((MARK.minDepression * Math.PI) / 180);

const unit = (v) => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/* The lens a shot gives, in the frame the marks are in: where it is, and its right, up and forward as Three's lookAt makes them with the world up as up. */
function lensOf(view) {
  const eye = toThree(view.x, view.y, view.z, {});
  const target = toThree(view.tx, view.ty, view.tz, {});
  const forward = unit({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  return { eye, forward, right, up: cross(right, forward) };
}

/* Where a point is on the glass, in tangents of the angle from the lens's axis: x to the right, y up. Null if it is not in front. */
function onGlass(lens, x, y, z) {
  const v = { x: x - lens.eye.x, y: y - lens.eye.y, z: z - lens.eye.z };
  const depth = dot(v, lens.forward);
  if (!(depth > 1e-9)) {
    return null;
  }
  return { x: dot(v, lens.right) / depth, y: dot(v, lens.up) / depth, depth };
}

/* Every shot the show has, as a list of lenses, with what it is called. */
function allLenses() {
  const list = [];
  const view = {};
  for (const n of [1, 3, 12, 50]) {
    for (let t = 0; t <= 100; t += 0.5) {
      list.push({ kind: 'paddock', lens: lensOf(shots.paddock(t, n, view)) });
    }
  }
  for (let k = 0; k <= 1; k += 0.01) {
    list.push({ kind: 'aerial', lens: lensOf(shots.aerial(k, PLAN, view)) });
  }
  const end = Math.max(...PLAN.finish);
  for (let t = 0; t <= end; t += 0.25) {
    list.push({ kind: 'rail', lens: lensOf(shots.rail(PLAN, t, view, false, 16 / 9)) });
  }
  for (let t = end - 3; t <= end + 1; t += 0.1) {
    list.push({ kind: 'hero', lens: lensOf(shots.hero(PLAN, t, view)) });
  }
  return list;
}

/* One plan for the cameras that need a race to follow: twelve names, thirty seconds. */
const PLAN = makePlan({
  order: Array.from({ length: 12 }, (_, i) => i),
  showSeed: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  length: 30,
});

const out = new Float64Array((ROWS + 1) * 6);
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
/* Close to a billionth of `scale`: for a number on the glass, which is a tangent and small, the scale is the size of the mark that it is a part of. */
const within = (a, b, scale, tolerance = 1e-9) => Math.abs(a - b) <= tolerance * scale;

test('a mark takes the widest size in its own shape that fits the box, whatever the shape', () => {
  for (const aspect of [0.05, 0.2, 0.5, 1, 1.5, 3, 8, 30]) {
    const { width, height } = markSize(aspect);
    assert.ok(near(width / height, aspect, 1e-12), `shape ${aspect} came out ${width / height}`);
    assert.ok(width <= MARK.maxWidth + 1e-12 && height <= MARK.maxHeight + 1e-12, `${aspect} is ${width} by ${height}`);
    assert.ok(near(width, MARK.maxWidth, 1e-12) || near(height, MARK.maxHeight, 1e-12), `${aspect} fills one side of the box`);
  }
});

test('six places on the infield, dealt round robin, each in its own mark\'s size, and none without marks', () => {
  assert.equal(markStations(course).length, 6);
  assert.deepEqual(places.map((p) => p.design), [0, 1, 2, 3, 0, 1]);
  for (const place of places) {
    const own = markSize(ASPECTS[place.design]);
    assert.ok(near(place.width, own.width) && near(place.height, own.height), 'a place is as big as its own mark');
  }
  assert.deepEqual(markPlan(course, []), []);
  assert.deepEqual(markPlan(course, [1]).map((p) => p.design), [0, 0, 0, 0, 0, 0], 'one mark is in all six');

  /* The infield strip: between the track's inner edge, 6 m from the line, and the rail, 20 m in. */
  const at = {};
  for (const place of places) {
    let nearest = { d: Infinity, u: 0 };
    for (let s = 0; s < course.lap; s += 0.05) {
      course.at(s, at);
      const dx = place.x - at.x;
      const dy = -place.z - at.y;
      const d = Math.hypot(dx, dy);
      if (d < nearest.d) {
        nearest = { d, u: dx * -at.ty + dy * at.tx };
      }
    }
    assert.ok(nearest.u < -8 && nearest.u > -12, `a mark is ${nearest.u} m from the line, in the infield strip`);
  }
});

test('the picture runs bottom to top and left to right, and every triangle shows its front to a lens above', () => {
  const { uv, index } = topology;
  assert.equal(uv.length, (ROWS + 1) * 4);
  assert.equal(index.length, ROWS * 6);
  for (let r = 0; r <= ROWS; r += 1) {
    assert.deepEqual([uv[r * 4], uv[r * 4 + 2]], [0, 1], 'the left vertex is the left of the picture');
    /* The coordinates are single precision, the way the graphics card has them. */
    assert.ok(near(uv[r * 4 + 1], r / ROWS, 1e-6) && near(uv[r * 4 + 3], r / ROWS, 1e-6), 'a row has one height');
  }
  /* Flat on the ground, looked at from straight above with the picture's top away from the lens (up is -z, right is +x). */
  const flat = new Float64Array((ROWS + 1) * 6);
  const above = { x: 0, y: 30, z: 0 };
  sprayMark(flat, above, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: -1, z: 0 }, { x: 0, z: 0, width: 4, height: 2 });
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map((i) => ({ x: flat[i * 3], z: flat[i * 3 + 2] }));
    /* Counter clockwise seen from above (+y toward the viewer, x to the right, -z up the page) is a positive area with z flipped. */
    const area = ((b.x - a.x) * (-c.z + a.z) - (c.x - a.x) * (-b.z + a.z)) / 2;
    assert.ok(area > 0, `triangle ${t / 3} faces down`);
  }
});

test('from straight above a mark lies flat, in its own size, with its top away from the lens', () => {
  const flat = new Float64Array((ROWS + 1) * 6);
  const k = sprayMark(flat, { x: 5, y: 30, z: -3 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: -1, z: 0 }, { x: 5, z: -3, width: 4, height: 2 });
  assert.equal(k, 1);
  const xs = [];
  const zs = [];
  for (let i = 0; i < (ROWS + 1) * 2; i += 1) {
    xs.push(flat[i * 3]);
    zs.push(flat[i * 3 + 2]);
    assert.ok(near(flat[i * 3 + 1], MARK.lift), 'on the grass');
  }
  assert.ok(near(Math.min(...xs), 3) && near(Math.max(...xs), 7), 'four metres wide');
  assert.ok(near(Math.min(...zs), -4) && near(Math.max(...zs), -2), 'two metres deep');
  /* The lens's up is -z here, so the picture's bottom row is the one at the larger z. */
  assert.ok(flat[2] > flat[ROWS * 6 + 2], 'the first row is the bottom of the picture and the last is its top');
});

test('on the glass a mark is a rectangle in the logo\'s own shape, upright and not mirrored, at the size of a mark standing there', () => {
  const lenses = allLenses();
  const tested = { paddock: 0, aerial: 0, rail: 0, hero: 0 };
  for (const { kind, lens } of lenses) {
    for (const place of places) {
      const k = sprayMark(out, lens.eye, lens.right, lens.up, lens.forward, place);
      if (!(k > 0)) {
        continue;
      }
      tested[kind] += 1;
      const grid = [];
      for (let r = 0; r <= ROWS; r += 1) {
        const left = onGlass(lens, out[r * 6], out[r * 6 + 1], out[r * 6 + 2]);
        const right = onGlass(lens, out[r * 6 + 3], out[r * 6 + 4], out[r * 6 + 5]);
        assert.ok(left && right, `${kind}: a vertex is behind the lens`);
        grid.push([left, right]);
      }
      const width = grid[0][1].x - grid[0][0].x;
      const height = grid[ROWS][0].y - grid[0][0].y;
      for (let r = 0; r <= ROWS; r += 1) {
        assert.ok(within(grid[r][0].x, grid[0][0].x, width) && within(grid[r][1].x, grid[0][1].x, width), `${kind}: row ${r} is not under the first, so the mark is not a rectangle`);
        assert.ok(within(grid[r][0].y, grid[r][1].y, height), `${kind}: row ${r} is not level`);
        assert.ok(within(grid[r][0].y - grid[0][0].y, (height * r) / ROWS, height), `${kind}: rows are not evenly spaced up the glass`);
      }
      assert.ok(width > 0 && height > 0, `${kind}: the mark is mirrored or upside down on the glass`);
      const aspect = place.width / place.height;
      assert.ok(near(width / height, aspect), `${kind}: a ${aspect}:1 mark shows as ${width / height}:1`);
      /* Its size is what a flat card of that size standing at the spot, square to the lens, would show. */
      const depth = dot({ x: place.x - lens.eye.x, y: MARK.lift - lens.eye.y, z: place.z - lens.eye.z }, lens.forward);
      assert.ok(within(width, (k * place.width) / depth, width), `${kind}: a mark does not have the size of one standing at its spot`);
      assert.ok(k <= 1);
    }
  }
  assert.ok(tested.paddock > 1500 && tested.aerial > 300 && tested.rail > 50, `too few marks were measured to mean anything: ${JSON.stringify(tested)}`);
});

test('the triangles keep the picture straight on the glass: u runs along it and v runs up it', () => {
  const { uv, index } = topology;
  const view = {};
  for (const lens of [lensOf(shots.paddock(0, 12, view)), lensOf(shots.paddock(30, 3, view)), lensOf(shots.aerial(0.5, PLAN, view))]) {
    for (const place of places) {
      const k = sprayMark(out, lens.eye, lens.right, lens.up, lens.forward, place);
      if (!(k > 0)) {
        continue;
      }
      for (let t = 0; t < index.length; t += 3) {
        const p = [0, 1, 2].map((j) => {
          const i = index[t + j];
          return { ...onGlass(lens, out[i * 3], out[i * 3 + 1], out[i * 3 + 2]), u: uv[i * 2], v: uv[i * 2 + 1] };
        });
        /* The affine map from the glass to the picture over this triangle: its two gradients. */
        const d = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y);
        const grad = (f) => ({
          x: ((p[1][f] - p[0][f]) * (p[2].y - p[0].y) - (p[2][f] - p[0][f]) * (p[1].y - p[0].y)) / d,
          y: ((p[2][f] - p[0][f]) * (p[1].x - p[0].x) - (p[1][f] - p[0][f]) * (p[2].x - p[0].x)) / d,
        });
        const du = grad('u');
        const dv = grad('v');
        assert.ok(du.x > 0 && dv.y > 0, 'u runs left to right and v runs up the glass');
        assert.ok(Math.abs(du.y) < 1e-6 * du.x && Math.abs(dv.x) < 1e-6 * dv.y, 'and neither leans');
        assert.ok(d > 0, 'and the front of the triangle faces the lens');
      }
    }
  }
});

test('the top of a mark is always carried to the grass at least the least angle below the horizon, and a mark is dropped only when it cannot be', () => {
  let drawn = 0;
  let shrunk = 0;
  let dropped = 0;
  for (const { lens } of allLenses()) {
    for (const place of places) {
      const k = sprayMark(out, lens.eye, lens.right, lens.up, lens.forward, place);
      const rise = lens.eye.y - MARK.lift;
      const run = Math.hypot(place.x - lens.eye.x, place.z - lens.eye.z);
      if (k > 0) {
        drawn += 1;
        if (k < 1) {
          shrunk += 1;
        }
        /* The top row's ground points, from the lens. */
        for (const side of [0, 1]) {
          const o = (ROWS * 2 + side) * 3;
          const reach = Math.hypot(out[o] - lens.eye.x, out[o + 2] - lens.eye.z);
          assert.ok(rise / reach >= TAN_MIN * (1 - 1e-9), `the top of a mark lands ${(Math.atan2(rise, reach) * 180) / Math.PI} degrees down`);
        }
      } else {
        dropped += 1;
        const ahead = dot({ x: place.x - lens.eye.x, y: MARK.lift - lens.eye.y, z: place.z - lens.eye.z }, lens.forward);
        assert.ok(ahead < MARK.near || rise / run < TAN_MIN * 1.01, `a mark ${ahead.toFixed(1)} m ahead at ${(Math.atan2(rise, run) * 180) / Math.PI} degrees was dropped`);
      }
    }
  }
  assert.ok(drawn > 0 && shrunk > 0 && dropped > 0, `the sweep must meet all three cases: ${drawn} drawn, ${shrunk} shrunk, ${dropped} dropped`);
});

test('a mark does not pop: it shrinks and grows by less than a twentieth of its size in a sixtieth of a second', () => {
  const view = {};
  const end = Math.max(...PLAN.finish);
  const sweeps = [
    ['paddock of three', 100, (t) => shots.paddock(t, 3, view)],
    ['paddock of fifty', 100, (t) => shots.paddock(t, 50, view)],
    /* The lights run 5 to 6.5 s, and the aerial is timed to them: the fastest descent is the one to test. */
    ['aerial', 5, (t) => shots.aerial(t / 5, PLAN, view)],
    ['rail', end, (t) => shots.rail(PLAN, t, view, false, 16 / 9)],
  ];
  for (const [name, seconds, shot] of sweeps) {
    const before = places.map(() => ({ k: 0, ahead: 0 }));
    let worst = 0;
    for (let t = 0; t <= seconds; t += 1 / 60) {
      const lens = lensOf(shot(t));
      places.forEach((place, i) => {
        const k = sprayMark(out, lens.eye, lens.right, lens.up, lens.forward, place);
        const ahead = dot({ x: place.x - lens.eye.x, y: MARK.lift - lens.eye.y, z: place.z - lens.eye.z }, lens.forward);
        /* A spot passing through the plane of the lens is a mark appearing or going at the very edge of the world, 90 degrees off the axis and out of any picture: not a pop. */
        if (t > 0 && Math.min(ahead, before[i].ahead) > 1.5) {
          worst = Math.max(worst, Math.abs(k - before[i].k));
        }
        before[i] = { k, ahead };
      });
    }
    assert.ok(worst < 0.05, `${name}: a mark changed size by ${worst} in one frame`);
  }
});

test('a lens below the grass, or one that has the spot behind it, draws nothing', () => {
  const right = { x: 1, y: 0, z: 0 };
  const up = { x: 0, y: 1, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const mark = { x: 0, z: -20, width: 4, height: 2 };
  assert.ok(sprayMark(out, { x: 0, y: 4, z: 0 }, right, up, forward, mark) > 0, 'the control: a lens 4 m up, looking at it');
  assert.equal(sprayMark(out, { x: 0, y: -1, z: 0 }, right, up, forward, mark), 0, 'under the grass');
  assert.equal(sprayMark(out, { x: 0, y: MARK.lift, z: 0 }, right, up, forward, mark), 0, 'on it');
  assert.equal(sprayMark(out, { x: 0, y: 4, z: 0 }, { x: -1, y: 0, z: 0 }, up, { x: 0, y: 0, z: 1 }, mark), 0, 'the spot is behind');
  assert.equal(sprayMark(out, { x: 0, y: 1, z: 0 }, right, up, forward, { ...mark, z: -100 }), 0, 'the spot is under the least angle');
});

test('from low down the mark is longer on the ground than it is tall, and wider at the far end than at the near', () => {
  const lens = { eye: { x: 0, y: 4, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: unit({ x: 0, y: 0.9, z: -0.3 }), forward: unit({ x: 0, y: -0.3, z: -0.9 }) };
  const mark = { x: 0, z: -20, width: 3, height: 3 };
  const k = sprayMark(out, lens.eye, lens.right, lens.up, lens.forward, mark);
  assert.ok(k > 0);
  const nearWidth = out[3] - out[0];
  const farWidth = out[ROWS * 6 + 3] - out[ROWS * 6];
  const depth = Math.abs(out[ROWS * 6 + 2] - out[2]);
  assert.ok(depth > 3 * 3, `a three metre circle is ${depth} m deep on the ground`);
  assert.ok(farWidth > nearWidth * 1.5, `${farWidth} against ${nearWidth}`);
});
