/*
 * course.js: the oval the quads race on, as geometry and nothing else.
 *
 * It owns where the racing line goes, how far round it is, where the grid is
 * and where the camera rail runs. It imports nothing and touches no page, so
 * src/choreo.js can plan a race over it in Node and tools/race-chart.html can
 * draw one. The track document handed to the simulator is built from these
 * numbers in src/world.js, so a gate position is never typed twice.
 *
 * THE FRAME. Metres, Z up, right handed, the oval centred on the origin with
 * its long axis along X. The quads race CLOCKWISE seen from above: the south
 * straight is flown westward, and the start and finish line crosses it in the
 * middle. Clockwise is chosen because the camera lives in the infield looking
 * outward: with the infield on the right of the direction of travel, the pack
 * crosses its screen from left to right all the way round, on the straights
 * and in the bends alike.
 *
 * THE LINE IS WHERE CURVATURE, AND ITS RATE OF CHANGE, ARE CONTINUOUS. Each
 * bend is a transition in, an arc, and a transition out, not a bare arc
 * meeting a straight. A straight running into an arc has a step in
 * curvature, so a quad on it would have a step in lateral acceleration, and a
 * quad's bank angle is derived from its acceleration: the aircraft would
 * snap to 60 degrees at the entry of every bend. With a transition the bank
 * rolls in over a second. The transition is a raised cosine in curvature and
 * not the textbook clothoid, whose curvature rises linearly: that has a
 * constant rate of change which switches on and off at each end, and a quad
 * flying the outside lane covers 1 - u kappa of path per metre of line, so
 * its speed changes at -u kappa' s'^2 and the switch is a step in its
 * tangential acceleration, 9.6 m/s^2 for a quad at 28 m/s in the outer lane,
 * which is a snap in pitch. A raised cosine has no switch, and turns the same
 * angle over the same length, so the lap is the same. The brief asks for a
 * plan that is smooth to second order, and this is where that starts.
 *
 * COORDINATES ALONG THE LINE. s is metres along the centre of the track from
 * the start and finish line, so s = 0 is the line, s < 0 is the grid behind
 * it on the straight, and the course repeats every `lap`. u is metres across
 * the track and is positive to the LEFT of the direction of travel, which for
 * a clockwise oval is OUTWARD: u < 0 is toward the infield. h is metres above
 * the ground. A point is c(s) + u N(s) + h Z.
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

/*
 * What was chosen, and why, because the brief says to write it down.
 *
 * It suggests straights of about 60 m, bends of about 32 m and a lap of about
 * 300 m, which do not agree with each other once the bends have a clothoid on
 * each end. These are 52 m straights, a 30 m arc and 14 m transitions, which
 * make a lap of 320.5 m: a lap time of 15 s at 21.4 m/s, so a 15, 30 and 60
 * second race is 1, 2 and 4 laps at a speed a five inch quad flies without
 * effort. The 30 m arc is as near the brief's 32 as the lap allows. The yaw
 * rate of a camera that follows the leader round it is v / 30 m: 41 degrees a
 * second at the 21 m/s a lap takes, under the brief's limit of 50.
 */
export const GEOMETRY = Object.freeze({
  straight: 52,
  radius: 30,
  spiral: 14,
  width: 12,
  /* The camera rail, metres inside the line, and how high it runs. */
  railInset: 20,
  railHeight: 5,
});

/*
 * The cross section the quads fly in: lanes across the track and levels up.
 * 9 lanes at 1.3 m and 4 levels at 0.9 m, so no two slots of the lattice are
 * closer than 0.9 m, which is almost twice the 0.5 m the brief asks of any
 * two quads at any moment. Level -1 is the foam on a start block.
 */
export const LATTICE = Object.freeze({
  lanes: 9,
  laneSpacing: 1.3,
  levels: 4,
  levelSpacing: 0.9,
  firstLevel: 1.3,
  blockHeight: 0.32,
});

/* The grid: rows behind the line, the front row 1.5 m back, rows 2.4 m apart. */
export const GRID = Object.freeze({ columns: 9, front: 1.5, rowPitch: 2.4 });

const STEP = 0.05;
const PI = Math.PI;

/*
 * cos(pi x) and sin(pi x) from their Taylor series in Horner form, a few ulps
 * from the true value and the same bits on every engine, which the engine's
 * own cosine is not required to be. The course is built from these, and so is
 * the plan in src/choreo.js, so that a replay of a receipt is the same race on
 * any machine.
 */
