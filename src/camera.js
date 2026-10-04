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
 * THE SHOTS.
 *
 *   paddock    a slow orbit over the grid while names are typed, centred on
 *              the grid rather than on the oval: the simulator's own title
 *              orbit (map.attract) is framed from the layout's bounds, and
 *              for a 140 m oval that is a circle 80 m out, from which a quad
 *              on the grid is a speck and its tag unreadable.
 *   aerial     high over the field, then down to the rail, for the lights.
 *   rail       the race: side on from the infield, on a rail concentric with
 *              the line, following the leading group, leaving room ahead.
 *              It glides to a stop short of the line, turning to look at the
 *              line as it stops, so the pack crosses a still frame with the
 *              line in the middle of it and room after the line for the flip.
 *              At the finish the lens narrows on the winner, and on the first
 *              two quads in a photo finish.
 *   held       the rail's frame where it stops, as a fixed shot.
 *   hero       the winner, close: a moment after the line for the results
 *              page's big panel, and from just after the line to the results
 *              as the live cutaway for the flip.
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

/*
 * The rail's lens: 34 degrees high, wider at the start, where the grid and the
 * pack are both in the picture, with the camera aiming 4.5 m ahead of the pack
 * once the launch is over. It is the frame the rail was built with, and the
 * owner has said to keep it (2026-10-04: "just make the quads larger during
 * the race, don't zoom in to make the frame narrower"). It had been brought in
 * to 26 degrees, aiming 3 m ahead, to make the quads bigger on the glass, and
 * that is the zoom the owner did not want. The size is src/layout.js's
 * FLEET_SCALE now, which is 4.5, and the lens only has to show the race: the
 * leading quads are about 127 pixels across at 1080 lines (the brief asked for
 * 40, and at 48 a person watching found them hard to follow). MIN_HORIZONTAL
 * is what keeps a window that is not 16 by 9 from being shown less than the
 * frame, which is the owner's own window as much as a phone's.
 */
export const RAIL_FOV = 34;
export const OPEN_FOV = 46;
export const AERIAL_FOV = 54;

/*
 * The calm rail, for a person who has asked for less motion: wider, so the
 * pack has room, and slower, no more than 25 degrees a second where the race
 * rail may turn at 44. A camera that cannot turn as fast as the pack goes
 * round a bend would lose it, so it does not try: when the leader is further
 * than CALM_CUT of the way from the middle of the frame to its edge, the
 * camera is put where it would have been, in one cut, and is still. It aims
 * only 1.5 m ahead of the group, where the race rail aims 4.5, so the leader
 * starts near the middle and the room to lag in is most of the frame. The
 * frame is the one the window really has, so the table is made for an aspect.
 */
export const CALM_FOV = 56;
export const CALM_YAW = 25;
export const CALM_CUT = 0.8;
export const CALM_AHEAD = 1.5;

/* When in the lights' run the first amber lamp is lit, as a fraction of it, at the latest: the gantry is in frame from here to green. */
export const FIRST_LAMP_K = 0.385;

