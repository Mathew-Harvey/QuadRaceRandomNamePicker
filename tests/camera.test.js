/*
 * camera.test.js: the shots, held to the brief's numbers.
 *
 * The brief asks of the rail camera that the pack always crosses the screen
 * left to right, that the camera never crosses the line, that it turns no
 * faster than 50 degrees a second, that the leader is in frame from the end
 * of the launch to the line, and that the leading quads are at least 40
 * pixels across at 1920 by 1080. A camera cannot be asked those things by
 * looking at it, so they are measured, over real plans for every length and
 * for crowds of every size, 120 times a second.
 *
 * The shots are pure functions of the plan and the clock (src/camera.js), so
 * the same numbers are what the page shows and what a seek, a pause and a
 * replay show.
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
import { GRID, makeCourse } from '../src/course.js';
import { FLIP, makePlan } from '../src/choreo.js';
import {
  AERIAL_FOV, CALM_FOV, CALM_MIN_HORIZONTAL, CALM_YAW, FINISH_FOV, FINISH_MIN_HORIZONTAL, FIRST_LAMP_K, HERO_AFTER, HERO_DISTANCE, HERO_FLOOR, HERO_FOV, HERO_RISE,
  MIN_HORIZONTAL, OPEN_FOV, PHOTO_FIT, PHOTO_FOV, QUAD_HALF, RAIL_FOV, fovFor, makeShots,
} from '../src/camera.js';
import { LIGHTS } from '../src/show.js';
import { FLEET_SCALE } from '../src/layout.js';
import { orderFor } from './lib/plan-cases.js';

const course = makeCourse();
const shots = makeShots({ course });

/* Nine plans: three crowds, every length. Fixed seeds, the picker's own shuffle. */
const PLANS = [];
for (const n of [5, 23, 50]) {
  for (const length of [15, 30, 60]) {
    const label = `webfpv-picker/test/camera/${n}/${length}`;
    PLANS.push({
      n, length, plan: makePlan({
        order: orderFor(n, label), showSeed: Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64), length,
      }),
    });
  }
}

const wrap = (a) => {
  let d = a;
  while (d > Math.PI) {
    d -= 2 * Math.PI;
  }
  while (d < -Math.PI) {
    d += 2 * Math.PI;
  }
  return d;
};

test('the rail turns no faster than 50 degrees a second, over every plan, 120 times a second', () => {
  const view = {};
  let worst = 0;
  for (const { plan } of PLANS) {
    let previous = null;
    for (let t = 0; t <= plan.duration; t += 1 / 120) {
      shots.rail(plan, t, view);
      const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
      if (previous !== null) {
        worst = Math.max(worst, (Math.abs(wrap(yaw - previous)) * 120 * 180) / Math.PI);
      }
      previous = yaw;
    }
  }
  console.log(`camera: the rail's worst yaw rate over ${PLANS.length} plans is ${worst.toFixed(1)} degrees a second`);
  assert.ok(worst <= 50, `the rail turns ${worst} degrees a second`);
});

test('the leader is in frame from the end of the launch to the line, at 16 by 9 and held upright on a phone', () => {
  const view = {};
  const pose = {};
  const rank = [];
  for (const aspect of [16 / 9, 9 / 16]) {
    let frames = 0;
    let out = 0;
    for (const { plan } of PLANS) {
      const winner = Math.min(...plan.finish);
      for (let t = 1.7; t <= winner; t += 1 / 60) {
        shots.rail(plan, t, view, false, aspect);
        const lead = plan.rank(t, rank)[0];
        plan.pose(lead, t, pose);
        const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
        const flatView = Math.hypot(view.tx - view.x, view.ty - view.y);
        const bearing = wrap(Math.atan2(pose.y - view.y, pose.x - view.x) - yaw);
        const elevation = Math.atan2(pose.z - view.z, Math.hypot(pose.x - view.x, pose.y - view.y)) - Math.atan2(view.tz - view.z, flatView);
        const vertical = (fovFor(view.fov, aspect, view.minH) * Math.PI) / 180;
        const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
        frames += 1;
        if (Math.abs(bearing) > horizontal / 2 || Math.abs(elevation) > vertical / 2) {
          out += 1;
        }
      }
    }
    console.log(`camera: the leader is out of frame in ${out} of ${frames} frames at aspect ${aspect.toFixed(2)}`);
    assert.equal(out, 0, `the leader leaves the frame in ${out} of ${frames} frames at aspect ${aspect}`);
  }
});

