/*
 * choreo.test.js: checks 6 to 8 of the brief, and the properties around them
 * that make a race a race and not a picture of one.
 *
 *   6  plan order    3,000 plans, every size, length and storyline: the quads
 *                    cross the line in exactly the drawn order
 *   7  plan physics  the same plans: the four bands that must hold
 *   8  drama         the same plans: the three targets, printed on every run
 *
 * THE PLANS ARE MEASURED FROM OUTSIDE. measure() in src/choreo.js reads only
 * the public sample and locate functions and the course: it finds each
 * crossing by bisection, takes speed as the difference between world
 * positions a frame apart, and takes distance as the plain distance between
 * world positions of every pair, 60 times a second. It does not read the
 * tables the generator checked itself with, so a generator that fooled its
 * own check would not fool this one.
 *
 * The 3,000 plans are made and measured on worker threads, and every order is
 * the picker's real shuffle over a stream of SHA-256 words, so the plans are
 * flown against the orders a draw produces. See tests/lib/plan-cases.js.
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
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { GEOMETRY, GRID, makeCourse } from '../src/course.js';
import {
  LAPS, LAUNCH, MIN_DISTANCE, MIN_GAP, MIN_GAP_FIRST, SPEED_BAND, STORYLINES,
  cosPi, makePlan, makeRng, measure, sinPi,
} from '../src/choreo.js';
import { LENGTHS, MIX, TOTAL, orderFor, specFor } from './lib/plan-cases.js';

const course = makeCourse();
const seedFor = (label) => Array.from(Buffer.from(`webfpv-picker/test/${label}`)).reduce((s, b) => `${s}${b.toString(16).padStart(2, '0')}`, '').padEnd(64, '0').slice(0, 64);
const pct = (x) => `${(100 * x).toFixed(1)}%`;

/* ------------------------------------------------------------------ */
/* Workers                                                             */
/* ------------------------------------------------------------------ */

function parallel(specs) {
  const count = Math.max(1, Math.min(os.availableParallelism(), 8, specs.length));
  const shares = Array.from({ length: count }, () => []);
  specs.forEach((spec, i) => shares[i % count].push(spec));
  return Promise.all(shares.map((share) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./lib/plan-worker.js', import.meta.url), { workerData: { specs: share } });
    worker.once('message', resolve);
    worker.once('error', reject);
  }))).then((parts) => parts.flat().sort((a, b) => a.k - b.k));
}

let everything;
const allPlans = () => {
  everything ??= (async () => {
    const started = performance.now();
    const rows = await parallel(Array.from({ length: TOTAL }, (_, k) => specFor(k)));
    rows.seconds = (performance.now() - started) / 1000;
    return rows;
  })();
  return everything;
};

/* ------------------------------------------------------------------ */
/* The course                                                          */
/* ------------------------------------------------------------------ */

test('the course is a closed clothoid stadium: the lap is its closed form, it closes, and curvature never steps', () => {
  const g = GEOMETRY;
  assert.ok(Math.abs(course.lap - (2 * g.straight + 2 * g.spiral + 2 * Math.PI * g.radius)) < 1e-9);
  assert.ok(course.closure < 1e-5, `the loop closes to ${course.closure} m`);
  assert.ok(Math.abs(course.table.th[course.table.count] + Math.PI) < 1e-9, 'two right turns bring the heading round to where it began');
  let jump = 0;
  const a = {};
  const b = {};
  for (let s = 0; s < course.lap; s += 0.05) {
    course.at(s, a);
    course.at(s + 0.05, b);
    jump = Math.max(jump, Math.abs(b.kappa - a.kappa));
  }
  assert.ok(jump < 2e-4, `the largest step in curvature over 5 cm is ${jump}, where a bare arc would step by ${1 / g.radius}`);
  course.at(-3, a);
  course.at(course.lap - 3, b);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, 'the course repeats every lap');
  assert.ok(course.lap > 300 && course.lap < 340, `a lap of about 300 m: ${course.lap.toFixed(1)}`);
});

