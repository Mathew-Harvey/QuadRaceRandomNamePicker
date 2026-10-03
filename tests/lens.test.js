/*
 * lens.test.js: the bend the grade pass puts in the picture, and where a tag
 * has to stand to be on what it is a tag of.
 *
 * The formula is the shader's, and the shader cannot be run here, so the
 * properties are the ones that would break if the formula were copied wrong:
 * the middle does not move, the corners do not move (the shader's zoom
 * compensation is exactly that), points are pushed out from the middle and not
 * in, and going there and coming back is the identity.
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
import { DISTORT, glassOf, pixelBeforeBend, pixelOf, sceneOf } from '../src/lens.js';

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not ${b}`);

test('the middle and the corners stay where they are, which is what zoom compensated means', () => {
  const mid = pixelOf(0, 0, 1600, 900);
  near(mid.x, 800, 1e-9, 'middle x');
  near(mid.y, 450, 1e-9, 'middle y');
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const c = pixelOf(sx, sy, 1600, 900);
    near(c.x, sx > 0 ? 1600 : 0, 1e-6, 'corner x');
    near(c.y, sy > 0 ? 0 : 900, 1e-6, 'corner y');
  }
});

test('between the middle and the corner a point is drawn farther out than the plain projection puts it, so a tag that skipped the bend would sit inside its quad', () => {
  /* The shader's zoom compensation magnifies the middle by 1 + d / 2 and leaves the corners alone, so everything in between is carried outward. */
  const ndc = 0.6;
  const drawn = pixelOf(ndc, 0, 1000, 1000);
  const without = (ndc / 2 + 0.5) * 1000;
  assert.ok(drawn.x > without, `${drawn.x} is not outside ${without}`);
  assert.ok(drawn.x - without < 30, 'by a few per cent of the frame and no more');
});

test('glassOf undoes sceneOf, at every point of the frame', () => {
  for (let sx = -0.5; sx <= 0.5; sx += 0.1) {
    for (let sy = -0.5; sy <= 0.5; sy += 0.1) {
      const p = sceneOf(sx, sy, DISTORT, {});
      const s = glassOf(p.x, p.y, DISTORT, {});
      near(s.x, sx, 1e-9, 'x');
      near(s.y, sy, 1e-9, 'y');
    }
  }
});

test('pixelBeforeBend is the inverse of pixelOf, so a panel off the middle of the frame can be hit', () => {
  for (const [x, y] of [[100, 80], [1500, 820], [800, 450], [1200, 200], [300, 700]]) {
    const before = pixelBeforeBend(x, y, 1600, 900, DISTORT, {});
    const ndcX = (before.x / 1600 - 0.5) * 2;
    const ndcY = (0.5 - before.y / 900) * 2;
    const back = pixelOf(ndcX, ndcY, 1600, 900, DISTORT, {});
    near(back.x, x, 1e-6, 'x');
    near(back.y, y, 1e-6, 'y');
  }
});

test('with no distortion it is the plain projection', () => {
  const p = pixelOf(0.5, -0.25, 1000, 800, 0);
  near(p.x, 750, 1e-9, 'x');
  near(p.y, 500, 1e-9, 'y');
});