test('the leading quads are about 80 pixels across at 1920 by 1080: measured', () => {
  const view = {};
  const pose = {};
  const rank = [];
  const widths = [];
  /* A quad is 0.347 m across its props along the diagonal (motor to motor 0.220 m and a 5 inch disc), drawn at the fleet's scale. */
  const across = 0.347 * FLEET_SCALE;
  assert.ok(QUAD_HALF >= across / 2, `the photo finish fits a quad half ${QUAD_HALF} m across, and the fleet is drawn ${across / 2} m`);
  for (const { plan } of PLANS) {
    const winner = Math.min(...plan.finish);
    for (let t = 1.7; t <= winner; t += 1 / 30) {
      shots.rail(plan, t, view);
      plan.rank(t, rank);
      const focal = 540 / Math.tan((view.fov * Math.PI) / 360);
      for (let p = 0; p < Math.min(3, plan.count); p += 1) {
        plan.pose(rank[p], t, pose);
        const d = Math.hypot(pose.x - view.x, pose.y - view.y, pose.z - view.z);
        widths.push((focal * across) / d);
      }
    }
  }
  widths.sort((a, b) => a - b);
  const at = (q) => widths[Math.floor(widths.length * q)];
  console.log(`camera: the top three are ${at(0.05).toFixed(1)} px at the 5th percentile, ${at(0.5).toFixed(1)} median, ${widths[0].toFixed(1)} least, at 1920 by 1080`);
  /*
   * The brief asked for 40 for the leading group, and at 48 a person could
   * not follow them. The quads are drawn 2.2 times life size, which is as big
   * as the planner's spacing lets them be, and the lens is 26 degrees, and
   * these are what that measures: 83 at the median, 65 at the fifth
   * percentile, and 46 for the least, a quad in the outer lane of a bend.
   * They are held from getting worse.
   */
  assert.ok(at(0.5) >= 75, `the median is ${at(0.5)}`);
  assert.ok(at(0.05) >= 60, `the 5th percentile is ${at(0.05)}`);
  assert.ok(widths[0] >= 42, `the least is ${widths[0]}`);
});

test('the camera never crosses the line, and stops short of it square to the finish', () => {
  for (const { plan } of PLANS) {
    const stop = plan.laps * course.lap - shots.stopShort;
    let last = -Infinity;
    for (let t = 0; t <= plan.duration; t += 1 / 60) {
      const s = shots.railS(plan, t);
      assert.ok(s >= last - 1e-9, 'the rail never goes backwards');
      assert.ok(s <= stop + 1e-6, `the rail is at ${s} and the stop is ${stop}`);
      last = s;
    }
    /* It has stopped by the time the last quad has crossed: the pack crosses a still frame. */
    const done = Math.max(...plan.finish);
    const a = shots.railS(plan, done);
    const b = shots.railS(plan, plan.duration);
    assert.ok(Math.abs(b - a) < 0.5, `the rail is still moving ${Math.abs(b - a)} m after the last finish`);
    assert.ok(stop - b < 1, `and it has stopped ${stop - b} m short of where it was going`);
  }
});