const COS_TERMS = [1, -1 / 2, 1 / 24, -1 / 720, 1 / 40320, -1 / 3628800, 1 / 479001600,
  -1 / 87178291200, 1 / 20922789888000, -1 / 6402373705728000, 1 / 2432902008176640000];

export function cosPi(x) {
  let a = Math.abs(x) % 2;
  if (a > 1) {
    a = 2 - a;
  }
  let sign = 1;
  if (a > 0.5) {
    a = 1 - a;
    sign = -1;
  }
  const y = a * PI;
  const t = y * y;
  let r = COS_TERMS[10];
  for (let k = 9; k >= 0; k -= 1) {
    r = COS_TERMS[k] + t * r;
  }
  return sign * r;
}

export const sinPi = (x) => cosPi(0.5 - x);

/*
 * Curvature as a list of segments. A line has none, an arc has all of it, and
 * a transition rises from none to all of it, or falls back, as a raised
 * cosine over its length. Every integral below is closed form, so the
 * heading is exact at every point and the loop closes to the rounding of the
 * position sums.
 */
function segmentsOf(g) {
  const k = -1 / g.radius;
  const turn = PI - g.spiral / g.radius;
  const bend = [
    { length: g.spiral, kind: 'in', k },
    { length: g.radius * turn, kind: 'arc', k },
    { length: g.spiral, kind: 'out', k },
  ];
  return [
    { length: g.straight / 2, kind: 'line', k: 0 },
    ...bend,
    { length: g.straight, kind: 'line', k: 0 },
    ...bend,
    { length: g.straight / 2, kind: 'line', k: 0 },
  ];
}

/* Curvature, its rate, and the heading turned so far, at distance l into a segment. */
function within(seg, l) {
  const x = l / seg.length;
  if (seg.kind === 'line') {
    return { kappa: 0, dkappa: 0, turned: 0 };
  }
  if (seg.kind === 'arc') {
    return { kappa: seg.k, dkappa: 0, turned: seg.k * l };
  }
  const rise = 0.5 - 0.5 * cosPi(x);
  const slope = (PI / (2 * seg.length)) * sinPi(x);
  const area = l / 2 - (seg.length * sinPi(x)) / (2 * PI);
  if (seg.kind === 'in') {
    return { kappa: seg.k * rise, dkappa: seg.k * slope, turned: seg.k * area };
  }
  return { kappa: seg.k * (1 - rise), dkappa: -seg.k * slope, turned: seg.k * (l - area) };
}