test('the oval fits the field the brief suggests, and the camera rail is concentric with the line', () => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const p = {};
  for (let s = 0; s < course.lap; s += 0.5) {
    course.place(s, course.width / 2, 0, p);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    course.place(s, -course.width / 2, 0, p);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  assert.ok(maxX - minX < 160 && maxY - minY < 80, `the track is ${(maxX - minX).toFixed(0)} by ${(maxY - minY).toFixed(0)} m inside a 200 by 100 field`);
  const line = {};
  const rail = {};
  for (let s = 0; s < course.lap; s += 7) {
    course.place(s, 0, 0, line);
    course.rail(s, rail);
    assert.ok(Math.abs(Math.hypot(rail.x - line.x, rail.y - line.y) - GEOMETRY.railInset) < 1e-6, `at s = ${s}`);
    assert.equal(rail.z, GEOMETRY.railHeight);
  }
});

test('u is positive outward, the quads race clockwise, and the start line is in the middle of the south straight', () => {
  const o = {};
  const inward = {};
  course.place(0, 5, 0, o);
  course.place(0, -5, 0, inward);
  assert.ok(o.y < inward.y, 'a positive u is toward the outside, which is south of the south straight');
  const line = {};
  course.at(0, line);
  assert.ok(Math.abs(line.x) < 1e-9 && line.y < 0, 'the line is on the south straight, at x = 0');
  assert.ok(Math.abs(Math.abs(line.theta) - Math.PI) < 1e-9, 'flown westward');
  /* Through the first bend the heading turns from west toward north, which is clockwise, so it decreases. */
  let turn = 0;
  const q = {};
  const r = {};
  for (let s = course.geometry.straight / 2; s < course.lap / 2; s += 0.5) {
    course.at(s, q);
    course.at(s + 0.5, r);
    turn += r.theta - q.theta;
  }
  assert.ok(turn < -Math.PI * 0.9, 'heading decreases through the first bend, which is a right turn');
});

test('the grid holds up to fifty in entry order, in rows of nine from the front, each in a lane and a row of its own', () => {
  for (let n = 1; n <= 50; n += 1) {
    const cells = course.grid(n);
    assert.equal(cells.length, n);
    const seen = new Set();
    cells.forEach((cell, entry) => {
      assert.equal(cell.entry, entry);
      assert.equal(cell.row, Math.floor(entry / GRID.columns), 'rows fill from the front in entry order');
      assert.ok(cell.lane >= 0 && cell.lane < course.lanes, `lane ${cell.lane}`);
      assert.ok(!seen.has(`${cell.lane}/${cell.row}`), 'no two entries on one block');
      seen.add(`${cell.lane}/${cell.row}`);
      assert.ok(Math.abs(cell.s0 + (GRID.front + cell.row * GRID.rowPitch)) < 1e-12);
      assert.ok(Math.abs(cell.u0 - course.laneU(cell.lane)) < 1e-12);
    });
    assert.ok(cells.at(-1).s0 > -(GRID.front + 6 * GRID.rowPitch), 'six rows at most, and the straight behind the line is long enough for them');
  }
  const twelve = course.grid(12);
  assert.deepEqual(twelve.slice(9).map((c) => c.lane), [5, 4, 3], 'a short last row is centred');
  assert.deepEqual(course.grid(9).map((c) => c.lane), [8, 7, 6, 5, 4, 3, 2, 1, 0], 'entry 0 is leftmost seen from behind the grid, so a person reads it in the order it was typed');
});

/* ------------------------------------------------------------------ */
/* The arithmetic and the generator                                    */
/* ------------------------------------------------------------------ */