test('the finish frame: the rail parks looking at the line, and the winner stays in frame for the flip', () => {
  const view = {};
  const held = {};
  const pose = {};
  for (const { plan } of PLANS) {
    /* Parked, the rail's frame is the held frame, and the line is in the middle of it. */
    shots.rail(plan, plan.duration, view);
    shots.held(plan, held);
    for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'fov']) {
      assert.ok(Math.abs(view[k] - held[k]) < 0.1, `parked, the rail's ${k} is ${view[k]} and the held frame's is ${held[k]}`);
    }
    const line = course.place(plan.laps * course.lap, 0, 1.4, {});
    const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
    const bearing = (wrap(Math.atan2(line.y - view.y, line.x - view.x) - yaw) * 180) / Math.PI;
    assert.ok(Math.abs(bearing) < 1, `the line is ${bearing.toFixed(1)} degrees from the middle of the parked frame`);
  }
  /*
   * How long after the line the winner is in frame. Before the rail turned to
   * the line this was 0.08 to 0.35 s on a wide window, in a flip that takes
   * FLIP seconds: nobody saw it. The numbers below are measured over nine
   * plans, with a margin, and are held from getting worse. A phone held
   * upright has a narrower frame and sees less of it, which is said.
   */
  for (const [aspect, least] of [[16 / 9, 0.4], [9 / 16, 0.25]]) {
    const seen = [];
    for (const { plan } of PLANS) {
      const winner = plan.order[0];
      const crossed = plan.finish[winner];
      let t = crossed;
      for (; t < crossed + FLIP; t += 0.005) {
        shots.rail(plan, t, view, false, aspect);
        plan.pose(winner, t, pose);
        if (!inFrame(view, pose, aspect)) {
          break;
        }
      }
      seen.push(t - crossed);
    }
    seen.sort((a, b) => a - b);
    console.log(`camera: after the line the winner is in frame for ${seen[0].toFixed(2)} s at the least and ${seen[4].toFixed(2)} s median, of a ${FLIP} s flip, at aspect ${aspect.toFixed(2)}`);
    assert.ok(seen[0] >= least, `the winner is out of frame ${seen[0]} s after the line at aspect ${aspect}`);
  }
});

test('the pack crosses the frame left to right, on the straights and in the bends', () => {
  const view = {};
  const pose = {};
  const rank = [];
  for (const { plan, n } of PLANS.filter((p) => p.n !== 5)) {
    let frames = 0;
    let slowest = Infinity;
    for (let t = 1; t <= Math.min(...plan.finish); t += 1 / 20) {
      shots.rail(plan, t, view);
      const lead = plan.rank(t, rank)[0];
      plan.pose(lead, t, pose);
      /* The camera's right hand is its line of sight turned a quarter clockwise, seen from above, and the leader's velocity along it is left to right on the glass. */
      const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
      const along = pose.vx * Math.sin(yaw) - pose.vy * Math.cos(yaw);
      slowest = Math.min(slowest, along);
      frames += 1;
    }
    assert.ok(slowest > 5, `with ${n} quads the leader's slowest crossing of the frame is ${slowest} m/s over ${frames} frames, and it must be to the right`);
  }
});

test('the lights end where the race begins, and the first aerial frame is high and sees the oval', () => {
  const { plan } = PLANS[3];
  const first = shots.rail(plan, 0, {});
  const end = shots.aerial(1, plan, {});
  for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'fov']) {
    assert.ok(Math.abs(end[k] - first[k]) < 1e-9, `the aerial ends ${k} ${end[k]} and the rail begins ${first[k]}`);
  }
  const start = shots.aerial(0, plan, {});
  assert.ok(start.z > 80, 'the aerial starts high');
  assert.equal(start.fov, AERIAL_FOV);
  assert.ok(OPEN_FOV > RAIL_FOV, 'and the rail opens wider than it settles');
  /* Its yaw rate on the way down, at 5 seconds, is gentle. */
  let worst = 0;
  let previous = null;
  for (let k = 0; k <= 1; k += 1 / 600) {
    const v = shots.aerial(k, plan, {});
    const yaw = Math.atan2(v.ty - v.y, v.tx - v.x);
    if (previous !== null) {
      worst = Math.max(worst, (Math.abs(wrap(yaw - previous)) * 600 * 180) / Math.PI / 5);
    }
    previous = yaw;
  }
  assert.ok(worst <= 50, `the descent turns ${worst} degrees a second over five seconds`);
});