/*
 * THE FINISH FRAME. The rail parks 6 m short of the line, which keeps the
 * gantry's near upright off the crossing, but a camera that looks abeam of
 * where it has parked has the line at the right hand edge of its frame and
 * loses the winner between 0.1 and 0.35 s after the line, measured over
 * nine plans, in a flip that takes 0.9 s: nobody saw it until the results
 * page. So as the eye comes in to its stop the lens turns to look AT the line,
 * in one eased ramp over the last FINISH_EASE metres of the eye's run. The
 * calm rail does none of it: it is wide already, and a turn of the lens is a
 * glide.
 *
 * Once the winner has crossed, the lens opens to FINISH_FOV over FINISH_OPEN
 * seconds, so that the flip, which takes the winner 20 m past the line, stays
 * in the frame. Before that it is the race lens, and the line is in the middle
 * of the frame with the last 9 m of the approach in it.
 *
 * THE ZOOM. 37 per cent of the races this makes (check 8 of the plan's tests,
 * over 2,400 plans) have first and second under a quarter of a second apart
 * (PHOTO_CLOSE), and at the race lens they are two dots either side of a line.
 * So the lens narrows, and only as far as it can while the first two quads and
 * the line stay inside the frame, with every one of them no further out than
 * PHOTO_FIT of the way to its edge. How tight that is comes from where the two
 * are, not from a rule about gaps: with a tenth of a second between them it
 * goes down to PHOTO_FOV. A clear win zooms too, on the winner alone, because
 * the second is a long way behind and holding it would take a lens wider than
 * the race lens: the owner asked for the winner to be zoomed on, and there was
 * nothing to zoom on but a pair. It is a pure function of the plan and the
 * clock, smooth by construction (a soft maximum and a soft absolute value,
 * never a filter that remembers), and it opens again as the quads fly off past
 * the line.
 */
export const FINISH_EASE = 30;
export const FINISH_FOV = 40;
export const FINISH_OPEN = 0.4;
export const PHOTO_FOV = 14;
export const PHOTO_FIT = 0.8;
/* How close first and second are, in seconds, for the finish to be a photo finish: the lens fits both, and the beat and the longer slow part (src/show.js) are for it. */
export const PHOTO_CLOSE = 0.25;
/*
 * The window's minimum horizontal field in two other places, which are the
 * same 50 degrees the race lens has again: the finish frame needs the room for
 * the winner's flip, and the calm rail has always had it. The race rail works
 * its own minimum out, for the window it is asked about, and hands back the
 * lens that results (see rail), because a zoom on a narrow window is a zoom
 * from the lens that window is given, and not from the 34 degrees that would
 * be 19 across on a phone.
 */
export const FINISH_MIN_HORIZONTAL = 50;
export const CALM_MIN_HORIZONTAL = 50;
/* Half the span of a quad at the scale src/layout.js draws it, in metres (0.347 m across its props, times 4.5, halved, and a hair over). */
export const QUAD_HALF = 0.8;
/* Seconds before the winner crosses and after the second does that the fit is worked out in: outside them the pair are too far from the line to matter. */
const FIT_BEFORE = 1.5;
const FIT_AFTER = 1.5;

/*
 * The winner's picture: 3.6 m off and a little below, looking up, 30 degrees of
 * vertical field, so the quad, which is 1.56 m across its props, is most of the
 * panel's height and is against the trees and the sky and not the grass. The
 * distance goes with the fleet's scale (it was 2.4 m for a quad of 3.0). On the
 * rail's own lens it would be forty pixels in a panel five hundred high, and
 * the page is lettered round a picture of it, so it is brought in. The eye is
 * never lower than HERO_FLOOR above the ground, whatever level the quad is
 * flying at.
 *
 * It is also the live cutaway (winnerCut in src/show.js): the same camera,
 * following the winner through the flip, for a person who has not asked for
 * less motion. There the window is whatever shape it is, and the narrowest
 * horizontal field it may be given is HERO_MIN_HORIZONTAL, so a phone held
 * upright is shown a quad and not a tall strip of sky; the results page works
 * its own field out and does not use it.
 */
export const HERO_FOV = 30;
export const HERO_DISTANCE = 3.6;
export const HERO_RISE = -0.38;
export const HERO_FLOOR = 0.6;
export const HERO_MIN_HORIZONTAL = 30;

/*
 * How long after the winner crosses the picture is taken: a tenth of a second,
 * with the flip 4 degrees in, so the quad is the right way up and at the line.
 * It was 0.45, with the flip half way round, which is a quad upside down in
 * the one picture of the winner there is, and the owner said so.
 */
export const HERO_AFTER = 0.1;

const jerk = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (10 + x * (-15 + 6 * x));
};

