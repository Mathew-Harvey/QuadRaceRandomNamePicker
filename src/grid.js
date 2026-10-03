/*
 * grid.js: the start blocks behind the first row.
 *
 * The first row is the world's own. A track document has to carry exactly one
 * startPads, and src/layout.js makes it nine stands, one to a lane, so the
 * simulator's field builds the front row itself and bakes it into its merged
 * scenery. That row is always there, empty or full, as a start line is.
 *
 * The rows behind it exist only when there are more than nine names, and
 * only for the names there are, so this builds them: the simulator's own
 * stand (sim/src/art/startblock.js, two foam topped rails at 28 degrees),
 * one per slot of rows two onward, merged by material into one mesh each
 * and rebuilt whenever the count changes. The count changes when a person
 * types, which is rarely and never in a frame that is flying, so a rebuild
 * of a few thousand triangles is the right size of solution and an instanced
 * mesh, which the world's ink prepass cannot see (src/fleet.js says why),
 * is not.
 *
 * Every stand is turned to the line's own heading, which is the way the quad
 * sets off: the stand's -z is its low end.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from '../sim/src/render/celmat.js';
import {
  assembleStartBlock, START_BLOCK_FOAM, START_BLOCK_LIP, START_BLOCK_WOOD, START_BLOCK_WOOD_DARK,
} from '../sim/src/art/startblock.js';
import { PAD_SIZE } from './layout.js';
import { toThree } from './frame.js';

export function buildGrid({ course }) {
  const group = new THREE.Group();
  group.name = 'grid';
  /* The same four materials the world builds its own stands from. */
  const mats = {
    wood: celMaterial({ color: START_BLOCK_WOOD, rim: 0.18 }),
    base: celMaterial({ color: START_BLOCK_WOOD_DARK, rim: 0.16 }),
    foam: celMaterial({ color: START_BLOCK_FOAM, rim: 0.12 }),
    lip: celMaterial({ color: START_BLOCK_LIP, rim: 0.24 }),
  };

  /* One stand, baked: its meshes' geometry in the stand's own frame, by material. */
  const stand = assembleStartBlock(THREE, PAD_SIZE, mats);
  stand.updateMatrixWorld(true);
  const parts = new Map();
  stand.traverse((o) => {
    if (!o.isMesh) {
      return;
    }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') {
        g.deleteAttribute(name);
      }
    }
    g.applyMatrix4(o.matrixWorld);
    if (!parts.has(o.material)) {
      parts.set(o.material, []);
    }
    parts.get(o.material).push(g);
  });
  const one = new Map();
  for (const [material, geos] of parts) {
    one.set(material, mergeGeometries(geos, false));
    for (const g of geos) {
      g.dispose();
    }
  }

  let meshes = [];
  let built = -1;
  const at = {};
  const position = {};
  const place = new THREE.Matrix4();
  const turn = new THREE.Matrix4();

  function clear() {
    for (const m of meshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    meshes = [];
  }

  /* Stands for rows two onward of a grid of n. Row one is the world's. */
  function setCount(n) {
    if (n === built) {
      return;
    }
    built = n;
    clear();
    const extra = (n ? course.grid(n) : []).filter((slot) => slot.row >= 1);
    if (!extra.length) {
      return;
    }
    for (const [material, base] of one) {
      const geos = extra.map((slot) => {
        course.place(slot.s0, slot.u0, 0, at);
        toThree(at.x, at.y, 0, position);
        /* The stand's low end, local -z, points the way of travel: R_y(yaw) takes (0, 0, -1) to (tx, 0, -ty). */
        turn.makeRotationY(Math.atan2(-at.tx, at.ty));
        place.makeTranslation(position.x, 0, position.z).multiply(turn);
        return base.clone().applyMatrix4(place);
      });
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
      for (const g of geos) {
        g.dispose();
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
  }

  return {
    group,
    setCount,
    dispose() {
      clear();
      for (const g of one.values()) {
        g.dispose();
      }
      for (const m of Object.values(mats)) {
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}
