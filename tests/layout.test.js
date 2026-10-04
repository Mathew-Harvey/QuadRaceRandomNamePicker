/*
 * layout.test.js: the track document, as the simulator's own reader sees it.
 *
 * The field is built from a document that src/layout.js writes from the
 * plan's numbers, so the two are checked against each other: a flag stands
 * where the plan's oval says, on the inside of the line, a start stand is
 * under each lane of the grid's front row, and the reader, which is the
 * simulator's, takes the whole document without a warning as a closed lap.
 * What this cannot see is the picture, which tests/shots does.
 *
 * It imports the simulator's own model and reader through src/layout.js,
 * which are pure and have no DOM, so it runs in Node.
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
import { GRID, LATTICE, makeCourse } from '../src/course.js';
import {
  BLOCK_SCALE, FIELD, PAD_SIZE, buildCourseFor, buildDocument,
} from '../src/layout.js';
import { fromThree, toThree } from '../src/frame.js';
import { startBlockDims } from '../sim/src/art/startblock.js';

const course = makeCourse();
const built = buildCourseFor();

/* A 1 by 1 PNG, the smallest valid mark. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/* The nearest point of the line to a plan point, and which side of it the point is on: negative is the infield. */
function sideOf(x, y) {
  let best = { d: Infinity, u: 0 };
  const at = {};
  for (let s = 0; s < course.lap; s += 0.05) {
    course.at(s, at);
    const dx = x - at.x;
    const dy = y - at.y;
    const d = Math.hypot(dx, dy);
    if (d < best.d) {
      best = { d, u: dx * -at.ty + dy * at.tx };
    }
  }
  return best;
}

test('the simulator reads the document as a closed lap with nothing to warn about', () => {
  assert.deepEqual(built.warnings, []);
  assert.equal(built.closed, true);
  assert.equal(built.trackClass, 'full');
  assert.equal(built.stations.length, 8, 'eight flags, eight stations');
  assert.deepEqual(built.field, { width: FIELD.width, depth: FIELD.depth });
  assert.equal(built.guide, null, 'the simulator\'s own racing line is not painted: the fleet flies the plan\'s');
});

test('the document is plain data: the same twice, with no engine random function in it', () => {
  const a = JSON.stringify(buildDocument());
  const b = JSON.stringify(buildDocument());
  assert.equal(a, b);
  assert.equal(JSON.parse(a).id, 'trk-webfpv-picker');
});

test('eight flags stand on the inside of the line, at the inner edge of the track, in flying order', () => {
  const flags = built.structures.filter((s) => s.type === 'flag');
  assert.equal(flags.length, 8);
  let last = -1;
  for (const flag of flags) {
    const p = fromThree(flag.x, 0, flag.z);
    const { d, u } = sideOf(p.x, p.y);
    assert.ok(Math.abs(d - 6) < 0.02, `a flag is ${d} m from the line, not the track's 6 m half width`);
    assert.ok(u < 0, 'and on the infield side');
    /* Along the line, in order: find s of the nearest point. */
    let bestS = 0;
    let bestD = Infinity;
    const at = {};
    for (let s = 0; s < course.lap; s += 0.05) {
      course.at(s, at);
      const dd = Math.hypot(p.x - at.x, p.y - at.y);
      if (dd < bestD) {
        bestD = dd;
        bestS = s;
      }
    }
    assert.ok(bestS > last, `flags are in flying order: ${bestS} after ${last}`);
    last = bestS;
  }
});

test('there is exactly one startPads, and its nine stands are under the nine lanes of the grid front row', () => {
  const pads = built.structures.filter((s) => s.type === 'startPads');
  assert.equal(pads.length, 1);
  const [pad] = pads;
  assert.equal(pad.dims.pads, course.lanes);
  assert.equal(pad.dims.spacing, LATTICE.laneSpacing);
  assert.equal(pad.dims.padSize, PAD_SIZE);
  assert.equal(PAD_SIZE, 0.6 * BLOCK_SCALE);
  /* The simulator's own placement of stand i, from sim/src/render/scene.js: along the pads' heading from the element's origin. */
  const standAt = (i) => {
    const off = (i - (course.lanes - 1) / 2) * pad.dims.spacing;
    return { x: pad.x + Math.cos(pad.yaw) * off, z: pad.z - Math.sin(pad.yaw) * off };
  };
  for (let i = 0; i < course.lanes; i += 1) {
    /* Stand i is lane (lanes - 1 - i): the grid counts lanes from the infield out. */
    const lane = course.lanes - 1 - i;
    const want = course.place(-GRID.front, course.laneU(lane), 0, {});
    const t = toThree(want.x, want.y, 0);
    const got = standAt(i);
    assert.ok(Math.abs(got.x - t.x) < 1e-3 && Math.abs(got.z - t.z) < 1e-3,
      `stand ${i} is at (${got.x.toFixed(3)}, ${got.z.toFixed(3)}) and lane ${lane} is at (${t.x.toFixed(3)}, ${t.z.toFixed(3)})`);
  }
  /* The stands face the way of travel: the scene's yaw takes -Z to the tangent. */
  const at = course.at(-GRID.front, {});
  const nose = { x: -Math.sin(pad.yaw), z: -Math.cos(pad.yaw) };
  const tangent = toThree(at.tx, at.ty, 0);
  assert.ok(Math.abs(nose.x - tangent.x) < 1e-4 && Math.abs(nose.z - tangent.z) < 1e-4, 'the stands point down the line');
});

test('a stand is as tall as the plan says a quad sits: the ramp is a quad long and the quad sits on its foam', () => {
  const dims = startBlockDims(PAD_SIZE);
  assert.ok(dims.railLen > 0.5 && dims.railLen < GRID.rowPitch / 2, `a stand is ${dims.railLen} m long, in rows ${GRID.rowPitch} m apart`);
  assert.ok(dims.spanAcross < LATTICE.laneSpacing / 2, 'and narrower than half a lane');
  const sit = dims.baseH + dims.rise * 0.5 + dims.railT + dims.foamT;
  assert.ok(Math.abs(sit - LATTICE.blockHeight) < 0.1, `the foam's middle is ${sit.toFixed(3)} m up and the plan's block height is ${LATTICE.blockHeight}`);
});

test('the document carries no sponsor marks: the grass ones are the picker\'s own, laid for each camera (src/marks.js)', () => {
  const doc = buildDocument();
  assert.equal(doc.elements.filter((e) => e.type === 'groundLogo').length, 0, 'no groundLogo, which would be painted into the pitch and fixed to it');
  assert.deepEqual(doc.branding.logos, []);
  assert.equal(built.decals.length, 0);
  assert.equal(built.logos.length, 0);
  /* Nothing a caller passes puts one back, so a field is the same field whatever logos were dropped. */
  assert.deepEqual(buildDocument({ logos: [{ image: PNG }] }), doc);
});
