/*
 * frame.test.js: the one place the plan's frame becomes Three.js's, and the
 * livery that colours what stands in it.
 *
 * A sign error here is the kind that survives a year, so the properties are
 * the ones a wrong sign would break: the conversion keeps handedness, a quad
 * hovering level points its nose where the plan says and not behind it, a
 * quad accelerating forward pitches nose down, a flip turns the up axis
 * through the quad's own forward, and the matrix is a rotation and a uniform
 * scale and never a shear or a mirror.
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
import { fromThree, quadMatrix, toThree } from '../src/frame.js';
import {
  GOLDEN_ANGLE, LIVERY_C, LIVERY_L, liveryCss, liveryHex, liveryHue,
} from '../src/livery.js';

const near = (a, b, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} is not ${b}`);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('the conversion is a rotation: it keeps handedness and round trips', () => {
  const x = toThree(1, 0, 0);
  const y = toThree(0, 1, 0);
  const z = toThree(0, 0, 1);
  /* Up in the plan is up in Three, and the plan's east is Three's east. */
  const plain = (v) => [v.x + 0, v.y + 0, v.z + 0];
  assert.deepEqual(plain(x), [1, 0, 0]);
  assert.deepEqual(plain(z), [0, 1, 0]);
  /* North in the plan is Three's minus Z. */
  assert.deepEqual(plain(y), [0, 0, -1]);
  const c = cross(plain(x), plain(y));
  assert.deepEqual(c.map((v) => v + 0), plain(z), 'x cross y is z in both frames, which is what handedness means');
  for (const p of [[3, -4, 5], [0, 0, 0], [-120.5, 33.25, 0.32]]) {
    const t = toThree(...p);
    const back = fromThree(t.x, t.y, t.z);
    assert.deepEqual(plain(back), p);
  }
});

function basis(pose, scale = 1) {
  const m = quadMatrix(pose, scale);
  return {
    right: [m[0], m[1], m[2]],
    up: [m[4], m[5], m[6]],
    back: [m[8], m[9], m[10]],
    at: [m[12], m[13], m[14]],
    m,
  };
}

const level = { x: 5, y: -7, z: 1.3, tx: 0, ty: 0, tz: 1, fx: 1, fy: 0, wobble: 0, flip: 0 };

test('a quad hovering level has its nose on the heading, up up, and its position moved to Three', () => {
  const b = basis(level);
  /* Plan east is Three +X, so the nose, which is minus the body's Z axis, points +X, and the quad's right hand is south, Three +Z. */
  assert.deepEqual(b.back.map((v) => v + 0), [-1, 0, 0]);
  assert.deepEqual(b.up.map((v) => v + 0), [0, 1, 0]);
  assert.deepEqual(b.right.map((v) => v + 0), [0, 0, 1]);
  assert.deepEqual(b.at, [5, 1.3, 7]);
});

test('the matrix is a rotation and a uniform scale, whatever the pose, and right handed', () => {
  const poses = [
    { ...level, tx: 0.3, ty: -0.2, tz: 0.9, fx: 0.6, fy: 0.8 },
    { ...level, tx: -0.5, ty: 0.5, tz: 0.7, fx: -0.2, fy: -0.97 },
    { ...level, tx: 0, ty: 0.7, tz: 0.7, fx: 0, fy: 1, wobble: 0.4 },
    { ...level, tx: 0.1, ty: 0.1, tz: 0.98, fx: -1, fy: 0, flip: 2.1 },
    { ...level, tx: 0.2, ty: 0.1, tz: 0.9, fx: 0.7, fy: 0.7, wobble: -0.3, flip: 5 },
  ];
  for (const pose of poses) {
    const scale = 1.7;
    const b = basis(pose, scale);
    for (const col of [b.right, b.up, b.back]) {
      near(Math.hypot(...col), scale, 1e-9, 'a column is the scale long');
    }
    near(dot(b.right, b.up), 0, 1e-9, 'right . up');
    near(dot(b.up, b.back), 0, 1e-9, 'up . back');
    near(dot(b.right, b.back), 0, 1e-9, 'right . back');
    const c = cross(b.right, b.up);
    near(dot(c, b.back), scale ** 3, 1e-9, 'right handed: the determinant is positive');
  }
});

