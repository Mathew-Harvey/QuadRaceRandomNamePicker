/*
 * paddock.js: how a quad arrives on its block and how it leaves.
 *
 * "Each name typed drops a quad onto the next block; a deleted name's quad
 * lifts off." These are the two curves, as pure functions of the seconds since
 * the name was typed or deleted, so that they can be held by tests in Node and
 * so that the fleet, which draws them, has no arithmetic of its own to get
 * wrong.
 *
 * A DROP is a fall under gravity from a few metres up, quick enough to keep up
 * with typing, with one small bounce on the block, which is what a thing set
 * down on foam does. A LIFT is the reverse of a gentle one: it accelerates
 * away upward and shrinks over the last part of its run, because an
 * instanced mesh has no opacity to fade and a quad that is smaller is a quad
 * going away.
 *
 * Under reduced motion neither happens: a name is a quad on its block and a
 * deleted name is gone, and the fleet is told so with setCalm.
 *
 * This file imports nothing, so it runs in Node, where tests/paddock.test.js
 * holds it.
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

/* A drop: from `height` m up, a fall of `fall` s, a bounce of at most `bounce` m, all over by `seconds`. */
export const DROP = Object.freeze({
  height: 3.2, fall: 0.36, seconds: 0.62, bounce: 0.1,
});

/* A lift: up `height` m over `seconds`, and shrinking over the last `1 - shrink` of it. */
export const LIFT = Object.freeze({ height: 4.5, seconds: 0.7, shrink: 0.7 });

/* How far above its block a quad is, `age` seconds after its name was typed. */
export function dropHeight(age) {
  if (!(age > 0)) {
    return DROP.height;
  }
  if (age >= DROP.seconds) {
    return 0;
  }
  if (age < DROP.fall) {
    const x = age / DROP.fall;
    return DROP.height * (1 - x * x);
  }
  const b = (age - DROP.fall) / (DROP.seconds - DROP.fall);
  return DROP.bounce * Math.sin(Math.PI * b) * (1 - b);
}

/* How far above its block a quad is and how big, `age` seconds after its name was deleted. `done` is true once it has gone. */
export function liftState(age) {
  const x = Math.max(0, age) / LIFT.seconds;
  if (x >= 1) {
    return { height: LIFT.height, scale: 0, done: true };
  }
  const shrink = x < LIFT.shrink ? 0 : (x - LIFT.shrink) / (1 - LIFT.shrink);
  return {
    height: LIFT.height * x * x,
    scale: 1 - shrink * shrink * (3 - 2 * shrink),
    done: false,
  };
}
