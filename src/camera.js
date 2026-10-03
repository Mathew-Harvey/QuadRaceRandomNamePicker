/*
 * camera.js: the shots, as pure functions.
 *
 * Every shot is a pure function of the plan and the race clock, in the plan's
 * frame (metres, Z up): where the camera is and what it looks at. Nothing is
 * smoothed by a filter that remembers the last frame, so a dropped frame, a
 * pause, a replay and a seek all show the shot the clock says, and a camera
 * that follows the leader cannot disagree with itself about where the leader
 * is. Where a shot needs to be smooth it is smooth by construction, an
 * average of the plan over a short window, not a lag.
 *
 * THE FIVE SHOTS.
 *
 *   paddock    a slow orbit over the grid while names are typed, centred on
 *              the grid rather than on the oval: the simulator's own title
 *              orbit (map.attract) is framed from the layout's bounds, and
 *              for a 140 m oval that is a circle 80 m out, from which a quad
 *              on the grid is a speck and its tag unreadable.
 *   aerial     high over the field, then down to the rail, for the lights.
 *   rail       the race: side on from the infield, on a rail concentric with
 *              the line, following the leading group, leaving room ahead.
 *   finish     the rail camera glides to a stop square to the line, so the
 *              pack crosses a still frame.
 *   held       the frame of the winner at the line, for the results page.
 *
 * THE RAIL. It is 20 m inside the line and 5 m up. The pack crosses its frame
 * left to right all the way round because the quads race clockwise and the
 * camera is on the inside of the turn looking out, so the infield is always
 * on its side of the pack. The camera never crosses the line: it is abeam of
 * a point that is never past the finish. In the bends the rail is a circle a
 * third of the line's radius, so the camera turns at the pack's own rate, 41
 * degrees a second at a lap time of 15 s, which is under the 50 the brief
 * allows, and no filter is needed to keep it there.
 *
 * This file imports only src/course.js, so it runs in Node, where
 * tests/camera.test.js holds the yaw rate, the framing and the line.
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

import { GRID, cosPi, sinPi } from './course.js';

/* The rail's lens: tight enough that the leading quads are 40 pixels across at 1080 lines, wider at the start. */
export const RAIL_FOV = 34;
export const OPEN_FOV = 46;
export const AERIAL_FOV = 54;

const jerk = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (10 + x * (-15 + 6 * x));
};

/*
 * A vertical field of view that keeps the horizontal one from going below
 * `minHorizontal` degrees on a narrow window, which is a phone held upright:
 * the lens is chosen for a 16 by 9 frame, and on a 9 by 16 one it would show
 * seven metres of track.
 */
export function fovFor(vertical, aspect, minHorizontal = 50) {
  const h = (Math.PI / 180) * minHorizontal;
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 0.2));
  return Math.max(vertical, (v * 180) / Math.PI);
}