/* Whether first and second cross within PHOTO_CLOSE of each other: the pair are fitted, and not the winner alone. */
const isPhoto = (plan) => plan.count > 1 && plan.finish[plan.order[1]] - plan.finish[plan.order[0]] < PHOTO_CLOSE;

/*
 * The narrowest horizontal field a window gets, in degrees, unless a shot
 * says otherwise (the zoom and the finish frame do). The race lens is
 * 34 degrees high, which is 57 across on a 16 by 9 window, so a window as
 * wide as that is not touched; it is for a narrower one, a window that is
 * nearly square or a phone held upright, where the lens chosen for a wide
 * frame would show a few metres of track. It was 44 for a while, to keep a
 * narrower lens from being widened on a 16 by 9 window, and a window that was
 * not 16 by 9 was shown less of the track than the original frame: the frame
 * is back at 50.
 */
export const MIN_HORIZONTAL = 50;

/*
 * A vertical field of view that keeps the horizontal one from going below
 * `minHorizontal` degrees on a narrow window, which is a phone held upright.
 */
export function fovFor(vertical, aspect, minHorizontal = MIN_HORIZONTAL) {
  const h = (Math.PI / 180) * minHorizontal;
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 0.2));
  return Math.max(vertical, (v * 180) / Math.PI);
}