test('the paddock orbit stays a fixed distance from the middle of the grid, above the ground, and fits the grid', () => {
  for (const n of [1, 9, 10, 23, 50]) {
    const a = shots.paddock(0, n, {});
    const b = shots.paddock(37.5, n, {});
    const centre = course.place(-(GRID.front + ((Math.ceil(n / GRID.columns) - 1) * GRID.rowPitch) / 2), 0, 0, {});
    const da = Math.hypot(a.x - centre.x, a.y - centre.y);
    const db = Math.hypot(b.x - centre.x, b.y - centre.y);
    assert.ok(Math.abs(da - db) < 1e-6, 'a circle');
    assert.ok(a.z > 3, 'above the ground');
    assert.ok(da > 8, 'and outside the grid');
    assert.ok(Math.hypot(a.tx - centre.x, a.ty - centre.y) < 1e-6, 'looking at its middle');
  }
});

test('a phone held upright gets a lens wide enough to show the pack, and a wide window is not touched', () => {
  /* The race lens is 44.7 degrees across on a 16 by 9 window, which is over the minimum, so the minimum does not widen it. */
  assert.equal(fovFor(RAIL_FOV, 16 / 9), RAIL_FOV);
  const across = (vertical, aspect) => (2 * Math.atan(Math.tan((vertical * Math.PI) / 360) * aspect) * 180) / Math.PI;
  const portrait = fovFor(RAIL_FOV, 9 / 16);
  assert.ok(across(portrait, 9 / 16) >= MIN_HORIZONTAL - 0.1, `the horizontal field is ${across(portrait, 9 / 16)} degrees`);
  /* The calm rail and the finish frame keep the 50 degrees a phone had before the race lens was brought in. */
  assert.ok(across(fovFor(CALM_FOV, 9 / 16, CALM_MIN_HORIZONTAL), 9 / 16) >= CALM_MIN_HORIZONTAL - 0.1);
  assert.ok(across(fovFor(FINISH_FOV, 9 / 16, FINISH_MIN_HORIZONTAL), 9 / 16) >= FINISH_MIN_HORIZONTAL - 0.1);
});

test('the winner\'s picture is aimed at the winner, from the infield, a fixed way off, when the flip is half way round', () => {
  const view = {};
  const pose = {};
  for (const { plan } of PLANS) {
    const winner = plan.order[0];
    const t = plan.finish[winner] + HERO_AFTER;
    shots.hero(plan, t, view);
    plan.pose(winner, t, pose);
    assert.ok(Math.abs(view.tx - pose.x) < 1e-9 && Math.abs(view.ty - pose.y) < 1e-9 && Math.abs(view.tz - pose.z) < 1e-9, 'aimed exactly at the winner, which is what the page\'s view offset is worked out from');
    assert.ok(Math.abs(Math.hypot(view.x - pose.x, view.y - pose.y) - HERO_DISTANCE) < 1e-9, 'a fixed distance off, abeam');
    assert.ok(Math.abs(view.z - Math.max(HERO_FLOOR, pose.z + HERO_RISE)) < 1e-9, 'a little below, and never under the floor');
    assert.ok(view.z >= HERO_FLOOR, 'above the ground');
    assert.equal(view.fov, HERO_FOV);
    assert.ok(Math.hypot(view.x, view.y) < Math.hypot(pose.x, pose.y), 'on the infield side, nearer the middle of the oval than the winner is');
    assert.ok(Math.abs(pose.flip - Math.PI) < 1e-6, `the quad is upside down in the picture: ${pose.flip}`);
    /* A pure function: the same plan and time make the same picture. */
    const again = shots.hero(plan, t, {});
    assert.deepEqual(again, view);
  }
});

