/*
 * spray.js: where a sponsor's mark lies on the grass so that it looks, from
 * the camera that is looking, the way it was drawn.
 *
 * THE PROBLEM. A mark laid flat in its own shape is foreshortened by the sine
 * of the angle the camera looks down at it: a circle seen 15 degrees down is
 * a sliver a quarter as tall as it is wide. The first version of this app
 * corrected for that once, by stretching the picture along the line of sight
 * from the rail before it went into the track document (one over the sine of
 * 26.6 degrees, which is 2.24). That is right from the rail, abeam of the
 * track, and wrong from everywhere else: the paddock's orbit looks at the
 * marks from every side and from lower down, and the aerial looks along the
 * straight, so the stretch lay across the sight where it should have lain
 * along it and a circle came out a flat ellipse. The owner's words
 * (2026-10-04): "logos sprayed on the grass need to have their aspect ratio
 * preserved, currently they are squashed".
 *
 * THE ANSWER is the one a broadcaster uses for a virtual advertisement on a
 * pitch: do not paint the mark for one camera, project it from the camera
 * that is looking. Each frame the mark is held up as a rectangle in the
 * picture plane of the lens, in its own shape, at the distance of its spot,
 * and each point of it is carried along the line of sight to the grass. What
 * lands on the ground is a trapezoid, deeper than the mark is tall and wider
 * at the far end than at the near, and what the lens sees is the rectangle
 * again, exactly. A plane square to the optical axis maps onto the picture by
 * a scale, so the shape on the glass is the logo's own shape whatever the
 * angle, the distance or where in the frame the mark stands, and the top of
 * the picture is always the top of the glass.
 *
 * THE LEAST ANGLE. A mark far away and low down cannot be carried to the
 * grass at any size: its top edge would be at or over the horizon, and the
 * line of sight to it never meets the ground. So the top of the picture is
 * held at least MARK.minDepression degrees below the horizon, and a mark that
 * would break that is made smaller, all of it together, until it does not.
 * Its shape is kept and its size goes, to nothing as its spot goes down to
 * that angle. A real mark that far off is a few pixels either way.
 *
 * It is plain arithmetic on numbers, in Three's frame (y up) with the pitch
 * at y = 0, so tests/spray.test.js can fly the real cameras past it in Node
 * and measure what the glass would show. src/marks.js is the meshes.
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

import { toThree } from './frame.js';

export const MARK = Object.freeze({
  /*
   * The biggest a mark is, as it reads on the glass, in metres. 2.9 m is the
   * height of picture the rail has always been shown (the old box was 6.5 m
   * deep, stretched 2.24 times), and 10 m is the width of the strip of
   * infield they were fitted to. A mark takes the widest size in its own
   * shape that fits both.
   */
  maxWidth: 10,
  maxHeight: 2.9,
  /* How far inside the line the marks stand: the middle of the strip between the track's inner edge and the camera rail. */
  inset: 10,
  /* How far above the pitch's own surface the plane lies. The pitch is laid at 2 cm and the finish line at 4 cm (src/gantry.js). */
  lift: 0.03,
  /* Rows of the grid a mark is cut into. Within a row the picture is exact; between rows it is straight, and ten is far inside what an eye can see. */
  rows: 10,
  /* The shallowest angle below the horizon the top edge of a mark is carried to, in degrees. */
  minDepression: 3.5,
  /* A mark whose middle is nearer the lens than this, along the line of sight, is not drawn. */
  near: 0.5,
});

const TAN_MIN = Math.tan((MARK.minDepression * Math.PI) / 180);

/*
 * The size of a mark in metres, in its own shape: `aspect` is width over
 * height, and the answer is the largest of that shape that fits the box.
 */
export function markSize(aspect, maxWidth = MARK.maxWidth, maxHeight = MARK.maxHeight) {
  const width = Math.min(maxWidth, maxHeight * aspect);
  return { width, height: width / aspect };
}

/* Where the marks go along the line, in metres from the start line: both straights and the middle of each bend, six places the cameras see the infield from. */
export function markStations(course) {
  const g = course.geometry;
  const arc = g.radius * (Math.PI - g.spiral / g.radius);
  const bend = g.straight / 2 + g.spiral + arc / 2;
  const north = g.straight / 2 + 2 * g.spiral + arc + g.straight / 2;
  const bendTwo = g.straight / 2 + 2 * g.spiral + arc + g.straight + g.spiral + arc / 2;
  return [-g.straight / 4, g.straight / 4 + 4, bend, north - 14, north + 14, bendTwo];
}

/*
 * What goes where, for marks of the given shapes: a list with one entry to a
 * place, { x, z, design, width, height }. The place is on the infield side of
 * the line, in Three's frame; `design` is which of the marks stands there,
 * dealt round robin; the size is that mark's own. No marks, no places.
 */