test('the fixed cosine is within a few ulps of the real one, and exact where it should be', () => {
  /* Over [-1, 1], the range the plan uses. Beyond it the reference is the one in error: Math.PI * x loses a digit for every doubling of x, and cosPi reduces by 2 exactly. */
  let worst = 0;
  for (let i = -5000; i <= 5000; i += 1) {
    const x = i / 5000;
    worst = Math.max(worst, Math.abs(cosPi(x) - Math.cos(Math.PI * x)), Math.abs(sinPi(x) - Math.sin(Math.PI * x)));
  }
  assert.ok(worst < 1e-15, `worst error ${worst}`);
  for (let i = -400; i <= 400; i += 1) {
    assert.equal(cosPi(i / 100 + 2), cosPi(i / 100 + 2 - 2), 'periodic in 2');
  }
  assert.equal(cosPi(0), 1);
  assert.equal(cosPi(1), -1);
  assert.equal(cosPi(-1), -1);
  assert.equal(cosPi(2), 1);
  assert.ok(Math.abs(cosPi(0.5)) < 1e-16);
  assert.ok(Math.abs(sinPi(0.5) - 1) < 1e-15);
  assert.equal(cosPi(0.3), cosPi(-0.3), 'even');
});

test('the generator is seeded, independent per label, and fair', () => {
  const a = makeRng(seedFor('rng'), 'x');
  const b = makeRng(seedFor('rng'), 'x');
  const c = makeRng(seedFor('rng'), 'y');
  const d = makeRng(seedFor('other'), 'x');
  const first = Array.from({ length: 50 }, () => a.float());
  assert.deepEqual(first, Array.from({ length: 50 }, () => b.float()), 'same seed and label, same stream');
  assert.notDeepEqual(first, Array.from({ length: 50 }, () => c.float()), 'another label is another stream');
  assert.notDeepEqual(first, Array.from({ length: 50 }, () => d.float()), 'another seed is another stream');
  const r = makeRng(seedFor('fair'), 'fair');
  let sum = 0;
  const counts = Array(10).fill(0);
  for (let i = 0; i < 100000; i += 1) {
    const x = r.float();
    assert.ok(x >= 0 && x < 1);
    sum += x;
    counts[r.int(10)] += 1;
  }
  assert.ok(Math.abs(sum / 100000 - 0.5) < 0.01);
  assert.ok(counts.every((n) => n > 9500 && n < 10500), `buckets ${counts}`);
  let chances = 0;
  for (let i = 0; i < 100000; i += 1) {
    if (r.chance(0.38)) {
      chances += 1;
    }
  }
  assert.ok(Math.abs(chances / 100000 - 0.38) < 0.01);
});

test('a plan is a function of its inputs: the same receipt is the same race, and another seed is another', () => {
  const order = orderFor(23, 'replay');
  const seed = seedFor('replay');
  const trace = (plan) => {
    const out = [];
    const p = {};
    for (let t = 0; t < plan.duration; t += 0.37) {
      for (let i = 0; i < plan.count; i += 1) {
        plan.pose(i, t, p);
        out.push(p.x, p.y, p.z, p.tx, p.ty, p.tz, p.fx, p.fy);
      }
    }
    return out;
  };
  const one = makePlan({ order, showSeed: seed, length: 30 });
  const two = makePlan({ order, showSeed: seed, length: 30 });
  assert.deepEqual(trace(one), trace(two), 'bit for bit');
  assert.equal(one.story, two.story);
  const other = makePlan({ order, showSeed: seedFor('another'), length: 30 });
  assert.notDeepEqual(trace(one), trace(other));
  /* The seed may be bytes as well as hex, which is what the draw's showSeed is before it is written down. */
  const bytes = Uint8Array.from(Buffer.from(seed, 'hex'));
  assert.deepEqual(trace(makePlan({ order, showSeed: bytes, length: 30 })), trace(one));
});