export function makeCourse(options = {}) {
  const g = { ...GEOMETRY, ...options };
  const segments = segmentsOf(g);
  const lap = segments.reduce((n, seg) => n + seg.length, 0);
  const count = Math.round(lap / STEP);
  const ds = lap / count;

  /* The heading at the start of each segment, which is the sum of the turns before it. */
  const starts = [];
  const headings = [];
  {
    let s = 0;
    let theta = PI;
    for (const seg of segments) {
      starts.push(s);
      headings.push(theta);
      s += seg.length;
      theta += within(seg, seg.length).turned;
    }
  }
  const stateAt = (s) => {
    let j = segments.length - 1;
    while (j > 0 && s < starts[j]) {
      j -= 1;
    }
    const w = within(segments[j], Math.min(Math.max(s - starts[j], 0), segments[j].length));
    return { theta: headings[j] + w.turned, kappa: w.kappa, dkappa: w.dkappa };
  };

  /* The table: where the line is every 5 cm, with the exact heading and curvature there. Simpson's rule over the exact heading. */
  const xs = new Float64Array(count + 1);
  const ys = new Float64Array(count + 1);
  const th = new Float64Array(count + 1);
  const tx = new Float64Array(count + 1);
  const ty = new Float64Array(count + 1);
  const ka = new Float64Array(count + 1);
  const kd = new Float64Array(count + 1);
  let x = 0;
  let y = 0;
  const cosOf = (a) => cosPi(a / PI);
  const sinOf = (a) => sinPi(a / PI);
  for (let i = 0; i <= count; i += 1) {
    const here = stateAt(i * ds);
    xs[i] = x;
    ys[i] = y;
    th[i] = here.theta;
    tx[i] = cosOf(here.theta);
    ty[i] = sinOf(here.theta);
    ka[i] = here.kappa;
    kd[i] = here.dkappa;
    if (i < count) {
      const mid = stateAt((i + 0.5) * ds).theta;
      const end = stateAt((i + 1) * ds).theta;
      x += (ds / 6) * (cosOf(here.theta) + 4 * cosOf(mid) + cosOf(end));
      y += (ds / 6) * (sinOf(here.theta) + 4 * sinOf(mid) + sinOf(end));
    }
  }
  /* Centre the oval on the origin: the north straight is as far north of the start line as the line is from the middle. */
  const north = ys[Math.round(count / 2)];
  for (let i = 0; i <= count; i += 1) {
    ys[i] -= north / 2;
  }
  const closure = Math.sqrt((xs[count] - xs[0]) ** 2 + (ys[count] - ys[0]) ** 2);

  const wrap = (s) => {
    const w = s % lap;
    return w < 0 ? w + lap : w;
  };

  /*
   * The centreline at s: position, heading as an angle and as the unit
   * tangent, curvature (negative in a right turn) and its rate of change,
   * written into `out`. Position is linear between table entries 5 cm apart,
   * which is 0.04 mm off the curve at the tightest point; the tangent and the
   * curvature are interpolated and so are continuous, and a quad's velocity
   * direction never jumps.
   */
  function at(s, out = {}) {
    const w = wrap(s);
    const f = w / ds;
    const i = Math.min(Math.floor(f), count - 1);
    const a = f - i;
    out.x = xs[i] + (xs[i + 1] - xs[i]) * a;
    out.y = ys[i] + (ys[i + 1] - ys[i]) * a;
    out.theta = th[i] + (th[i + 1] - th[i]) * a;
    const cx = tx[i] + (tx[i + 1] - tx[i]) * a;
    const cy = ty[i] + (ty[i + 1] - ty[i]) * a;
    const norm = Math.sqrt(cx * cx + cy * cy);
    out.tx = cx / norm;
    out.ty = cy / norm;
    out.kappa = ka[i] + (ka[i + 1] - ka[i]) * a;
    out.dkappa = kd[i] + (kd[i + 1] - kd[i]) * a;
    return out;
  }

  const lanes = LATTICE.lanes;
  const laneU = (a) => (a - (lanes - 1) / 2) * LATTICE.laneSpacing;
  const levelH = (b) => (b < 0 ? LATTICE.blockHeight : LATTICE.firstLevel + b * LATTICE.levelSpacing);

  /* A point of the cross section: where (s, u, h) is in the world, with the frame it sits in. */
  const scratch = {};
  function place(s, u, h, out = {}) {
    at(s, scratch);
    /* The left normal of the tangent (tx, ty) is (-ty, tx). */
    out.x = scratch.x - u * scratch.ty;
    out.y = scratch.y + u * scratch.tx;
    out.z = h;
    out.theta = scratch.theta;
    out.tx = scratch.tx;
    out.ty = scratch.ty;
    out.kappa = scratch.kappa;
    out.dkappa = scratch.dkappa;
    return out;
  }

  /*
   * The grid for `count` entries, in entry order: rows of 9 from the front,
   * the last row centred, entry 0 at the leftmost place seen from behind
   * the grid looking forward, so a person reads it left to right in the order
   * the names were typed. It is the entry order and never the drawn one.
   */
  function grid(n) {
    const rows = Math.ceil(n / GRID.columns);
    return Array.from({ length: n }, (_, entry) => {
      const row = Math.floor(entry / GRID.columns);
      const inRow = row < rows - 1 ? GRID.columns : n - GRID.columns * (rows - 1);
      const col = entry % GRID.columns;
      const first = Math.floor((lanes - inRow) / 2);
      const lane = first + (inRow - 1 - col);
      return { entry, row, col, lane, s0: -(GRID.front + row * GRID.rowPitch), u0: laneU(lane) };
    });
  }

  /* The camera rail: concentric with the line, inside it and above the ground. */
  const rail = (s, out = {}) => place(s, -g.railInset, g.railHeight, out);

  return Object.freeze({
    geometry: g,
    lap,
    closure,
    halfStraight: g.straight / 2,
    width: g.width,
    lanes,
    laneU,
    levels: LATTICE.levels,
    levelH,
    laneSpacing: LATTICE.laneSpacing,
    levelSpacing: LATTICE.levelSpacing,
    at,
    place,
    grid,
    rail,
    wrap,
    segments,
    table: Object.freeze({ xs, ys, th, count, ds }),
  });
}
