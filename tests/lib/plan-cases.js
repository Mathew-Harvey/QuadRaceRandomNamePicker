/*
 * plan-cases.js: the 3,000 plans checks 6 to 8 are run on, and how to run one.
 *
 * Every order is made by the picker's own shuffle, src/draw.js's, over words
 * from a SHA-256 counter, so a plan is tested against the kind of order the
 * draw really produces and not against whatever a test could think of. Every
 * show seed is the SHA-256 of a fixed string. Nothing here is random, so the
 * same 3,000 plans are flown on every machine, and a failure names the plan
 * by its number and can be reproduced alone.
 *
 * It is shared between tests/choreo.test.js and the worker threads it starts,
 * which is what lets 3,000 plans, each measured at 60 Hz over every pair of
 * quads, take tens of seconds and not minutes.
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

import { createHash } from 'node:crypto';
import { shuffle } from '../../src/draw.js';
import { makePlan, measure } from '../../src/choreo.js';

export const LENGTHS = [15, 30, 60];

/* How many of the 3,000 are each size. Weighted toward the middle, where the pack is a pack, and with enough of the biggest to find a lane planner that fails. */
export const MIX = [[2, 300], [3, 300], [5, 700], [12, 700], [23, 600], [50, 400]];
export const TOTAL = MIX.reduce((n, [, count]) => n + count, 0);
const SIZES = MIX.flatMap(([n, count]) => Array(count).fill(n));

/* The order a draw would produce, from the real shuffle over a stream of words. */
export function orderFor(n, label) {
  let counter = 0;
  let pool = [];
  let at = 0;
  const next = () => {
    if (at >= pool.length) {
      const h = createHash('sha256').update(`${label}/${counter}`).digest();
      counter += 1;
      pool = Array.from({ length: 8 }, (_, i) => h.readUInt32BE(4 * i));
      at = 0;
    }
    at += 1;
    return pool[at - 1];
  };
  return shuffle(n, next);
}

/* Plan number k: a size, a length, an order and a show seed, all from k and nothing else. */
export function specFor(k) {
  const h = createHash('sha256').update(`webfpv-picker/test/plan/${k}`).digest();
  /* 1013 is prime and does not divide 3,000, so this visits every position once and scatters the sizes. */
  const n = SIZES[(k * 1013) % SIZES.length];
  return {
    k,
    n,
    length: LENGTHS[h.readUInt32BE(0) % LENGTHS.length],
    order: orderFor(n, `webfpv-picker/test/order/${k}`),
    showSeed: h.toString('hex'),
  };
}

/* Make plan k, measure it from outside, and keep the numbers the checks need. */
export function runSpec(spec) {
  const started = performance.now();
  const plan = makePlan({ order: spec.order, showSeed: spec.showSeed, length: spec.length, storyline: spec.storyline, photo: spec.photo });
  const made = performance.now() - started;
  const m = measure(plan);
  return {
    k: spec.k,
    n: spec.n,
    length: spec.length,
    story: plan.story,
    photo: plan.photo,
    attempt: plan.attempt,
    fallback: plan.fallback,
    switched: plan.switched,
    kept: plan.kept,
    made,
    orderOk: m.orderOk,
    minFirst: m.minFirst,
    minOther: m.minOther,
    backwards: m.backwards,
    minSpeed: m.minSpeed,
    maxSpeed: m.maxSpeed,
    minDistance: m.minDistance,
    closest: m.closest,
    winnerTime: m.winnerTime,
    winnerRatio: m.winnerRatio,
    laps: m.laps,
    leadsAtHalf: m.leadsAtHalf,
    finalThirdChanges: m.finalThirdChanges,
    margin: m.margin,
  };
}