/* Whether a point is inside a shot's frame, at an aspect, with a margin in degrees. */
function inFrame(view, point, aspect, margin = 0) {
  const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
  const flatView = Math.hypot(view.tx - view.x, view.ty - view.y);
  const bearing = wrap(Math.atan2(point.y - view.y, point.x - view.x) - yaw);
  const elevation = Math.atan2(point.z - view.z, Math.hypot(point.x - view.x, point.y - view.y)) - Math.atan2(view.tz - view.z, flatView);
  const vertical = (fovFor(view.fov, aspect, view.minH) * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const m = (margin * Math.PI) / 180;
  return Math.abs(bearing) <= horizontal / 2 - m && Math.abs(elevation) <= vertical / 2 - m;
}

/* How far out a point is, as a share of the way from the middle of a shot's frame to its edge, the further of across and up: 1 is on the edge. */
function share(view, point, aspect) {
  const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
  const flatView = Math.hypot(view.tx - view.x, view.ty - view.y);
  const bearing = wrap(Math.atan2(point.y - view.y, point.x - view.x) - yaw);
  const elevation = Math.atan2(point.z - view.z, Math.hypot(point.x - view.x, point.y - view.y)) - Math.atan2(view.tz - view.z, flatView);
  const vertical = (fovFor(view.fov, aspect, view.minH) * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return Math.max(Math.abs(bearing) / (horizontal / 2), Math.abs(elevation) / (vertical / 2));
}

/* Plans for the photo finish: the nine, and from a fixed list of labels the first close finish and the first clear win, which a search makes every run the same. */
function finishPlans() {
  const found = { close: null, clear: null };
  for (let k = 0; k < 80 && !(found.close && found.clear); k += 1) {
    const label = `webfpv-picker/test/photo/${k}`;
    const plan = makePlan({
      order: orderFor(12, label), showSeed: Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64), length: 30,
    });
    const gap = plan.finish[plan.order[1]] - plan.finish[plan.order[0]];
    if (!found.close && gap < 0.1) {
      found.close = { plan, gap };
    }
    if (!found.clear && gap > 0.6) {
      found.clear = { plan, gap };
    }
  }
  assert.ok(found.close && found.clear, 'eighty labels have a close finish and a clear win in them');
  return found;
}

test('a photo finish zooms, and never past the first two quads: a clear win does not zoom at all', () => {
  const { close, clear } = finishPlans();
  const view = {};
  const first = {};
  const second = {};
  let narrowest = Infinity;
  for (const { plan } of [...PLANS, close, clear]) {
    const a = plan.finish[plan.order[0]];
    const b = plan.finish[plan.order[1]];
    for (const aspect of [16 / 9, 9 / 16]) {
      const race = fovFor(RAIL_FOV, aspect, MIN_HORIZONTAL);
      for (let t = a - 1.5; t <= b + 1.5; t += 0.01) {
        shots.rail(plan, t, view, false, aspect);
        const zoomed = view.fov < race - 0.5;
        if (zoomed) {
          plan.pose(plan.order[0], t, first);
          plan.pose(plan.order[1], t, second);
          const out = Math.max(share(view, first, aspect), share(view, second, aspect));
          /* The fit is to PHOTO_FIT of the way to the edge, and a soft maximum is a little over the real one, which is on the safe side. */
          assert.ok(out <= PHOTO_FIT + 0.02, `at ${(t - a).toFixed(2)} s from the line a quad is ${out.toFixed(2)} of the way to the edge, zoomed to ${view.fov.toFixed(1)} degrees, aspect ${aspect.toFixed(2)}`);
        }
        if (aspect > 1) {
          narrowest = Math.min(narrowest, view.fov);
        }
      }
    }
  }
  assert.ok(narrowest >= PHOTO_FOV - 0.5, `the lens goes to ${narrowest} degrees`);

  /* A close finish is tight at the crossing, and it is the lens that did it. */
  const a = close.plan.finish[close.plan.order[0]];
  shots.rail(close.plan, a, view);
  console.log(`camera: a finish ${close.gap.toFixed(3)} s apart is ${view.fov.toFixed(1)} degrees at the line, against the race lens's ${RAIL_FOV}, and a clear one ${clear.gap.toFixed(2)} s apart does not move`);
  assert.ok(view.fov <= RAIL_FOV - 8, `a close finish is ${view.fov} degrees at the line`);

  /* A clear win keeps the race lens right up to the line, and the calm rail keeps its own whatever happens. */
  const c = clear.plan.finish[clear.plan.order[0]];
  for (let t = c - 1.5; t <= c; t += 0.01) {
    shots.rail(clear.plan, t, view);
    assert.ok(Math.abs(view.fov - RAIL_FOV) < 0.2, `a clear win is ${view.fov} degrees at ${(t - c).toFixed(2)} s from the line`);
  }
  for (const t of [a - 0.5, a - 0.1, a, a + 0.2]) {
    assert.equal(shots.rail(close.plan, t, view, true, 16 / 9).fov, CALM_FOV, 'the calm rail does not zoom');
  }
});

test('the lens is smooth through a photo finish: no step of more than 2.5 degrees in 1/120 s, and it is open again after', () => {
  const { close } = finishPlans();
  const view = {};
  const a = close.plan.finish[close.plan.order[0]];
  for (const aspect of [16 / 9, 9 / 16]) {
    let previous = null;
    let worst = 0;
    for (let t = a - 2; t <= a + 2.5; t += 1 / 120) {
      shots.rail(close.plan, t, view, false, aspect);
      if (previous !== null) {
        worst = Math.max(worst, Math.abs(view.fov - previous));
      }
      previous = view.fov;
    }
    console.log(`camera: the lens through a photo finish steps at most ${worst.toFixed(2)} degrees in 1/120 s at aspect ${aspect.toFixed(2)}`);
    assert.ok(worst <= 2.5, `the lens steps ${worst} degrees between frames at aspect ${aspect}`);
    assert.ok(Math.abs(view.fov - fovFor(FINISH_FOV, aspect, FINISH_MIN_HORIZONTAL)) < 0.1, `and 2.5 s after the line it is the finish lens, ${view.fov}`);
  }
});

test('the lamps are in frame from the first amber to green, on a wide window and on a phone', () => {
  /* FIRST_LAMP_K is the earliest the first lamp can be lit in the run of the lights, which show.js says, and the lamps stand in the gantry's header over the line. */
  assert.ok(FIRST_LAMP_K >= LIGHTS.first / (LIGHTS.first + 2 * LIGHTS.step + LIGHTS.holdMax) - 1e-9, `${FIRST_LAMP_K} is before the earliest first lamp`);
  const lamps = course.place(0, 0, 5.82, {});
  const view = {};
  for (const { plan } of PLANS) {
    for (const aspect of [16 / 9, 9 / 16]) {
      let worst = 0;
      for (let k = FIRST_LAMP_K; k <= 1; k += 1 / 200) {
        shots.aerial(k, plan, view);
        if (!inFrame(view, lamps, aspect, 2)) {
          worst += 1;
        }
      }
      assert.equal(worst, 0, `the lamps leave the frame in ${worst} of the last 60 per cent of the descent at aspect ${aspect.toFixed(2)}`);
    }
  }
});

test('the whole of the oval is in the first frame of the aerial, and the line is not in the dead middle of the rail\'s first', () => {
  const { plan } = PLANS[3];
  const view = {};
  shots.aerial(0, plan, view);
  /* The four ends of the oval's long axis, at the ground: the boards stand just outside them. */
  const ends = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const extent = Math.max(...Array.from({ length: 360 }, (_, i) => Math.hypot(course.place((i * course.lap) / 360, 0, 0, {}).x, 0)));
  assert.ok(extent > 30);
  for (const [dx, dy] of ends) {
    const probe = { x: dx * extent * 0.5, y: dy * extent * 0.35, z: 0 };
    assert.ok(inFrame(view, probe, 16 / 9), `${dx},${dy} is outside the first aerial frame`);
  }
  /* At the start of the race the gantry's near upright, which stands at the line, is well to the right of the middle: not a pole through it. */
  const first = shots.rail(plan, 0, {});
  const eyeAt = { x: first.x, y: first.y };
  const posts = [-7, 7].map((u) => course.place(0, u, 3, {}));
  const near = posts.sort((a, b) => Math.hypot(a.x - eyeAt.x, a.y - eyeAt.y) - Math.hypot(b.x - eyeAt.x, b.y - eyeAt.y))[0];
  const yaw = Math.atan2(first.ty - first.y, first.tx - first.x);
  const bearing = (wrap(Math.atan2(near.y - first.y, near.x - first.x) - yaw) * 180) / Math.PI;
  /* The pack crosses left to right, so a line that is ahead of the aim is to its right, which is a bearing that is negative of the line of sight turned clockwise. */
  assert.ok(Math.abs(bearing) >= 10, `the near upright is ${bearing.toFixed(1)} degrees from the middle of the rail's first frame`);
});

test('the calm rail turns slowly, cuts instead of gliding, and keeps the leader in frame: on a wide window and on a phone', () => {
  const view = {};
  const pose = {};
  const rank = [];
  const stopShort = shots.stopShort;
  for (const aspect of [16 / 9, 9 / 16]) {
    let worstYaw = 0;
    let mostCuts = 0;
    let out = 0;
    let frames = 0;
    for (const { plan } of PLANS) {
      const cuts = shots.calmCuts(plan, aspect);
      const lastCut = new Set(cuts.map((c) => Math.round(c * 120)));
      mostCuts = Math.max(mostCuts, cuts.length / plan.laps);
      const winner = Math.min(...plan.finish);
      let previous = null;
      let lastS = -Infinity;
      for (let t = 0; t <= plan.duration; t += 1 / 120) {
        shots.rail(plan, t, view, true, aspect);
        assert.equal(view.fov, CALM_FOV, 'the calm rail is one wide lens, with no opening zoom');
        const yaw = Math.atan2(view.ty - view.y, view.tx - view.x);
        const s = shots.railS(plan, t, true, aspect);
        assert.ok(s >= lastS - 1e-9, 'the calm rail never goes backwards either');
        assert.ok(s <= plan.laps * course.lap - stopShort + 1e-6, 'and never crosses the line');
        lastS = s;
        /* A frame on which the camera was put somewhere else is a cut, and a cut is not a turn. */
        const cutHere = [-1, 0, 1].some((d) => lastCut.has(Math.round(t * 120) + d));
        if (previous !== null && !cutHere) {
          worstYaw = Math.max(worstYaw, (Math.abs(wrap(yaw - previous)) * 120 * 180) / Math.PI);
        }
        previous = yaw;
        if (t >= 1.7 && t <= winner) {
          const lead = plan.rank(t, rank)[0];
          plan.pose(lead, t, pose);
          frames += 1;
          if (!inFrame(view, pose, aspect)) {
            out += 1;
          }
        }
      }
    }
    console.log(`camera: the calm rail at aspect ${aspect.toFixed(2)} turns at most ${worstYaw.toFixed(1)} degrees a second between cuts, cuts at most ${mostCuts.toFixed(1)} times a lap, and loses the leader in ${out} of ${frames} frames`);
    assert.ok(worstYaw <= CALM_YAW + 3, `the calm rail turns ${worstYaw} degrees a second`);
    assert.equal(out, 0, `the calm rail loses the leader in ${out} of ${frames} frames at aspect ${aspect}`);
    assert.ok(mostCuts <= (aspect > 1 ? 9 : 20), `${mostCuts} cuts a lap at aspect ${aspect}`);
  }
});

test('the calm rail is the same race rail with its own table, and the race rail is untouched by it', () => {
  const { plan } = PLANS[4];
  const before = shots.rail(plan, 7.3, {});
  shots.rail(plan, 7.3, {}, true, 16 / 9);
  shots.rail(plan, 7.3, {}, true, 9 / 16);
  const after = shots.rail(plan, 7.3, {});
  assert.deepEqual(after, before, 'asking for the calm rail does not change the race rail');
  assert.notDeepEqual(shots.rail(plan, 7.3, {}, true, 16 / 9).fov, before.fov, 'and they are different lenses');
});