test('a plan is refused for a size, a length, an order or a seed that is not one', () => {
  const seed = seedFor('refuse');
  assert.throws(() => makePlan({ order: [0], showSeed: seed, length: 30 }), /2 to 50/);
  assert.throws(() => makePlan({ order: orderFor(51, 'x'), showSeed: seed, length: 30 }), /2 to 50/);
  assert.throws(() => makePlan({ order: [0, 1, 2], showSeed: seed, length: 20 }), /15, 30 or 60/);
  assert.throws(() => makePlan({ order: [0, 0, 2], showSeed: seed, length: 30 }), /every entry/);
  assert.throws(() => makePlan({ order: [0, 1, 5], showSeed: seed, length: 30 }), /every entry/);
  assert.throws(() => makePlan({ order: [0, 1, 2], showSeed: 'abc', length: 30 }), /32 bytes/);
});

/* ------------------------------------------------------------------ */
/* 6. The order                                                        */
/* ------------------------------------------------------------------ */

test('check 6: in 3,000 plans the quads cross the line in exactly the drawn order', async (t) => {
  const rows = await allPlans();
  assert.equal(rows.length, TOTAL);
  const wrong = rows.filter((r) => !r.orderOk).map((r) => r.k);
  assert.deepEqual(wrong, [], `plans whose crossing order is not the draw: ${wrong.slice(0, 10)}`);
  const cells = new Map();
  const stories = new Map();
  for (const r of rows) {
    cells.set(`${r.n}/${r.length}`, (cells.get(`${r.n}/${r.length}`) || 0) + 1);
    stories.set(`${r.n}/${r.story}`, (stories.get(`${r.n}/${r.story}`) || 0) + 1);
  }
  for (const [n] of MIX) {
    for (const length of LENGTHS) {
      assert.ok((cells.get(`${n}/${length}`) || 0) >= 20, `N = ${n} at ${length} s has ${cells.get(`${n}/${length}`)} plans`);
    }
    for (const story of STORYLINES) {
      assert.ok((stories.get(`${n}/${story}`) || 0) >= 10, `N = ${n} with the ${story} story has ${stories.get(`${n}/${story}`)} plans`);
    }
  }
  const attempts = {};
  for (const r of rows) {
    attempts[r.attempt] = (attempts[r.attempt] || 0) + 1;
  }
  const slowest = rows.reduce((a, b) => (b.made > a.made ? b : a));
  t.diagnostic(`${TOTAL} plans made and measured in ${rows.seconds.toFixed(1)} s on ${Math.min(os.availableParallelism(), 8)} threads; attempts ${JSON.stringify(attempts)}; slowest to make ${slowest.made.toFixed(0)} ms (N = ${slowest.n})`);
  t.diagnostic(`stories: ${STORYLINES.map((s) => `${s} ${pct(rows.filter((r) => r.story === s).length / TOTAL)}`).join(', ')}`);
  assert.equal(rows.filter((r) => r.fallback).length, 0, 'no plan needed the one slot per quad fallback');
  assert.equal(rows.filter((r) => !r.kept).length, 0, 'every storyline kept its promise');
  t.diagnostic(`${rows.filter((r) => r.switched).length} of ${TOTAL} plans had a story that could not be kept for their seed and flew the sturdy one instead`);
});

/* ------------------------------------------------------------------ */
/* 7. The physics                                                      */
/* ------------------------------------------------------------------ */