export function makeShots({ course }) {
  const at = {};
  const ranking = new Array(50);

  /* How many rows a grid of n has. */
  const rowsOf = (n) => Math.max(1, Math.ceil(n / GRID.columns));

  /* A point of the cross section, written into out as a look at. */
  const lookAt = (out, from, to, fov) => {
    out.x = from.x;
    out.y = from.y;
    out.z = from.z;
    out.tx = to.x;
    out.ty = to.y;
    out.tz = to.z;
    out.fov = fov;
    return out;
  };

  const eye = {};
  const aim = {};

  /* The grid's own middle, so the orbit frames the quads and not the field. */
  function paddock(t, n, out = {}) {
    const rows = rowsOf(n);
    const sCentre = -(GRID.front + ((rows - 1) * GRID.rowPitch) / 2);
    course.place(sCentre, 0, 0, at);
    const cx = at.x;
    const cy = at.y;
    const radius = 7.5 + 2.8 * rows;
    const height = 3.5 + 1.1 * rows;
    /* One turn in about 100 seconds, begun behind the grid looking forward. */
    const turns = t / 100;
    const a = at.theta + Math.PI + 2 * Math.PI * turns;
    eye.x = cx + radius * cosPi(a / Math.PI);
    eye.y = cy + radius * sinPi(a / Math.PI);
    eye.z = height;
    aim.x = cx;
    aim.y = cy;
    aim.z = 0.7;
    return lookAt(out, eye, aim, 42);
  }

  /*
   * Where the pack is, for the rail to follow: three parts leader to one part
   * the mean of the leading five, averaged over a fifth of a second either
   * side so a
   * lead change, which makes the leader's identity jump but never its
   * progress, cannot put a kink in the camera's speed.
   */
  function groupAt(plan, t) {
    const n = plan.count;
    const k = Math.min(5, n);
    let sum = 0;
    for (let j = -2; j <= 2; j += 1) {
      const u = Math.max(0, t + j * 0.1);
      plan.rank(u, ranking);
      let top = 0;
      let mean = 0;
      for (let p = 0; p < k; p += 1) {
        const s = plan.curves[ranking[p]].s(u);
        if (p === 0) {
          top = s;
        }
        mean += s / k;
      }
      sum += 0.75 * top + 0.25 * mean;
    }
    return sum / 5;
  }

  /* The soft minimum of two numbers: the lower, rounded off over about `k` metres, so a stop is a glide. */
  const softMin = (a, b, k) => 0.5 * (a + b - Math.sqrt((a - b) * (a - b) + k * k));

  /* Where the rail stops, short of the line: the gantry's near upright stands at the line, and a camera abeam of it would film every finish through a post. */
  const STOP_SHORT = 6;
  /*
   * The most the rail camera turns, in radians a second: 44 degrees, a little
   * under the brief's 50. In a bend a camera that stays abeam of the pack
   * turns at the pack's own rate, which is its speed over the bend's radius,
   * and a quad at 28 m/s on a 30 m radius is 53 degrees a second. So the
   * camera is not allowed to go round a bend faster than 44 degrees a second
   * allows (23 m/s on this radius), and falls a few metres behind the pack
   * for the length of the fastest stretch, which is a few degrees of the
   * 57 the frame is wide, and catches up on the next straight.
   */
  const MAX_YAW = (44 * Math.PI) / 180;
  const MAX_SPEED = 80;
  const CATCH_UP = 1.5;
  const TABLE_HZ = 60;
  const tables = new WeakMap();
  const here = {};

  /*
   * Where the rail camera is abeam of, at every sixtieth of a second of a
   * plan: the pack's position, less whatever the turn limit made it give
   * back. It is worked out once per plan, from the plan alone, so the camera
   * is still a function of the plan and the clock and nothing else: a seek, a
   * pause and a replay all read the same table.
   */
  function railTable(plan) {
    const known = tables.get(plan);
    if (known) {
      return known;
    }
    const stopS = plan.laps * course.lap - STOP_SHORT;
    const frames = Math.ceil(plan.duration * TABLE_HZ) + 2;
    const table = new Float64Array(frames);
    let camera = 0;
    let before = 0;
    for (let i = 0; i < frames; i += 1) {
      const time = i / TABLE_HZ;
      const open = 1 - jerk(time / 4);
      const ahead = 1 + 3.5 * (1 - open);
      const target = softMin(groupAt(plan, time) + ahead, stopS, 5);
      if (i === 0) {
        camera = target;
      } else {
        course.at(camera, here);
        const curvature = Math.abs(here.kappa);
        const limit = curvature > 1e-6 ? Math.min(MAX_SPEED, MAX_YAW / curvature) : MAX_SPEED;
        const wanted = (target - before) * TABLE_HZ + CATCH_UP * (target - camera);
        camera += Math.max(0, Math.min(limit, wanted)) / TABLE_HZ;
      }
      table[i] = camera;
      before = target;
    }
    tables.set(plan, table);
    return table;
  }

  /* The rail's position at a clock, between two entries of the table. */
  function railS(plan, t) {
    const table = railTable(plan);
    const f = Math.min(Math.max(t, 0) * TABLE_HZ, table.length - 1.001);
    const i = Math.floor(f);
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  }

  /*
   * The rail at race time t. It follows the leading group, with room ahead of
   * the leader, no faster round a bend than the turn limit allows, and glides
   * to a stop short of the finish line so the pack crosses a still frame.
   * Everything is in the same unwrapped metres the plan's progress is in.
   */
  function rail(plan, t, out = {}) {
    const clock = Math.max(0, t);
    const open = 1 - jerk(clock / 4);
    const aimS = railS(plan, clock);
    course.rail(aimS, eye);
    course.place(aimS, 0, 1.4, aim);
    const fov = RAIL_FOV + (OPEN_FOV - RAIL_FOV) * open;
    return lookAt(out, eye, aim, fov);
  }

  /*
   * The lights: from high behind the grid, looking down the start straight
   * and across the oval, to the rail's first frame. `k` runs from 0 to 1 and
   * is eased, so the camera comes down slowly at first and settles. The two
   * ends are exact: k = 1 is the rail at race time zero, so by green the
   * camera is where the race begins.
   *
   * It starts behind the grid, not beside it, because that is where the
   * gantry's lamps face: the three amber and the green are read from the
   * grid's end of the straight, and the descent keeps them in view until it
   * has swung round to the rail.
   */
  function aerial(k, plan, out = {}) {
    const e = jerk(k);
    const first = rail(plan, 0, {});
    course.place(0, 0, 0, at);
    /* Back along the straight from the line, which is the way the grid lies, well up and a little to the south. */
    const backX = at.x - at.tx * 118;
    const backY = at.y - at.ty * 118 - 14;
    const backZ = 95;
    /* Looking at the middle of the oval, so the whole of it and the boards round it are in the frame. */
    const lookX = 0;
    const lookY = -8;
    /*
     * The eye goes in a straight line, and the look is turned by angle, not
     * by sliding its target: two points sliding past each other swing the
     * bearing between them quickest just where they meet, and the descent
     * turned 82 degrees a second at its end. Turned by angle, through the
     * shorter way round, with the pitch and the distance eased the same, the
     * swing is the easing's own: about 40 degrees a second at its peak.
     */
    const yaw0 = Math.atan2(lookY - backY, lookX - backX);
    const yaw1 = Math.atan2(first.ty - first.y, first.tx - first.x);
    const pitch0 = Math.atan2(backZ, Math.hypot(lookX - backX, lookY - backY));
    const pitch1 = Math.atan2(first.z - first.tz, Math.hypot(first.tx - first.x, first.ty - first.y));
    const reach0 = Math.hypot(lookX - backX, lookY - backY, backZ);
    const reach1 = Math.hypot(first.tx - first.x, first.ty - first.y, first.tz - first.z);
    let turn = yaw1 - yaw0;
    while (turn > Math.PI) {
      turn -= 2 * Math.PI;
    }
    while (turn < -Math.PI) {
      turn += 2 * Math.PI;
    }
    const yaw = yaw0 + turn * e;
    const pitch = pitch0 + (pitch1 - pitch0) * e;
    const reach = reach0 + (reach1 - reach0) * e;
    eye.x = backX + (first.x - backX) * e;
    eye.y = backY + (first.y - backY) * e;
    eye.z = backZ + (first.z - backZ) * e;
    const flat = reach * Math.cos(pitch);
    aim.x = eye.x + flat * Math.cos(yaw);
    aim.y = eye.y + flat * Math.sin(yaw);
    aim.z = eye.z - reach * Math.sin(pitch);
    return lookAt(out, eye, aim, AERIAL_FOV + (first.fov - AERIAL_FOV) * e);
  }

  /* The held frame, where the rail stops: a shade wider than the race, so the pack has room to cross it. */
  function held(plan, out = {}) {
    const stopS = plan.laps * course.lap - STOP_SHORT;
    course.rail(stopS, eye);
    course.place(stopS, 0, 1.4, aim);
    return lookAt(out, eye, aim, RAIL_FOV + 4);
  }

  return { paddock, aerial, rail, held, groupAt, railS, fovFor, stopShort: STOP_SHORT };
}