test('pitching forward to accelerate puts the nose down, and a bank puts the up axis toward the turn', () => {
  /* Thrust leans forward of vertical: the nose goes down. */
  const lean = { ...level, tx: 0.5, ty: 0, tz: Math.sqrt(0.75) };
  const b = basis(lean);
  const nose = b.back.map((v) => -v);
  assert.ok(nose[1] < -0.2, `the nose points down: ${nose[1]}`);
  assert.ok(nose[0] > 0.8, 'and still along the heading');
  /* Thrust leans to the left of the heading (plan north): the up axis tilts toward Three's minus Z. */
  const bank = { ...level, tx: 0, ty: 0.5, tz: Math.sqrt(0.75) };
  const k = basis(bank);
  assert.ok(k.up[2] < -0.4, 'up tilts toward plan north, which is Three minus Z');
});

test('a flip is a forward flip about the quad right axis: one full turn comes back, half a turn is upside down', () => {
  const half = basis({ ...level, flip: Math.PI });
  near(half.up[1], -1, 1e-9, 'upside down');
  const whole = basis({ ...level, flip: 2 * Math.PI });
  near(whole.up[1], 1, 1e-9, 'the right way up again');
  /* A quarter turn forward: the old up is now ahead, so up points along the heading. */
  const quarter = basis({ ...level, flip: Math.PI / 2 });
  near(quarter.up[0], 1, 1e-9, 'up points along the way of travel a quarter into a forward flip');
});

test('a pose that is a blend of two is still a rotation: the up axis is made a unit vector', () => {
  const b = basis({ ...level, tx: 0.2, ty: 0.2, tz: 0.4 }, 1);
  near(Math.hypot(...b.up), 1, 1e-12);
});

test('livery: fifty colours, all distinct, neighbours a golden angle apart', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const hex = liveryHex(i);
    assert.ok(Number.isInteger(hex) && hex >= 0 && hex <= 0xffffff);
    seen.add(hex);
    assert.match(liveryCss(i), /^#[0-9a-f]{6}$/);
  }
  assert.equal(seen.size, 50, 'no two entries share a colour');
  for (let i = 0; i < 49; i += 1) {
    let d = Math.abs(liveryHue(i + 1) - liveryHue(i));
    d = Math.min(d, 360 - d);
    near(d, GOLDEN_ANGLE, 1e-9, 'adjacent hues are a golden angle apart');
  }
  assert.equal(LIVERY_L, 0.8);
  assert.equal(LIVERY_C, 0.13);
});

test('livery: the closest two hues of fifty are far enough apart to tell, and neighbours far apart', () => {
  const plane = (i) => {
    const h = (liveryHue(i) * Math.PI) / 180;
    return [LIVERY_C * Math.cos(h), LIVERY_C * Math.sin(h)];
  };
  let closest = Infinity;
  let adjacent = Infinity;
  for (let a = 0; a < 50; a += 1) {
    for (let b = a + 1; b < 50; b += 1) {
      const [ax, ay] = plane(a);
      const [bx, by] = plane(b);
      const d = Math.hypot(ax - bx, ay - by);
      closest = Math.min(closest, d);
      if (b === a + 1) {
        adjacent = Math.min(adjacent, d);
      }
    }
  }
  console.log(`livery: closest pair of 50 hues ${closest.toFixed(4)} apart in the chroma plane, closest neighbours ${adjacent.toFixed(4)}`);
  assert.ok(closest > 0.01, `two of the fifty hues are ${closest} apart`);
  assert.ok(adjacent > 0.2, `two neighbours are ${adjacent} apart`);
});
