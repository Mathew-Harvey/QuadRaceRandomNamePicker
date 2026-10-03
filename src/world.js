/*
 * world.js: the join. The shell, the simulator's race field, its post chain,
 * and the things the picker puts in it: the gantry, the boards, the grid and
 * the fleet.
 *
 * It does for this app what sim/src/maps/custom.js does for "Your track" and
 * sim/src/share/orbit.js does for the board's thumbnails, and in the same
 * order: a document becomes a course, the course becomes a world, the world
 * gets its composer. Nothing here draws a field of its own.
 *
 *   doc    = buildDocument(...)                       src/layout.js
 *   course = courseFromDocument(doc), guide = null    sim/src/game/trackdoc.js
 *   shell  = buildShell(canvas)                       sim/src/render/shell.js
 *   map    = await buildFieldScene(shell, ...)        sim/src/render/scene.js
 *   post   = buildComposer(...)                       sim/src/render/post.js
 *   each frame: map.updateWind(t), then post.render()
 *
 * WHAT THE FIELD BRINGS THAT THE PICKER LEAVES ALONE. The session's own
 * aircraft, which buildFieldScene adds to the scene and which is hidden here.
 * The clubhouse, the treeline, the fence, the sky and the lighting, which are
 * the point. The ink pass and the grade, which are applied to everything on
 * layer 0.
 *
 * WHAT THE PICKER ADDS stands in one group, `rig`, lifted by the height of
 * the ground under the oval, because the field levels its pitch to a height
 * of its own and a quad at plan height 1.3 m is 1.3 m above that ground and
 * not above the world's origin.
 *
 * THE LOADING SCREEN'S ONLY CHANCE TO DRAW IS THE AWAITS. buildFieldScene
 * awaits whatever its progress callback returns, so the callback returns a
 * promise that waits for two frames and a task, which is the shortest
 * sequence that puts the pixels on the glass (sim/src/ui/loading.js says why
 * one frame is not enough). Without it the build is one long block of main
 * thread work and the setup sheet freezes under the pilot's fingers. A hidden
 * tab runs no frames, so the wait gives up after a quarter of a second rather
 * than holding the build until somebody looks.
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
import { buildShell } from '../sim/src/render/shell.js';
import { buildFieldScene } from '../sim/src/render/scene.js';
import { buildComposer } from '../sim/src/render/post.js';
import {
  applyPixelRatio, detectDefaultGraphics, normalizeGraphics, qualityFor,
} from '../sim/src/render/quality.js';
import { makeCourse } from './course.js';
import { buildCourseFor } from './layout.js';
import { buildGantry } from './gantry.js';
import { buildBoards } from './boards.js';
import { buildGrid } from './grid.js';
import { buildFleet } from './fleet.js';
import { makeShots, fovFor } from './camera.js';
import { toThree } from './frame.js';

function yieldToPaint() {
  const frames = new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  });
  const patience = new Promise((resolve) => {
    setTimeout(resolve, 250);
  });
  return Promise.race([frames, patience]);
}

/*
 * Build the world.
 *
 *   canvas      the page's canvas, which the shell makes a WebGL2 context on
 *   shell       an existing shell to reuse, when the world is being rebuilt
 *               for new sponsor marks and the context should live on
 *   graphics    'low', 'medium' or 'high'; the simulator's own detection when absent
 *   onProgress  called with 0 to 1 as the build advances
 *   logos       { boards: [{ image, base }], grass: [{ image }] }
 *
 * Throws what the shell throws when there is no WebGL, and the caller shows
 * the page that does not need it.
 */