export function makeShots({ course }) {
  const at = {};
  const ranking = new Array(50);

  /* How many rows a grid of n has. */
  const rowsOf = (n) => Math.max(1, Math.ceil(n / GRID.columns));

  /* A point of the cross section, written into out as a look at. `minH` is the narrowest horizontal field the window may be given: the frame's, unless the shot knows better. */
  const lookAt = (out, from, to, fov, minH = MIN_HORIZONTAL) => {
    out.x = from.x;
    out.y = from.y;
    out.z = from.z;
    out.tx = to.x;
    out.ty = to.y;
    out.tz = to.z;
    out.fov = fov;
    out.minH = minH;
    return out;
  };

  const eye = {};
  const aim = {};
  const fitPose = {};
  const needs = new Float64Array(4);

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

  /*
   * A stop that arrives: `a` until it is half `length` short of `b`, then an
   * ease on a raised cosine, and `b` itself once `a` is half `length` past it.
   * A soft minimum never gets to `b`, it stays short of it by k^2 / (4 (a - b)),
   * which is a metre for the rail's k of 5 as the pack crosses the line, and
   * that metre is the difference between the parked camera being 6 m from the
   * line and 7 (see CALM_EASE).
   */
  const stopAt = (a, b, length) => {
    const a0 = b - length / 2;
    if (a <= a0) {
      return a;
    }
    if (a >= b + length / 2) {
      return b;
    }
    const x = (a - a0) / length;
    return a0 + length * (x * 0.5 + sinPi(x) / (2 * Math.PI));
  };

  /* The soft absolute value: never below the real one, and smooth through zero. */
  const softAbs = (x) => Math.sqrt(x * x + 0.012 * 0.012);

  /* The soft maximum of the first n values: never below the real maximum, and over it by at most k ln n. */
  function softMax(values, n, k) {
    let top = -Infinity;
    for (let i = 0; i < n; i += 1) {
      top = Math.max(top, values[i]);
    }
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += Math.exp((values[i] - top) / k);
    }
    return top + k * Math.log(sum);
  }

  /* Where the rail stops, short of the line: the gantry's near upright stands at the line, and a camera abeam of it would film every finish through a post. */
  const STOP_SHORT = 6;
  /*
   * How long the calm rail's stop is, in metres of the pack's travel: it eases
   * to the stop over this, and is on it once the pack is half of it past. The
   * calm rail cannot turn to the line as the race rail does (that is a glide),
   * so the leader in the lane nearest the rail crosses the line 6 m ahead of a
   * camera that is abeam of the stop, which is 22 degrees from the middle of a
   * phone's frame, and the frame is 25 to its edge, if the camera is on the
   * stop. The soft stop it had left the camera a metre or two short of it, and
   * the leader crossed the line at 26 to 29 degrees, out of the frame for the
   * last few frames before the line, in about one calm race in twelve on a
   * phone (9 of 126 plans for the generator of the pack, 11 for the one before
   * it). The same lane put the leader out of the frame in the middle of a race
   * now and then, because the cut that is there to prevent it measured the
   * leader at the middle of the track and not in its lane. With both put right
   * the leader is in the frame in all of 126 plans, in both shapes of window,
   * for an ease of 6 and of 10 m, and 14 loses one frame.
   */
  const CALM_EASE = 10;
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
  /*
   * Where the rail aims relative to the group, in metres ahead of it: behind
   * it at the start, so the grid fills the left of the frame and the
   * gantry's near upright, which stands at the line, is well to the right of
   * the middle and not a pole through it, and 4.5 m ahead of it once the
   * launch is over, which is room for the pack to cross.
   */
  const AHEAD_START = -4;
  const AHEAD_RACE = 4.5;
  const MAX_YAW = (44 * Math.PI) / 180;
  const MAX_SPEED = 80;
  const CATCH_UP = 1.5;
  const TABLE_HZ = 60;
  const tables = new WeakMap();
  /* One table per window shape, in quarters of an aspect: the cuts depend on how wide the frame is. */
  const calmTables = new Map();
  const here = {};
  const calmEye = {};
  const calmAim = {};
  const calmLeader = {};
  const calmWhere = {};

  /*
   * Where the rail camera is abeam of, at every sixtieth of a second of a
   * plan: the pack's position, less whatever the turn limit made it give
   * back. It is worked out once per plan, from the plan alone, so the camera
   * is still a function of the plan and the clock and nothing else: a seek, a
   * pause and a replay all read the same table.
   *
   * The calm rail is the same table with a slower turn limit and cuts: the
   * entry where a cut happens is marked, and a reader does not interpolate
   * across it.
   */
  function railTable(plan, calm = false, aspect = 16 / 9) {
    const shape = Math.round(Math.min(2, Math.max(0.4, aspect)) * 4) / 4;
    if (calm && !calmTables.has(shape)) {
      calmTables.set(shape, new WeakMap());
    }
    const store = calm ? calmTables.get(shape) : tables;
    const known = store.get(plan);
    if (known) {
      return known;
    }
    const maxYaw = calm ? (CALM_YAW * Math.PI) / 180 : MAX_YAW;
    /* How far from the middle of this window's frame the leader may get: a share of the way to its edge. */
    const vertical = (fovFor(CALM_FOV, shape, CALM_MIN_HORIZONTAL) * Math.PI) / 180;
    const cutAt = CALM_CUT * Math.atan(Math.tan(vertical / 2) * shape);
    const stopS = plan.laps * course.lap - STOP_SHORT;
    const frames = Math.ceil(plan.duration * TABLE_HZ) + 2;
    const table = new Float64Array(frames);
    const cuts = new Uint8Array(frames);
    let camera = 0;
    let before = 0;
    for (let i = 0; i < frames; i += 1) {
      const time = i / TABLE_HZ;
      const open = 1 - jerk(time / 4);
      const ahead = calm ? CALM_AHEAD : AHEAD_START + (AHEAD_RACE - AHEAD_START) * (1 - open);
      const group = groupAt(plan, time) + ahead;
      const target = calm ? stopAt(group, stopS, CALM_EASE) : softMin(group, stopS, 5);
      if (i === 0) {
        camera = target;
      } else {
        course.at(camera, here);
        const curvature = Math.abs(here.kappa);
        const limit = curvature > 1e-6 ? Math.min(MAX_SPEED, maxYaw / curvature) : MAX_SPEED;
        const wanted = (target - before) * TABLE_HZ + CATCH_UP * (target - camera);
        camera += Math.max(0, Math.min(limit, wanted)) / TABLE_HZ;
        if (calm) {
          /*
           * The table leads its target by a step's travel while it moves, which
           * the soft stop hid under its own undershoot; the stop that arrives
           * shows it as up to a quarter of a metre past the stop, so the camera
           * is held to it.
           */
          camera = Math.min(camera, stopS);
          /*
           * Where the leader is in the frame this camera has: if it is nearly
           * out of it, cut. The leader is measured in its own lane, which the
           * plan knows: at the middle of the track a leader in the lane nearest
           * the rail, 5 m nearer, is a third further round than it looked, and
           * the cut came after it had left the frame.
           */
          plan.rank(time, ranking);
          plan.locate(ranking[0], time, calmWhere);
          course.rail(camera, calmEye);
          course.place(camera, 0, 1.4, calmAim);
          course.place(calmWhere.s, calmWhere.u, 1.4, calmLeader);
          const yaw = Math.atan2(calmAim.y - calmEye.y, calmAim.x - calmEye.x);
          const bearing = Math.atan2(calmLeader.y - calmEye.y, calmLeader.x - calmEye.x) - yaw;
          const wrapped = Math.atan2(Math.sin(bearing), Math.cos(bearing));
          /* A cut that would not move the camera, which is every frame after the camera has stopped and the pack has gone on past it, is not a cut. */
          if (Math.abs(wrapped) > cutAt && Math.abs(target - camera) > 1) {
            camera = target;
            cuts[i] = 1;
          }
        }
      }
      table[i] = camera;
      before = target;
    }
    const built = { table, cuts };
    store.set(plan, built);
    return built;
  }

  /* The rail's position at a clock, between two entries of the table, and not across a cut. */
  function railS(plan, t, calm = false, aspect = 16 / 9) {
    const { table, cuts } = railTable(plan, calm, aspect);
    const f = Math.min(Math.max(t, 0) * TABLE_HZ, table.length - 1.001);
    const i = Math.floor(f);
    if (cuts[i + 1]) {
      return table[i];
    }
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  }

  /* When the calm rail cuts, in seconds of race time. */
  function calmCuts(plan, aspect = 16 / 9) {
    const { cuts } = railTable(plan, true, aspect);
    const out = [];
    for (let i = 0; i < cuts.length; i += 1) {
      if (cuts[i]) {
        out.push(i / TABLE_HZ);
      }
    }
    return out;
  }

  /*
   * The vertical field, in degrees, that holds the quads being fitted in the
   * frame the eye and the aim give, each no further out than PHOTO_FIT of the
   * way to the edge, at this aspect: the first two in a photo finish and the
   * winner alone in a clear win. Half a quad's span is added to how far out
   * each one is, because the frame has to hold the whole of it. The two
   * numbers that would have a kink in them, how far out a quad is (an
   * absolute value, which turns at the middle of the frame) and which is the
   * greatest (a maximum) are made smooth: a soft absolute value and a soft
   * maximum, both of which are a little over the real thing, and so are on
   * the safe side.
   */
  function photoFit(plan, t, aspect) {
    const yaw = Math.atan2(aim.y - eye.y, aim.x - eye.x);
    const pitch = Math.atan2(aim.z - eye.z, Math.hypot(aim.x - eye.x, aim.y - eye.y));
    const quads = isPhoto(plan) ? 2 : 1;
    for (let p = 0; p < quads; p += 1) {
      plan.pose(plan.order[p], Math.min(t, plan.duration), fitPose);
      const dx = fitPose.x - eye.x;
      const dy = fitPose.y - eye.y;
      const flat = Math.hypot(dx, dy);
      const half = Math.atan2(QUAD_HALF, Math.hypot(flat, fitPose.z - eye.z));
      let bearing = Math.atan2(dy, dx) - yaw;
      bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
      const elevation = Math.atan2(fitPose.z - eye.z, flat) - pitch;
      needs[2 * p] = Math.tan(Math.min(1.4, softAbs(bearing) + half)) / aspect;
      needs[2 * p + 1] = Math.tan(Math.min(1.4, softAbs(elevation) + half));
    }
    const tangent = softMax(needs, 2 * quads, 0.012) / PHOTO_FIT;
    return (2 * Math.atan(tangent) * 180) / Math.PI;
  }

  /*
   * The rail's lens at race time t, under a cap of `cap` degrees, which is the
   * race lens until the winner has crossed and opens to the finish lens after
   * it, for the flip. Inside the cap the zoom narrows the lens as far as
   * photoFit says it can, and no further than PHOTO_FOV, and only as the aim
   * comes round to the line: while the camera is still following the pack the
   * quads are in the middle of the frame, and a lens that fitted them there
   * would pump out again as the aim swung. Well before they reach the line,
   * and well after they have gone, the fit is far wider than the cap and there
   * is nothing to work out. The window runs to FIT_AFTER past the runner up
   * in a photo finish and past the winner in a clear win, who is the only one
   * fitted.
   */
  function railLens(plan, t, cap, aspect, turn) {
    const crossed = plan.finish[plan.order[0]];
    const second = plan.count > 1 ? plan.finish[plan.order[1]] : crossed;
    const gate = jerk((turn - 0.6) / 0.4);
    const last = isPhoto(plan) ? second : crossed;
    if (gate <= 0 || t < crossed - FIT_BEFORE || t > last + FIT_AFTER) {
      return cap;
    }
    const fit = photoFit(plan, t, aspect);
    const tight = 0.5 * (fit + PHOTO_FOV + Math.sqrt((fit - PHOTO_FOV) * (fit - PHOTO_FOV) + 4));
    return cap + (softMin(tight, cap, 1.5) - cap) * gate;
  }

  /*
   * The rail at race time t. It follows the leading group, with room ahead of
   * the leader, no faster round a bend than the turn limit allows, and glides
   * to a stop short of the finish line so the pack crosses a still frame.
   * Everything is in the same unwrapped metres the plan's progress is in.
   */
  function rail(plan, t, out = {}, calm = false, aspect = 16 / 9) {
    const clock = Math.max(0, t);
    const open = 1 - jerk(clock / 4);
    const aimS = railS(plan, clock, calm, aspect);
    /* How far into the finish frame the eye is: 0 until it is within FINISH_EASE of its stop, 1 at it. */
    const turn = calm ? 0 : jerk(1 - (plan.laps * course.lap - STOP_SHORT - aimS) / FINISH_EASE);
    course.rail(aimS, eye);
    course.place(aimS + STOP_SHORT * turn, 0, 1.4, aim);
    if (calm) {
      return lookAt(out, eye, aim, CALM_FOV, CALM_MIN_HORIZONTAL);
    }
    /*
     * The lens this window is given, which is the window's own minimum
     * horizontal field applied here and not by the world, so that a zoom is a
     * glide down from the lens a narrow window really has. The cap opens from
     * the race lens to the finish lens once the winner has crossed, and the
     * window's minimum opens with it.
     */
    const race = fovFor(RAIL_FOV + (OPEN_FOV - RAIL_FOV) * open, aspect, MIN_HORIZONTAL);
    const finish = fovFor(FINISH_FOV, aspect, FINISH_MIN_HORIZONTAL);
    const cap = race + (finish - race) * jerk((clock - plan.finish[plan.order[0]]) / FINISH_OPEN);
    return lookAt(out, eye, aim, railLens(plan, clock, cap, aspect, turn), 0);
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
   *
   * THE EYE ORBITS THE LINE. Its place is worked out as a bearing and a
   * range from the point the rail first looks at, which is where the lamps
   * are, with the bearing swung the short way round from behind the grid to
   * the rail and the range shrinking by a fixed fraction a second. Two
   * earlier versions did it with straight lines, and both turned too fast
   * where the eye went by the line: a straight path past a point at 20 m
   * turns the camera at the path's speed over its distance, which was 67
   * degrees a second at the end, and an angle that is interpolated between
   * two ends loses the thing looked at in the middle. On an orbit the turn
   * IS the swing of the bearing, which is 90 degrees eased over the run:
   * about 34 degrees a second at its fastest over five seconds.
   *
   * THE LOOK is the middle of the oval at first, so the whole of it and the
   * boards round it are in the frame, and the line by the time the first
   * lamp is lit, so that for the lamps, which are the point of the shot, the
   * gantry is in the frame the whole way down.
   */
  const LOOK_BY = 0.38;
  const LOOK_X = 0;
  const LOOK_Y = -8;
  function aerial(k, plan, out = {}) {
    const e = jerk(k);
    const first = rail(plan, 0, {});
    course.place(0, 0, 0, at);
    /* Back along the straight from the line, which is the way the grid lies, well up and a little to the south. */
    const backX = at.x - at.tx * 118;
    const backY = at.y - at.ty * 118 - 14;
    const backZ = 95;
    const dx0 = backX - first.tx;
    const dy0 = backY - first.ty;
    const dx1 = first.x - first.tx;
    const dy1 = first.y - first.ty;
    const r0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
    const r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const a0 = Math.atan2(dy0, dx0);
    let swing = Math.atan2(dy1, dx1) - a0;
    while (swing > Math.PI) {
      swing -= 2 * Math.PI;
    }
    while (swing < -Math.PI) {
      swing += 2 * Math.PI;
    }
    const bearing = a0 + swing * e;
    const range = r0 * Math.pow(r1 / r0, e);
    eye.x = first.tx + range * cosPi(bearing / Math.PI);
    eye.y = first.ty + range * sinPi(bearing / Math.PI);
    eye.z = backZ + (first.z - backZ) * e;
    const w = jerk(Math.min(1, k / LOOK_BY));
    aim.x = LOOK_X + (first.tx - LOOK_X) * w;
    aim.y = LOOK_Y + (first.ty - LOOK_Y) * w;
    aim.z = first.tz * w;
    return lookAt(out, eye, aim, AERIAL_FOV + (first.fov - AERIAL_FOV) * e);
  }

  /* The held frame, where the rail parks: looking at the line, on the finish lens, so the winner has room to flip. */
  function held(plan, out = {}) {
    const stopS = plan.laps * course.lap - STOP_SHORT;
    course.rail(stopS, eye);
    course.place(stopS + STOP_SHORT, 0, 1.4, aim);
    return lookAt(out, eye, aim, FINISH_FOV, FINISH_MIN_HORIZONTAL);
  }

  /*
   * The winner's picture, for the results page: a camera on the infield side
   * of the winner, abeam of it, a few metres off and a little above, looking
   * at it. It is aimed AT the winner, exactly, because the results page puts
   * the winner where it wants it in the window with a view offset, and an
   * offset is worked out from where the aim is. `fov` is the vertical field
   * the panel is to cover; the page widens it for the rest of the window.
   *
   * It is a pure function of the plan and the time, like every other shot, so
   * a replay of the same receipt makes the same picture.
   */
  const pose = {};
  const railEye = {};
  function hero(plan, t, out = {}) {
    const winner = plan.order[0];
    plan.pose(winner, Math.min(t, plan.duration), pose);
    course.rail(pose.s, railEye);
    let dx = railEye.x - pose.x;
    let dy = railEye.y - pose.y;
    const flat = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= flat;
    dy /= flat;
    eye.x = pose.x + dx * HERO_DISTANCE;
    eye.y = pose.y + dy * HERO_DISTANCE;
    eye.z = Math.max(HERO_FLOOR, pose.z + HERO_RISE);
    aim.x = pose.x;
    aim.y = pose.y;
    aim.z = pose.z;
    return lookAt(out, eye, aim, HERO_FOV, HERO_MIN_HORIZONTAL);
  }

  return {
    paddock, aerial, rail, held, hero, groupAt, railS, calmCuts, fovFor, stopShort: STOP_SHORT,
  };
}
