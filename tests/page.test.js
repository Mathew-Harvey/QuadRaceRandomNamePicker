/*
 * page.test.js: the manga page's geometry.
 *
 * The results page is a set of panels cut out of a sheet of paper, and a
 * panel that overlaps its neighbour, runs off the page or loses its gutter
 * is a page that looks broken on exactly the window nobody tried. So the
 * layout is held for the windows people have: a laptop, a monitor, a 4K
 * window nearly square, a tablet, a phone, with one, two and three winners
 * and every size of field.
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
  U_FLOOR, boxOf, layoutResults, panelArea,
} from '../src/page.js';

const WINDOWS = [[1600, 900], [1280, 720], [1920, 1080], [3840, 2160], [1877, 1938], [1024, 768], [820, 1180], [390, 844], [360, 640], [2560, 1080]];

/* Convex quads: do two overlap by more than a pixel? Separating axis test on both polygons' edge normals. */
function overlap(a, b) {
  let least = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny) || 1;
      const project = (shape) => {
        const d = shape.map((v) => (v[0] * nx + v[1] * ny) / len);
        return [Math.min(...d), Math.max(...d)];
      };
      const [a0, a1] = project(a);
      const [b0, b1] = project(b);
      const depth = Math.min(a1, b1) - Math.max(a0, b0);
      if (depth <= 0) {
        return 0;
      }
      least = Math.min(least, depth);
    }
  }
  return least;
}

/* The smallest distance between two convex quads that do not overlap: the gap on the best separating axis. */
function gapBetween(a, b) {
  let best = -Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny) || 1;
      const project = (shape) => {
        const d = shape.map((v) => (v[0] * nx + v[1] * ny) / len);
        return [Math.min(...d), Math.max(...d)];
      };
      const [a0, a1] = project(a);
      const [b0, b1] = project(b);
      best = Math.max(best, Math.max(a0, b0) - Math.min(a1, b1));
    }
  }
  return best;
}

test('every panel is on the page, and none covers another, in every window with every number of winners', () => {
  for (const [W, H] of WINDOWS) {
    for (const winners of [1, 2, 3]) {
      for (const counts of [2, 10, 50]) {
        const L = layoutResults(W, H, winners, counts);
        const names = Object.keys(L.panels);
        const want = ['big', 'order', 'seal', 'actions', ...(winners >= 2 ? ['second'] : []), ...(winners >= 3 ? ['third'] : [])];
        assert.deepEqual(names.sort(), want.sort(), `${W}x${H} winners ${winners}`);
        for (const [name, q] of Object.entries(L.panels)) {
          for (const [x, y] of q) {
            assert.ok(x >= -0.01 && x <= W + 0.01 && y >= -0.01 && y <= L.height + 0.01, `${W}x${H} ${name} corner (${x}, ${y}) is off the page (${W} by ${L.height})`);
          }
          assert.ok(panelArea(q) > 100, `${W}x${H} ${name} has an area`);
        }
        for (let i = 0; i < names.length; i += 1) {
          for (let j = i + 1; j < names.length; j += 1) {
            assert.equal(overlap(L.panels[names[i]], L.panels[names[j]]), 0, `${W}x${H} winners ${winners}: ${names[i]} overlaps ${names[j]}`);
          }
        }
      }
    }
  }
});

test('the gutters are the page\'s own, wherever the cuts lean', () => {
  for (const [W, H] of WINDOWS) {
    const L = layoutResults(W, H, 3, 23);
    const names = Object.keys(L.panels);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const gap = gapBetween(L.panels[names[i]], L.panels[names[j]]);
        /* Neighbours are a gutter apart (a little less across a cut that leans, where the gutter is measured along the level and not square to the cut); panels that are not neighbours are further. */
        assert.ok(gap >= L.g * 0.93, `${W}x${H}: ${names[i]} and ${names[j]} are ${gap.toFixed(2)} apart and a gutter is ${L.g.toFixed(2)}`);
      }
    }
  }
});

test('the margin, gutter and border are the simulator\'s proportions of the short side', () => {
  const L = layoutResults(1600, 900, 1, 10);
  assert.equal(L.u, 9);
  assert.ok(Math.abs(L.m - 3.5 * 9) < 1e-9 && Math.abs(L.g - 2.2 * 9) < 1e-9 && Math.abs(L.b - 0.65 * 9) < 1e-9);
  const small = layoutResults(390, 844, 1, 10);
  assert.ok(small.m >= 10 && small.g >= 7 && small.b >= 2, 'with floors, so a phone\'s page still has furniture');
  assert.equal(small.u, U_FLOOR, 'and a unit that is not under a size type can be read at: a hundredth of 390 is under four pixels');
  const huge = layoutResults(3840, 2160, 1, 10);
  assert.equal(huge.u, 21.6, 'and no ceiling: 4K is the laptop page, bigger');
});

test('the big panel is the biggest and comes first: a window to the winner', () => {
  for (const [W, H] of WINDOWS) {
    for (const winners of [1, 2, 3]) {
      const L = layoutResults(W, H, winners, 23);
      const areas = Object.fromEntries(Object.entries(L.panels).map(([k, q]) => [k, panelArea(q)]));
      if (L.shape === 'spread') {
        for (const [k, a] of Object.entries(areas)) {
          assert.ok(areas.big >= a, `${W}x${H} winners ${winners}: ${k} is bigger than the big panel`);
        }
      } else {
        /* A strip scrolls, so a list of fifty names may run longer than the window onto the winner, but the window comes first. */
        const order = Object.entries(L.panels).sort((a, b) => a[1][0][1] - b[1][0][1]).map(([k]) => k);
        assert.equal(order[0], 'big', 'the strip opens with the big panel');
      }
    }
  }
});

test('landscape is a spread with leaning cuts and anything taller is a strip that scrolls', () => {
  assert.equal(layoutResults(1600, 900, 1, 10).shape, 'spread');
  assert.ok(layoutResults(1600, 900, 1, 10).lean > 0);
  assert.equal(layoutResults(1877, 1938, 1, 10).shape, 'spread', 'a nearly square 4K window is still a page');
  assert.equal(layoutResults(820, 1180, 1, 10).shape, 'strip');
  assert.equal(layoutResults(390, 844, 1, 10).shape, 'strip');
  const strip = layoutResults(390, 844, 3, 50);
  assert.ok(strip.height > 844, 'a strip with fifty names is taller than a phone');
  assert.equal(strip.lean, 0);
  assert.equal(layoutResults(1600, 900, 1, 10).height, 900);
});

test('a box round a quad, and the clip that cuts it back', () => {
  const box = boxOf([[10, 10], [110, 14], [104, 80], [6, 76]]);
  assert.deepEqual([box.x, box.y, box.w, box.h], [6, 10, 104, 70]);
  assert.match(box.clip, /^polygon\(4\.0px 0\.0px,104\.0px 4\.0px,98\.0px 70\.0px,0\.0px 66\.0px\)$/);
  assert.equal(box.lean.tl, 4);
  assert.equal(box.lean.tr, 0);
});
