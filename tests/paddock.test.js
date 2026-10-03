/*
 * paddock.test.js: how a quad arrives on its block and leaves it, held.
 *
 * The fleet draws these curves and has no arithmetic of its own for them, so
 * what has to be true of them is true here: a drop starts high and ends on
 * the block, falls and never rises on the way down, bounces once and small,
 * and is over by the time it says; a lift only rises, shrinks to nothing, and
 * says when it has gone.
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
import {
  DROP, LIFT, dropHeight, liftState,
} from '../src/paddock.js';

test('a drop starts high, falls without rising, touches the block, bounces once and small, and is over when it says', () => {
  assert.equal(dropHeight(-1), DROP.height, 'before the name is typed it is up where it starts');
  assert.equal(dropHeight(0), DROP.height);
  assert.ok(Math.abs(dropHeight(DROP.fall)) < 1e-9, 'it reaches the block at the end of the fall');
  let previous = Infinity;
  for (let age = 0; age <= DROP.fall; age += 0.002) {
    const h = dropHeight(age);
    assert.ok(h <= previous + 1e-9, `rising in the fall at ${age}`);
    previous = h;
  }
  let peak = 0;
  let bounces = 0;
  let wasUp = false;
  for (let age = DROP.fall + 0.001; age < DROP.seconds; age += 0.002) {
    const h = dropHeight(age);
    assert.ok(h >= 0, 'never through the block');
    peak = Math.max(peak, h);
    const up = h > 0.01;
    if (up && !wasUp) {
      bounces += 1;
    }
    wasUp = up;
  }
  assert.ok(peak > 0.02 && peak <= DROP.bounce + 1e-9, `the bounce is ${peak} m`);
  assert.equal(bounces, 1, 'and there is one');
  assert.equal(dropHeight(DROP.seconds), 0);
  assert.equal(dropHeight(10), 0);
  assert.ok(DROP.seconds < 0.7, 'quick enough to keep up with typing');
});

test('a lift only rises, keeps its size for most of the run, shrinks to nothing, and says when it has gone', () => {
  assert.deepEqual(liftState(0), { height: 0, scale: 1, done: false });
  assert.equal(liftState(-3).height, 0, 'before the name is deleted nothing has happened');
  let height = -1;
  let scale = 2;
  for (let age = 0; age < LIFT.seconds; age += 0.002) {
    const s = liftState(age);
    assert.ok(s.height >= height, 'it only rises');
    assert.ok(s.scale <= scale + 1e-12, 'and only shrinks');
    assert.ok(s.scale >= 0 && s.scale <= 1);
    assert.equal(s.done, false);
    height = s.height;
    scale = s.scale;
  }
  assert.equal(liftState(LIFT.seconds * LIFT.shrink).scale, 1, 'full size until the shrink begins');
  assert.ok(liftState(LIFT.seconds * 0.99).scale < 0.05, 'and nearly nothing at the end');
  assert.deepEqual(liftState(LIFT.seconds), { height: LIFT.height, scale: 0, done: true });
  assert.equal(liftState(99).done, true);
});