test('check 7: in the same plans the four bands hold: the gaps, the speeds, the clearance, the length', async (t) => {
  const rows = await allPlans();
  const fail = (what, list) => assert.deepEqual(list.slice(0, 8).map((r) => r.k), [], `${what}: ${list.length} plans, for example ${list.slice(0, 3).map((r) => `#${r.k} (N = ${r.n})`).join(', ')}`);

  fail(`first and second less than ${MIN_GAP_FIRST} s apart`, rows.filter((r) => r.minFirst < MIN_GAP_FIRST));
  fail(`neighbouring places less than ${MIN_GAP} s apart`, rows.filter((r) => r.minOther < MIN_GAP));
  fail('progress goes backwards', rows.filter((r) => r.backwards > 0));
  fail(`slower than ${SPEED_BAND.min} m/s after the launch`, rows.filter((r) => r.minSpeed < SPEED_BAND.min));
  fail(`faster than ${SPEED_BAND.max} m/s`, rows.filter((r) => r.maxSpeed > SPEED_BAND.max));
  fail(`two quads closer than ${MIN_DISTANCE} m`, rows.filter((r) => r.minDistance < MIN_DISTANCE));
  fail('the winner is more than 10 per cent from the length chosen', rows.filter((r) => r.winnerRatio < 0.9 || r.winnerRatio > 1.1));
  fail('not a whole number of laps', rows.filter((r) => r.laps !== LAPS[r.length] || !Number.isInteger(r.laps)));

  const line = course.place(course.lap * 2, 0, 0, {});
  const start = course.place(0, 0, 0, {});
  assert.ok(Math.hypot(line.x - start.x, line.y - start.y) < 1e-9, 'the finish line is the start line, on the start straight');

  const over = (key, pick) => rows.reduce((best, r) => (pick(r[key], best[key]) ? r : best));
  const slowest = over('minSpeed', (a, b) => a < b);
  const fastest = over('maxSpeed', (a, b) => a > b);
  const closest = over('minDistance', (a, b) => a < b);
  const first = over('minFirst', (a, b) => a < b);
  const other = rows.filter((r) => r.n > 2).reduce((best, r) => (r.minOther < best.minOther ? r : best));
  t.diagnostic(`speed ${slowest.minSpeed.toFixed(1)} to ${fastest.maxSpeed.toFixed(1)} m/s (band ${SPEED_BAND.min} to ${SPEED_BAND.max}); nearest two quads ${closest.minDistance.toFixed(2)} m (limit ${MIN_DISTANCE}); first and second at least ${first.minFirst.toFixed(3)} s apart (limit ${MIN_GAP_FIRST}), others ${other.minOther.toFixed(3)} s (limit ${MIN_GAP}); winner time ${pct(Math.min(...rows.map((r) => r.winnerRatio)))} to ${pct(Math.max(...rows.map((r) => r.winnerRatio)))} of the length (limit 90% to 110%)`);
});

/* ------------------------------------------------------------------ */
/* 8. The drama                                                        */
/* ------------------------------------------------------------------ */

test('check 8: the drama targets, over every plan of five names or more, printed on every run', async (t) => {
  const rows = (await allPlans()).filter((r) => r.n >= 5);
  assert.ok(rows.length >= 1000, `${rows.length} plans of N >= 5`);
  const share = (pick, list = rows) => list.filter(pick).length / list.length;
  const half = share((r) => r.leadsAtHalf);
  const changes = share((r) => r.finalThirdChanges >= 1);
  const close = share((r) => r.margin < 0.25);
  t.diagnostic(`over ${rows.length} plans of N >= 5:`);
  t.diagnostic(`  the eventual winner leads at half distance in ${pct(half)}   (target 10 to 35)`);
  t.diagnostic(`  at least one lead change in the final third in ${pct(changes)}   (target at least 60)`);
  t.diagnostic(`  a winning margin under 0.25 s in ${pct(close)}   (target 25 to 50)`);
  for (const [n] of MIX.filter(([size]) => size >= 5)) {
    const here = rows.filter((r) => r.n === n);
    t.diagnostic(`  N = ${String(n).padStart(2)}: half ${pct(share((r) => r.leadsAtHalf, here))}, changes ${pct(share((r) => r.finalThirdChanges >= 1, here))}, close ${pct(share((r) => r.margin < 0.25, here))}`);
  }
  assert.ok(half >= 0.1 && half <= 0.35, `winner leads at half distance in ${pct(half)}`);
  assert.ok(changes >= 0.6, `lead changes in the final third in ${pct(changes)}`);
  assert.ok(close >= 0.25 && close <= 0.5, `winning margin under 0.25 s in ${pct(close)}`);
});

/* ------------------------------------------------------------------ */
/* Every storyline, forced                                             */
/* ------------------------------------------------------------------ */

test('every storyline, forced at every size and length and with and without a photo finish, keeps its promise and flies a legal race', async (t) => {
  const specs = [];
  let k = 100000;
  for (const [n] of MIX) {
    for (const length of LENGTHS) {
      for (const storyline of STORYLINES) {
        for (const photo of [true, false]) {
          const base = specFor(k);
          specs.push({ ...base, k, n, length, order: orderFor(n, `forced/${k}`), storyline, photo });
          k += 1;
        }
      }
    }
  }
  const rows = await parallel(specs);
  assert.equal(rows.length, MIX.length * LENGTHS.length * STORYLINES.length * 2);
  const bad = rows.filter((r) => !r.orderOk || r.fallback || !r.kept || r.minDistance < MIN_DISTANCE || r.minSpeed < SPEED_BAND.min || r.maxSpeed > SPEED_BAND.max || r.backwards > 0);
  assert.deepEqual(bad.map((r) => `${r.story} N=${r.n} L=${r.length} #${r.k}`), [], 'every forced race is legal and keeps its story');
  for (const r of rows) {
    assert.equal(r.story, specs.find((s) => s.k === r.k).storyline, 'the story asked for is the story flown');
    assert.equal(r.photo, specs.find((s) => s.k === r.k).photo);
    assert.ok(r.photo ? r.margin < 0.25 : r.margin >= 0.3 - 1e-9, `a photo finish is a margin under 0.25 s and nothing else is: #${r.k} ${r.margin}`);
    if (r.story === 'wire') {
      assert.ok(r.leadsAtHalf, `wire to wire leads at half: N=${r.n} #${r.k}`);
    }
    if (r.story !== 'wire') {
      assert.ok(!r.leadsAtHalf && r.finalThirdChanges >= 1, `${r.story} trails at half and takes the lead in the last third: N=${r.n} #${r.k}`);
    }
  }
  t.diagnostic(`${rows.length} forced plans: ${STORYLINES.map((s) => `${s} ${rows.filter((r) => r.story === s && r.attempt === 0).length}/${rows.filter((r) => r.story === s).length} first time`).join(', ')}`);
});

/* ------------------------------------------------------------------ */
/* What a quad does, and that pose() says so                           */
/* ------------------------------------------------------------------ */

let sampled;
function sampleSet() {
  sampled ??= [[12, 'a'], [23, 'b'], [50, 'c'], [50, 'd']].map(([n, label]) => makePlan({ order: orderFor(n, `pose/${label}`), showSeed: seedFor(`pose/${label}`), length: label === 'd' ? 60 : 30 }));
  return sampled;
}

test('pose() is consistent with itself: velocity is the derivative of position and acceleration the derivative of velocity', () => {
  const p = {};
  const q = {};
  const r = {};
  const h = 2e-4;
  let worstV = 0;
  let worstA = 0;
  for (const plan of sampleSet()) {
    for (let i = 0; i < plan.count; i += Math.max(1, Math.floor(plan.count / 9))) {
      for (let t = 0.7; t < plan.duration - 1; t += 0.913) {
        plan.pose(i, t, p);
        plan.pose(i, t + h, q);
        plan.pose(i, t - h, r);
        const vx = (q.x - r.x) / (2 * h);
        const vy = (q.y - r.y) / (2 * h);
        const vz = (q.z - r.z) / (2 * h);
        worstV = Math.max(worstV, Math.abs(vx - p.vx), Math.abs(vy - p.vy), Math.abs(vz - p.vz));
        const ax = (q.vx - r.vx) / (2 * h);
        const ay = (q.vy - r.vy) / (2 * h);
        const az = (q.vz - r.vz) / (2 * h);
        worstA = Math.max(worstA, Math.abs(ax - p.ax), Math.abs(ay - p.ay), Math.abs(az - p.az));
      }
    }
  }
  /* Positions come from a table 5 cm apart, whose chord leans off the interpolated heading by up to kappa ds / 2, which is 0.02 m/s at 25 m/s. */
  assert.ok(worstV < 0.05, `velocity is off by ${worstV} m/s`);
  assert.ok(worstA < 0.05, `acceleration is off by ${worstA} m/s^2`);
});

test('the plan is smooth to second order: acceleration never jumps, and the thrust it asks for is one the aircraft can make', (t) => {
  const p = {};
  const q = {};
  let jump = 0;
  let tilt = 0;
  let thrust = 0;
  let strongest = 0;
  const dt = 1 / 240;
  for (const plan of sampleSet()) {
    for (let i = 0; i < plan.count; i += 1) {
      plan.pose(i, 0, q);
      for (let time = dt; time < plan.duration; time += dt) {
        plan.pose(i, time, p);
        jump = Math.max(jump, Math.abs(p.ax - q.ax), Math.abs(p.ay - q.ay), Math.abs(p.az - q.az));
        assert.ok(Math.abs(Math.hypot(p.tx, p.ty, p.tz) - 1) < 1e-12, 'the thrust axis is a unit vector');
        assert.ok(p.tz > 0, 'and it points up: nobody is ever inverted');
        tilt = Math.max(tilt, (Math.acos(p.tz) * 180) / Math.PI);
        thrust = Math.max(thrust, Math.hypot(p.ax, p.ay, p.az + 9.81));
        assert.ok(Math.abs(Math.hypot(p.fx, p.fy) - 1) < 1e-12, 'the heading is a unit vector');
        strongest = Math.max(strongest, Math.hypot(p.ax, p.ay));
        Object.assign(q, p);
      }
    }
  }
  t.diagnostic(`largest change in acceleration in 1/240 s: ${jump.toFixed(2)} m/s^2; steepest tilt of the thrust axis ${tilt.toFixed(1)} degrees; strongest sideways acceleration ${(strongest / 9.81).toFixed(2)} g; most thrust asked for ${(thrust / 9.81).toFixed(2)} g`);
  assert.ok(jump < 2.5, `acceleration jumps by ${jump} m/s^2 in 1/240 s`);
  /* A five inch on six cells has a thrust to weight of 7 to 9, so five g is the most a plan may ask of it with room to spare. The angle is a result of that and not a limit: 81 degrees of bank is 3 g sideways. */
  assert.ok(thrust < 5 * 9.81, `the plan asks for ${thrust / 9.81} g of thrust`);
  assert.ok(tilt < 88, `the thrust axis tips ${tilt} degrees`);
});

test('the launch is common: every quad starts at rest on its block and is doing the same thing until the speeds begin to part', () => {
  const plan = makePlan({ order: orderFor(50, 'launch'), showSeed: seedFor('launch'), length: 30 });
  const p = {};
  const cells = course.grid(50);
  let reference = null;
  for (let i = 0; i < 50; i += 1) {
    plan.sample(i, 0, p);
    assert.ok(Math.abs(p.s - cells[i].s0) < 1e-12, 'on its own block, along the line');
    assert.ok(Math.abs(p.u - cells[i].u0) < 1e-12, 'and across it');
    assert.ok(Math.abs(p.h - course.levelH(-1)) < 1e-12, 'at the height of the foam');
    assert.equal(p.ds, 0, 'at rest');
    plan.sample(i, LAUNCH, p);
    reference ??= p.ds;
    assert.ok(Math.abs(p.ds - reference) < 1e-9, `quad ${i} is going ${p.ds} m/s when the launch ends, and quad 0 ${reference}`);
  }
  assert.ok(reference > 15 && reference < 22, `launch speed ${reference}`);
});

test('the leader at the moment the winner is at the line is the winner, and the winner alone throws a flip', () => {
  for (const plan of sampleSet()) {
    const win = plan.order[0];
    const t = plan.finish[win];
    assert.equal(plan.rank(t - 0.001)[0], win, 'the winner is first as it arrives');
    const p = {};
    for (let i = 0; i < plan.count; i += 1) {
      plan.pose(i, plan.finish[i] + 0.45, p);
      assert.ok(i === win ? p.flip > 0 : p.flip === 0, i === win ? 'the winner flips' : 'nobody else does');
      plan.pose(i, plan.finish[i] - 0.5, p);
      assert.equal(p.flip, 0, 'and not before the line');
    }
    plan.pose(win, t + 0.9, p);
    assert.ok(Math.abs(p.flip) < 1e-9 || Math.abs(p.flip - 2 * Math.PI) < 1e-9 || p.flip === 0, 'the flip ends where it began');
  }
});

test('a clip story wobbles the quad that clips, and only for as long as a clip lasts', () => {
  const plan = makePlan({ order: orderFor(23, 'clip'), showSeed: seedFor('clip'), length: 30, storyline: 'clip', photo: false });
  assert.equal(plan.story, 'clip');
  assert.equal(plan.wobbles.length, 1);
  const { index, at, amount } = plan.wobbles[0];
  assert.equal(index, plan.rival);
  const p = {};
  plan.pose(index, at - 0.01, p);
  assert.equal(p.wobble, 0);
  let peak = 0;
  for (let t = at; t < at + 1.2; t += 0.01) {
    plan.pose(index, t, p);
    peak = Math.max(peak, Math.abs(p.wobble));
  }
  assert.ok(peak > 0.2 * amount && peak <= amount, `the wobble peaks at ${peak}`);
  plan.pose(index, at + 1.3, p);
  assert.equal(p.wobble, 0);
  plan.pose((index + 1) % plan.count, at + 0.3, p);
  assert.equal(p.wobble, 0, 'nobody else is touched');
});

test('the fallback, one slot per quad, is a legal race too: nobody can be closer than a slot apart whatever the speeds do', () => {
  for (const n of [12, 23, 50]) {
    const plan = makePlan({ order: orderFor(n, `fallback/${n}`), showSeed: seedFor(`fallback/${n}`), length: 30, attempts: 0 });
    assert.equal(plan.fallback, true);
    assert.equal(plan.story, 'plain');
    const m = measure(plan);
    assert.ok(m.orderOk, `N = ${n}`);
    assert.ok(m.minFirst >= MIN_GAP_FIRST && m.minOther >= MIN_GAP);
    assert.ok(m.minDistance >= 0.9 - 1e-9, `N = ${n}: ${m.minDistance}`);
    assert.ok(m.minSpeed >= SPEED_BAND.min && m.maxSpeed <= SPEED_BAND.max, `${m.minSpeed} to ${m.maxSpeed}`);
    assert.equal(m.backwards, 0);
  }
});

test('the rank of a quad at any moment is by distance along the line, leader first, and has every quad once', () => {
  const plan = makePlan({ order: orderFor(23, 'rank'), showSeed: seedFor('rank'), length: 30 });
  const out = new Array(23);
  const p = {};
  for (let t = 0; t < plan.duration; t += 1.7) {
    plan.rank(t, out);
    assert.deepEqual([...out].sort((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i));
    let last = Infinity;
    for (const i of out) {
      plan.sample(i, t, p);
      assert.ok(p.s <= last);
      last = p.s;
    }
  }
  plan.rank(0, out);
  /* On the grid the front row is ahead of the second, whoever is going to win. */
  assert.ok(out.slice(0, 9).every((i) => i < 9), 'the first nine on the road are the first nine on the grid');
});
