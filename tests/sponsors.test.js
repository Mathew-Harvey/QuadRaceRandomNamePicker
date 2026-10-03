/*
 * sponsors.test.js: the parts of logo intake that are arithmetic on pixels.
 *
 * Trimming, opacity, the border colour a box-shaped logo's board is painted,
 * and where a mark stands on the grass are all decided from plain arrays of
 * pixels and a few numbers, so they are held here without a canvas. What
 * needs a canvas (decoding, encoding to fit the document's caps) is looked at
 * in the shots run, which drops real files on the page.
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
import { GEOMETRY } from '../src/course.js';
import {
  GRASS_MAX, PLACEMENTS, SLOTS, TYPES, borderColour, footprint, isOpaque, stretchFactor, trimBounds,
} from '../src/sponsors.js';

/* A w by h picture of one colour, with a function to paint into it. */
function picture(w, h, fill, paint = () => {}) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = fill;
      px.set(c, (y * w + x) * 4);
    }
  }
  paint((x, y, c) => px.set(c, (y * w + x) * 4));
  return px;
}

const CLEAR = [0, 0, 0, 0];
const INK = [30, 53, 102, 255];

test('trimming finds the box round what is not transparent, and nothing for an empty picture', () => {
  const px = picture(20, 10, CLEAR, (set) => {
    for (let y = 3; y <= 6; y += 1) {
      for (let x = 5; x <= 14; x += 1) {
        set(x, y, INK);
      }
    }
  });
  assert.deepEqual(trimBounds(px, 20, 10), { x: 5, y: 3, w: 10, h: 4 });
  assert.equal(trimBounds(picture(8, 8, CLEAR), 8, 8), null);
  assert.deepEqual(trimBounds(picture(4, 3, INK), 4, 3), { x: 0, y: 0, w: 4, h: 3 }, 'a picture with no margin is already trimmed');
  /* A faint smudge under the threshold is not the picture. */
  const smudge = picture(10, 10, CLEAR, (set) => {
    set(0, 0, [255, 255, 255, 6]);
    set(5, 5, INK);
  });
  assert.deepEqual(trimBounds(smudge, 10, 10), { x: 5, y: 5, w: 1, h: 1 });
});

test('opaque means a box: a JPEG is, a cut out logo is not, and a hair of antialiasing does not count', () => {
  assert.equal(isOpaque(picture(30, 30, INK), 30, 30), true);
  const cutOut = picture(30, 30, CLEAR, (set) => {
    for (let y = 8; y < 22; y += 1) {
      for (let x = 8; x < 22; x += 1) {
        set(x, y, INK);
      }
    }
  });
  assert.equal(isOpaque(cutOut, 30, 30), false);
  const corner = picture(100, 100, INK, (set) => set(0, 0, [30, 53, 102, 120]));
  assert.equal(isOpaque(corner, 100, 100), true, 'one soft corner pixel in ten thousand');
});

test('the colour of the border is the colour of the box', () => {
  const px = picture(40, 20, [200, 30, 20, 255], (set) => {
    for (let y = 5; y < 15; y += 1) {
      for (let x = 10; x < 30; x += 1) {
        set(x, y, [255, 255, 255, 255]);
      }
    }
  });
  assert.equal(borderColour(px, 40, 20), '#c81e14');
  assert.equal(borderColour(picture(2, 2, [0, 128, 255, 255]), 2, 2), '#0080ff');
});

test('the grass is stretched by one over the sine of how far down the rail looks at it', () => {
  const s = stretchFactor();
  const across = GEOMETRY.railInset - 10;
  const down = Math.atan2(GEOMETRY.railHeight, across);
  assert.ok(Math.abs(s - 1 / Math.sin(down)) < 1e-12);
  assert.ok(s > 2.2 && s < 2.3, `stretch ${s}`);
  assert.ok(stretchFactor(GEOMETRY, 14) < s, 'a mark nearer the rail is seen from steeper, and stretched less');
});

test('a mark takes the widest footprint that fits its box, in its own shape', () => {
  const stretch = stretchFactor();
  /* A wide logo, three to one: limited by its depth. */
  const wide = footprint(3, stretch);
  assert.ok(wide.depth <= GRASS_MAX.depth + 1e-9 && wide.width <= GRASS_MAX.width + 1e-9);
  assert.ok(Math.abs(wide.depth - GRASS_MAX.depth) < 1e-9 || Math.abs(wide.width - GRASS_MAX.width) < 1e-9, 'it fills one side of the box');
  /* Stretched along the sight, the footprint is deeper than the picture is tall by the stretch. */
  assert.ok(Math.abs(wide.depth / wide.width - stretch / 3) < 1e-9);
  /* A very wide one is limited by the box's width. */
  const banner = footprint(12, stretch);
  assert.equal(banner.width, GRASS_MAX.width);
  assert.ok(banner.depth < GRASS_MAX.depth);
  /* A square one is small, and is still in its shape. */
  const square = footprint(1, stretch);
  assert.ok(square.width < 3.5 && Math.abs(square.depth / square.width - stretch) < 1e-9);
});

test('the rules of intake are the brief\'s: four slots, five kinds of file, three placements', () => {
  assert.equal(SLOTS, 4);
  assert.deepEqual(TYPES, ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']);
  assert.deepEqual(PLACEMENTS, ['both', 'boards', 'grass']);
});