export async function buildWorld({
  canvas, shell: existing = null, graphics = null, onProgress = null, logos = {},
}) {
  const quality = qualityFor(normalizeGraphics(graphics || detectDefaultGraphics()));
  const shell = existing || buildShell(canvas, { powerPreference: 'high-performance' });
  applyPixelRatio(shell, quality.id, 1);
  const { renderer, camera } = shell;

  const course = makeCourse();
  const simCourse = buildCourseFor({ course, logos: logos.grass || [] });
  const progress = onProgress || (() => {});
  /*
   * Chrome warns, once, when a canvas is read back more than once without
   * willReadFrequently, and the pitch's own surface is: it reads the whole
   * sheet to fade its edge, and does it again when a sponsor's mark has
   * decoded and the grass is repainted. The warning is right about the
   * pitch, and there is nothing to change in it from here, so the canvases
   * the build makes are made the way the warning asks. They are painted once
   * and uploaded, so a canvas that keeps its pixels in memory costs nothing.
   * The patch is on for the build and off again after it, so it is the
   * field's canvases and not the page's.
   */
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(type, attributes) {
    return getContext.call(this, type, type === '2d' ? { willReadFrequently: true, ...attributes } : attributes);
  };
  let map;
  try {
    map = await buildFieldScene(shell, async (f) => {
      progress(f * 0.9);
      await yieldToPaint();
    }, simCourse, quality);
  } finally {
    HTMLCanvasElement.prototype.getContext = getContext;
  }
  /* The session's own aircraft, which the field adds to the scene, is not part of this show. */
  shell.quad.visible = false;
  /* No gate is the target: every marker is dressed dark. Left alone, each flag wears the green cue the simulator draws round the next gate. */
  map.setNextGate(-1);

  const groundY = map.height(0, 0, -1e9);
  const rig = new THREE.Group();
  rig.name = 'picker-rig';
  rig.position.y = groundY;
  map.scene.add(rig);

  const gantry = buildGantry({ course });
  rig.add(gantry.group);
  const boards = buildBoards({
    course, logos: logos.boards || [], anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  rig.add(boards.group);
  const grid = buildGrid({ course });
  rig.add(grid.group);
  const fleet = buildFleet({ course });
  rig.add(fleet.group);
  await yieldToPaint();

  const post = buildComposer(renderer, map.scene, camera, quality);
  const size = shell.resize();
  post.setSize(size.w, size.h);
  fleet.attachPrepass(post, renderer, map.scene, camera);
  /* Compile what was added, so the first frame of the show is not the one that pays for its programs. */
  renderer.compile(map.scene, camera);
  progress(1);

  const shots = makeShots({ course });
  const view = {};
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const here = {};

  /* The plan frame to a Three vector, lifted by the ground. */
  const point = (p, out) => {
    toThree(p.x, p.y, p.z, here);
    return out.set(here.x, here.y + groundY, here.z);
  };

  function resize() {
    const d = shell.resize();
    post.setSize(d.w, d.h);
    return d;
  }

  /*
   * Put the camera where a shot says, and draw.
   *
   *   shot    'paddock' | 'aerial' | 'rail' | 'held'
   *   t       race clock, seconds; the paddock's orbit clock for 'paddock'
   *   k       0 to 1 along the aerial
   *   plan    from makePlan, or null on the grid
   *   count   how many quads are on the grid
   *   spin, dt, discs, wall   see fleet.place; wall is the cosmetic clock the flags and clouds run on
   *   lamps   [amber lit, green lit]
   */
  function frame({
    shot = 'paddock', t = 0, k = 0, plan = null, count = fleet.count, spin = 0, dt = 0, discs = 0.14, wall = 0, lamps = null,
  }) {
    if (count !== fleet.count) {
      fleet.setCount(count);
      fleet.setLiveries(count);
      grid.setCount(count);
    }
    /* The paddock's and the aerial's clocks are not the race's: the quads are on their blocks until the race shot says go. */
    const racing = Boolean(plan) && (shot === 'rail' || shot === 'held');
    fleet.place({ plan: racing ? plan : null, t: racing ? t : -1, spin, dt, discs });
    if (lamps) {
      gantry.setLamps(lamps[0], lamps[1]);
    }

    if (shot === 'paddock' || !plan) {
      shots.paddock(t, Math.max(count, 1), view);
    } else if (shot === 'aerial') {
      shots.aerial(k, plan, view);
    } else if (shot === 'held') {
      shots.held(plan, view);
    } else {
      shots.rail(plan, t, view);
    }
    point({ x: view.x, y: view.y, z: view.z }, eye);
    point({ x: view.tx, y: view.ty, z: view.tz }, target);
    camera.position.copy(eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const fov = fovFor(view.fov, camera.aspect);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    /* The sun's shadow box follows what is looked at. */
    focus.copy(target);
    map.updateShadowFocus(focus);
    map.updateWind(wall);
    post.render();
    return view;
  }

  function dispose() {
    fleet.dispose();
    grid.dispose();
    boards.dispose();
    gantry.dispose();
    rig.removeFromParent();
    post.dispose();
    map.dispose();
  }

  return {
    shell, renderer, camera, map, post, course, simCourse, quality, rig, groundY,
    gantry, boards, grid, fleet, shots,
    resize, frame, dispose,
  };
}