export function markPlan(course, aspects) {
  if (!aspects.length) {
    return [];
  }
  const at = {};
  const p = {};
  return markStations(course).map((station, i) => {
    course.place(station, -MARK.inset, 0, at);
    toThree(at.x, at.y, 0, p);
    const design = i % aspects.length;
    const { width, height } = markSize(aspects[design]);
    return { x: p.x, z: p.z, design, width, height };
  });
}

/*
 * What never changes about the mesh a mark is drawn with: the coordinates of
 * the picture at each vertex and the triangles that join them. The grid has
 * rows + 1 rows of two vertices, near row first and left vertex first, so
 * vertex 2 r + side is at the picture's u = side and v = r / rows, v running
 * from the bottom of the picture to its top. The triangles face up, counter
 * clockwise seen from above, so the lens, which is above, sees their fronts.
 * tests/spray.test.js fly the cameras past exactly these arrays and check that
 * what the glass shows is the picture the right way round.
 */
export function markTopology(rows = MARK.rows) {
  const uv = new Float32Array((rows + 1) * 4);
  for (let r = 0; r <= rows; r += 1) {
    for (let side = 0; side < 2; side += 1) {
      uv[(r * 2 + side) * 2] = side;
      uv[(r * 2 + side) * 2 + 1] = r / rows;
    }
  }
  const index = new Uint16Array(rows * 6);
  for (let r = 0; r < rows; r += 1) {
    const a = r * 2;
    index.set([a, a + 1, a + 3, a, a + 3, a + 2], r * 6);
  }
  return { uv, index };
}

/*
 * Whether the top edge of a mark `k` times its size would land on the grass
 * far enough below the horizon, from `eye`. The two top corners are the
 * only ones that can fail: a corner lower in the picture is lower in the sky.
 */
function topLands(eye, right, up, mark, k) {
  const hw = (mark.width * k) / 2;
  const hh = (mark.height * k) / 2;
  for (const side of [-1, 1]) {
    const x = mark.x + right.x * side * hw + up.x * hh;
    const y = MARK.lift + right.y * side * hw + up.y * hh;
    const z = mark.z + right.z * side * hw + up.z * hh;
    const rise = eye.y - y;
    if (!(rise > 0) || rise < TAN_MIN * Math.hypot(x - eye.x, z - eye.z)) {
      return false;
    }
  }
  return true;
}

/*
 * Lay a mark on the grass for a lens.
 *
 *   out      a Float32Array or Array of (rows + 1) * 2 * 3 numbers: the grass points of
 *            each row of the grid, near row first, left then right, x y z
 *   eye      the lens, { x, y, z }, in the frame the marks are in (the pitch is y = 0)
 *   right    the lens's right, up and forward, as unit vectors { x, y, z }
 *   up
 *   forward
 *   mark     one entry of markPlan(): { x, z, width, height }
 *
 * Returns the fraction of the mark's size that was kept, 1 when nothing was
 * in the way and 0 when it is not drawn, either because the spot is behind
 * the lens or because the lens is not above it by the least angle.
 *
 * The rectangle is held square to the lens at the depth of the spot, centred
 * on the spot, which is on the grass: half of it is under the grass and is not
 * a thing, only the set of lines of sight the grass is read along. Each point
 * of it is carried from the eye through itself to the plane of the grass.
 */
export function sprayMark(out, eye, right, up, forward, mark, rows = MARK.rows) {
  const py = MARK.lift;
  const rise = eye.y - py;
  if (!(rise > 0)) {
    return 0;
  }
  const dx = mark.x - eye.x;
  const dz = mark.z - eye.z;
  if (dx * forward.x - rise * forward.y + dz * forward.z < MARK.near) {
    return 0;
  }
  if (!(rise > TAN_MIN * Math.hypot(dx, dz))) {
    return 0;
  }

  /* The kept fraction: all of it if the top lands, else the largest that does, found by halving. The set that lands is an interval from nothing up, so halving cannot miss it. */
  let k = 1;
  if (!topLands(eye, right, up, mark, 1)) {
    let kept = 0;
    let lost = 1;
    for (let i = 0; i < 16; i += 1) {
      const mid = (kept + lost) / 2;
      if (topLands(eye, right, up, mark, mid)) {
        kept = mid;
      } else {
        lost = mid;
      }
    }
    k = kept;
    if (!(k > 0)) {
      return 0;
    }
  }

  const hw = (mark.width * k) / 2;
  const hh = (mark.height * k) / 2;
  let o = 0;
  for (let r = 0; r <= rows; r += 1) {
    const s = -hh + (2 * hh * r) / rows;
    for (let side = -1; side <= 1; side += 2) {
      const x = mark.x + right.x * side * hw + up.x * s;
      const y = py + right.y * side * hw + up.y * s;
      const z = mark.z + right.z * side * hw + up.z * s;
      const down = eye.y - y;
      if (!(down > 1e-9)) {
        return 0;
      }
      const t = rise / down;
      out[o] = eye.x + (x - eye.x) * t;
      out[o + 1] = py;
      out[o + 2] = eye.z + (z - eye.z) * t;
      o += 3;
    }
  }
  return k;
}
