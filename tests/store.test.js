/*
 * store.test.js: what the page remembers, and what it does when it cannot.
 *
 * The page has to work with storage blocked, full, damaged or absent, and the
 * only way to know it does is to hand the store a storage that fails in each of
 * those ways. The draw log is held to its limit of fifty, its order, and the
 * one thing it exists for: a receipt written is a receipt read back, whole.
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
import { LOG_LIMIT, createStore, pageStorage } from '../src/store.js';
import { drawWithSeed } from '../src/draw.js';

/* A storage that behaves, and one that can be told to fail. */
function fake({ quota = Infinity, blocked = false } = {}) {
  const data = new Map();
  let used = 0;
  return {
    data,
    getItem(k) {
      if (blocked) {
        throw new Error('SecurityError');
      }
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      if (blocked) {
        throw new Error('SecurityError');
      }
      const next = used - (data.has(k) ? data.get(k).length : 0) + String(v).length;
      if (next > quota) {
        throw new Error('QuotaExceededError');
      }
      used = next;
      data.set(k, String(v));
    },
    removeItem(k) {
      if (blocked) {
        throw new Error('SecurityError');
      }
      used -= data.has(k) ? data.get(k).length : 0;
      data.delete(k);
    },
  };
}

test('what is set is got back, and a fallback answers for what was never set', () => {
  const s = createStore(fake());
  assert.equal(s.persistent, true);
  assert.equal(s.get('names', 'none'), 'none');
  assert.equal(s.set('names', 'Sam\nAna'), true);
  assert.equal(s.get('names', ''), 'Sam\nAna');
  s.set('winners', 2);
  assert.equal(s.get('winners', 1), 2);
  s.remove('winners');
  assert.equal(s.get('winners', 1), 1);
});

test('it survives a reload: a second store on the same storage sees the first one\'s work', () => {
  const storage = fake();
  createStore(storage).set('title', 'Friday heat');
  assert.equal(createStore(storage).get('title', ''), 'Friday heat');
});

test('blocked storage: the page works, remembers for the life of the page, and says it is not keeping anything', () => {
  for (const storage of [fake({ blocked: true }), null, undefined]) {
    const s = createStore(storage);
    assert.equal(s.persistent, false);
    assert.equal(s.set('names', 'Sam'), false);
    assert.equal(s.get('names', ''), 'Sam', 'held in memory');
    s.log.add({ id: 1 });
    assert.equal(s.log.list().length, 1);
    s.forget();
    assert.equal(s.get('names', ''), '');
  }
});

test('a full quota: the newest value wins, from memory, and the caller is told it was not kept', () => {
  const storage = fake({ quota: 200 });
  const s = createStore(storage);
  assert.equal(s.set('names', 'short'), true);
  assert.equal(s.set('logos', 'x'.repeat(5000)), false);
  assert.equal(s.get('logos', '').length, 5000, 'still readable, from memory');
  assert.equal(s.persistent, true);
  assert.ok(s.failure instanceof Error);
  /* An older stored value does not come back over a newer one that could not be written. */
  assert.equal(s.set('names', 'x'.repeat(5000)), false);
  assert.equal(s.get('names', '').length, 5000);
});

test('a damaged value is as good as absent', () => {
  const storage = fake();
  const s = createStore(storage);
  storage.data.set('webfpv-picker/v1/names', '{not json');
  assert.equal(s.get('names', 'fallback'), 'fallback');
  storage.data.set('webfpv-picker/v1/log', '"a string, not a list"');
  assert.deepEqual(s.log.list(), []);
  storage.data.set('webfpv-picker/v1/log', '[1, null, {"a": 1}]');
  assert.deepEqual(s.log.list(), [{ a: 1 }].map((x) => x));
});

test('the draw log: newest first, a receipt comes back whole, and it keeps the last fifty', async () => {
  const s = createStore(fake());
  const names = ['Sam', 'Ana', 'Raj'];
  const first = await drawWithSeed(names, '11'.repeat(32), { title: 'one', now: new Date('2026-10-03T10:00:00Z') });
  const second = await drawWithSeed(names, '22'.repeat(32), { title: 'two', now: new Date('2026-10-03T10:05:00Z') });
  s.log.add(first);
  s.log.add(second);
  const listed = s.log.list();
  assert.deepEqual(listed.map((r) => r.title), ['two', 'one']);
  assert.deepEqual(listed[1], first, 'what was written is what is read, field for field');
  for (let i = 0; i < 60; i += 1) {
    s.log.add({ ...first, title: `t${i}` });
  }
  assert.equal(s.log.list().length, LOG_LIMIT);
  assert.equal(s.log.list()[0].title, 't59');
  s.log.clear();
  assert.deepEqual(s.log.list(), []);
});

test('forget takes what a person typed or dropped and leaves the preferences', () => {
  const s = createStore(fake());
  s.set('names', 'Sam');
  s.set('title', 'T');
  s.set('logos', [1]);
  s.set('sound', true);
  s.set('length', 60);
  s.log.add({ a: 1 });
  s.forget();
  assert.equal(s.get('names', ''), '');
  assert.equal(s.get('title', ''), '');
  assert.deepEqual(s.get('logos', []), []);
  assert.deepEqual(s.log.list(), []);
  assert.equal(s.get('sound', false), true);
  assert.equal(s.get('length', 30), 60);
});

test('asking the page for its storage never throws', () => {
  assert.doesNotThrow(() => pageStorage());
  assert.equal(pageStorage(), null, 'Node has none');
});
