/*
 * sound.test.js: what the sound decides, held without a speaker.
 *
 * The mix itself needs an audio context, and there is none in Node: the
 * shots script builds the real graph on an OfflineAudioContext in the page
 * and reads the buffer. What is here is the arithmetic that drives it, which
 * is the pace of the race becoming the pitch of the motors, and the shape of
 * the tones, which are numbers in a table, and the promise that a page with
 * no audio is a page that does not throw.
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
  RPM, STING, TONES, createSound, motorRpms, raceRpm, rpmFor,
} from '../src/sound.js';
import { SPEED_BAND } from '../src/choreo.js';

/* The blade pass frequency of a three bladed prop, which is what the simulator's motors sing at. */
const hz = (rpm) => (rpm / 60) * 3;

test('the pace of the race is the pitch of the motors: linear, bounded, and inside the simulator\'s flight register', () => {
  assert.equal(rpmFor(RPM.slow), RPM.idle);
  assert.equal(rpmFor(0), RPM.idle, 'a quad on the grid is spooled up and waiting, not silent');
  assert.equal(rpmFor(RPM.fast), RPM.top);
  assert.equal(rpmFor(500), RPM.top, 'and no faster than the top');
  let previous = -Infinity;
  for (let v = 0; v <= 40; v += 0.5) {
    const r = rpmFor(v);
    assert.ok(r >= previous, 'a faster race is never a lower note');
    previous = r;
  }
  /* The simulator's flight register is 130 to 430 Hz, and its fundamental IS the blade pass. */
  assert.ok(hz(RPM.idle) >= 130 && hz(RPM.top) <= 440, `${hz(RPM.idle)} to ${hz(RPM.top)} Hz`);
  assert.equal(RPM.fast, SPEED_BAND.max, 'the top of the pitch is the fastest the planner lets a quad go');
});

test('four motors are four speeds, a little apart, round the one that was asked for', () => {
  const four = motorRpms(6000);
  assert.equal(four.length, 4);
  assert.equal(new Set(four).size, 4, 'no two alike, or there is no beat');
  for (const r of four) {
    assert.ok(Math.abs(r / 6000 - 1) < 0.03, `${r} is more than 3 per cent off`);
  }
  assert.deepEqual(motorRpms(0), [0, 0, 0, 0], 'and a stopped quad is four stopped motors');
});

test('the motors spool down over a couple of seconds once the winner has crossed, and are still after', () => {
  const finish = 30;
  assert.equal(raceRpm(25, 12, finish), rpmFor(25));
  assert.equal(raceRpm(25, finish, finish), rpmFor(25), 'at the line she is still at pace');
  const base = rpmFor(25);
  assert.ok(Math.abs(raceRpm(25, finish + RPM.spoolDown / 2, finish) - base / 2) < 1e-9);
  assert.equal(raceRpm(25, finish + RPM.spoolDown, finish), 0);
  assert.equal(raceRpm(25, finish + 60, finish), 0);
  let previous = Infinity;
  for (let t = finish; t <= finish + 4; t += 0.1) {
    const r = raceRpm(25, t, finish);
    assert.ok(r <= previous + 1e-9, 'it only falls');
    previous = r;
  }
});

test('the tones: three short ambers and a long green above them, and a sting that rises and ends held', () => {
  assert.ok(TONES.green.hz > TONES.amber.hz, 'green is the higher note');
  assert.ok(TONES.green.seconds > 3 * TONES.amber.seconds, 'and a long one against a short one');
  assert.ok(TONES.amber.seconds < 0.25, 'ambers a second apart are short enough to be a count');
  for (const { level } of Object.values(TONES)) {
    assert.ok(level > 0 && level <= 0.4, 'quiet enough to be on top of the motors and under the speakers\' limit');
  }
  const hzs = STING.map((n) => n.hz);
  assert.deepEqual([...hzs].sort((a, b) => a - b), hzs, 'the sting rises');
  assert.ok(STING.at(-1).seconds > 2 * STING[0].seconds, 'and the last note is held');
  const end = Math.max(...STING.map((n) => n.at + n.seconds));
  assert.ok(end < 1.2, `a short sting: ${end} s`);
});

test('a page with no audio is a page that does not throw: every call is a quiet no-op, and it says so', () => {
  const sound = createSound();
  assert.equal(sound.supported, false, 'there is no AudioContext in Node');
  assert.equal(sound.state, 'none');
  assert.equal(sound.unlock(), 'none');
  sound.motors({ rpm: 5000, speed: 20 });
  sound.hush();
  sound.gate();
  sound.tone('amber');
  sound.tone('nonsense');
  sound.sting();
  sound.setMuted(true);
  assert.equal(sound.muted, true, 'the mute is still remembered');
  assert.equal(sound.state, 'none');
});
