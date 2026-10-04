/*
 * marks.js: the sponsors' marks sprayed on the infield grass, and turned to
 * face whichever camera is looking.
 *
 * The simulator can paint a mark into its pitch (a groundLogo in the track
 * document), and the first version of this app used that, but what it paints
 * is fixed to the ground and a mark fixed to the ground is foreshortened by
 * the angle a camera sees it at: from the paddock's orbit and from the
 * aerial a circle was a flat ellipse. So the marks are this app's own, in
 * the way the boards are, and src/spray.js says where each corner of each
 * one lies on the grass for the camera of this frame. This file is the part
 * with meshes in it: one plane to a place, six of them, each cut into rows so
 * that the picture stays straight across a trapezoid, and a call to put
 * them where the lens says before the frame is drawn.
 *
 * HOW THEY ARE DRAWN. Layer 1, the simulator's no ink layer: the outline
 * prepass draws layer 0 with its own opaque material, so a plane a few
 * centimetres over the turf would be a solid slab there and ink its own
 * border, and depthWrite false keeps promoteToPrepass (sim/src/render/post.js)
 * from putting it in the depth half as well. It is paint and not an occluder.
 * The material is the pitch's own family (a cel ramp, the same cloud shadow,
 * the shadow map) at the opacity the simulator paints a ground logo at
 * (GROUND_INK), so a mark takes the light the grass takes and the mower's
 * stripes show faintly through it.
 *
 * ORDER. Drawn after the pitch, which is a transparent mesh at render order
 * 0, and before the fleet's translucent discs, which are at 1: the marks are
 * at one half. Without that a mark could be sorted behind the pitch by the
 * distance of its middle and not be seen, or after a quad's discs, which
 * write no depth, and paint over them. Every mesh is on frustumCulled false,
 * because the geometry moves with the camera and its bounding sphere would
 * be stale.
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
import { celMaterial } from '../sim/src/render/celmat.js';
import { GROUND_INK } from '../sim/src/art/banners.js';
import {
  MARK, markPlan, markTopology, sprayMark,
} from './spray.js';

/*
 * Build the marks.
 *
 *   course      from makeCourse()
 *   logos       [{ image, aspect }]: the canvases to spray, and their width over height; none for no marks
 *   anisotropy  the renderer's maximum, so a mark seen at a slant stays sharp
 *   ground      the height the group stands at (the rig's lift), which the eye's height is taken from
 *
 * Returns { group, count, aim(camera), dispose() }. `aim` is called once a
 * frame, after the camera has been put where the shot says and before the
 * frame is drawn.
 */
export function buildMarks({
  course, logos = [], anisotropy = 4, ground = 0,
}) {
  const group = new THREE.Group();
  group.name = 'marks';
  const plan = markPlan(course, logos.map((logo) => logo.aspect));
  const rows = MARK.rows;
  const verts = (rows + 1) * 2;

  const textures = logos.map((logo) => {
    const texture = new THREE.CanvasTexture(logo.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  });
  const materials = textures.map((map, i) => {
    const material = celMaterial({
      color: 0xffffff, rim: 0, cloudShadow: 0.34, transparent: true, opacity: GROUND_INK, map, key: `picker-mark-${i}`,
    });
    material.depthWrite = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    return material;
  });

  /* What never changes: the picture's coordinates at each vertex, the triangles, and the plane facing up. */
  const topology = markTopology(rows);
  const normal = new Float32Array(verts * 3);
  for (let i = 0; i < verts; i += 1) {
    normal[i * 3 + 1] = 1;
  }
  const uvAttribute = new THREE.BufferAttribute(topology.uv, 2);
  const normalAttribute = new THREE.BufferAttribute(normal, 3);
  const indexAttribute = new THREE.BufferAttribute(topology.index, 1);

  const marks = plan.map((spot, i) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('normal', normalAttribute);
    geometry.setAttribute('uv', uvAttribute);
    geometry.setIndex(indexAttribute);
    const mesh = new THREE.Mesh(geometry, materials[spot.design]);
    mesh.name = `mark-${i}`;
    mesh.layers.set(1);
    mesh.renderOrder = 0.5;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { spot, mesh, positions, kept: 0 };
  });

  const eye = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function aim(camera) {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    right.set(e[0], e[1], e[2]);
    up.set(e[4], e[5], e[6]);
    forward.set(-e[8], -e[9], -e[10]);
    eye.set(e[12], e[13] - ground, e[14]);
    for (const mark of marks) {
      mark.kept = sprayMark(mark.positions.array, eye, right, up, forward, mark.spot, rows);
      mark.mesh.visible = mark.kept > 0;
      if (mark.kept > 0) {
        mark.positions.needsUpdate = true;
      }
    }
  }

  return {
    group,
    count: marks.length,
    aim,
    dispose() {
      for (const mark of marks) {
        mark.mesh.geometry.dispose();
      }
      for (const texture of textures) {
        texture.dispose();
      }
      for (const material of materials) {
        material.dispose();
      }
      group.removeFromParent();
    },
  };
}
