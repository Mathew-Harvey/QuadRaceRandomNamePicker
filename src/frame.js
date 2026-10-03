/*
 * frame.js: the one place the plan's frame becomes Three.js's.
 *
 * The plan (src/course.js, src/choreo.js) is metres, seconds and radians, Z
 * up and right handed, with the oval's long axis along X. Three.js is Y up.
 * The conversion is a quarter turn about X, (x, y, z) to (x, z, -y), which
 * keeps the frame right handed, and it is made here and nowhere else: a pose
 * leaves the plan through toThree and a point comes back through fromThree,
 * and no other file swaps an axis. A sign error in yaw two months from now
 * traces back to a second place doing this by hand.
 *
 * It is also exactly the conversion the simulator's own document reader
 * makes (sim/src/game/trackdoc.js, toScene): a document point (x, y) with the
 * field's middle at the origin becomes scene (x, -y), and an elevation z
 * becomes scene y. The track document in src/layout.js is built in the
 * plan's frame, so a flag the plan puts at (30, 12) stands at scene (30, -12),
 * which is where toThree puts a quad flying past it.
 *
 * This file imports nothing, so it runs in Node, where tests/frame.test.js
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

/* A point or a direction, plan to Three, written into `out` (any object with x, y, z). */
export function toThree(x, y, z, out = {}) {
  out.x = x;
  out.y = z;
  out.z = -y;
  return out;
}

/* A point or a direction, Three to plan. */
export function fromThree(x, y, z, out = {}) {
  out.x = x;
  out.y = -z;
  out.z = y;
  return out;
}

/*
 * The 3 by 3 that turns a quad's body axes into Three's, as a column major
 * array of 16 for Matrix4.set's sibling, Matrix4.fromArray, with the position
 * in the last column.
 *
 * The body is the simulator's airframe: front is -Z, up is +Y, right is +X
 * (sim/src/render/herocraft.js). The plan hands over the thrust axis (which
 * way is up for the quad: acceleration minus gravity, normalised) and the
 * heading (which way the nose goes, flat). The nose is the heading taken off
 * the thrust axis so the two are exactly perpendicular, which is the
 * smallest correction that keeps both promises.
 *
 *   pose     the plan's pose, as choreo.js's pose() fills it: x y z, tx ty tz,
 *            fx fy, wobble, flip, all in the plan's frame
 *   scale    the fleet's scale, one number
 *   out      a 16 element array, filled and returned
 *
 * The wobble is a roll about the nose, damped, which is what a quad does
 * when its pilot touches a flag. The flip is a forward flip about the
 * quad's own right axis, nose down and over, one full turn.
 */
export function quadMatrix(pose, scale, out = new Array(16)) {
  /* Up, in Three's frame, made a unit vector: a pose blended between two others is not one. */
  let ux = pose.tx;
  let uy = pose.tz;
  let uz = -pose.ty;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  /* The heading in Three's frame, flat. */
  const hx = pose.fx;
  const hy = 0;
  const hz = -pose.fy;
  /* Nose: the heading with its component along up removed. */
  const d = hx * ux + hy * uy + hz * uz;
  let nx = hx - d * ux;
  let ny = hy - d * uy;
  let nz = hz - d * uz;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  /* Right is nose cross up, so that nose (0, 0, -1) and up (0, 1, 0) give (1, 0, 0). */
  let rx = ny * uz - nz * uy;
  let ry = nz * ux - nx * uz;
  let rz = nx * uy - ny * ux;

  if (pose.wobble) {
    /* A roll about the nose by `wobble` radians. */
    const c = Math.cos(pose.wobble);
    const s = Math.sin(pose.wobble);
    const px = rx * c + ux * s;
    const py = ry * c + uy * s;
    const pz = rz * c + uz * s;
    const qx = ux * c - rx * s;
    const qy = uy * c - ry * s;
    const qz = uz * c - rz * s;
    rx = px;
    ry = py;
    rz = pz;
    ux = qx;
    uy = qy;
    uz = qz;
  }
  if (pose.flip) {
    /* A forward flip about right: nose goes down, up goes forward. */
    const c = Math.cos(pose.flip);
    const s = Math.sin(pose.flip);
    const px = ux * c + nx * s;
    const py = uy * c + ny * s;
    const pz = uz * c + nz * s;
    const qx = nx * c - ux * s;
    const qy = ny * c - uy * s;
    const qz = nz * c - uz * s;
    ux = px;
    uy = py;
    uz = pz;
    nx = qx;
    ny = qy;
    nz = qz;
  }
  /* Columns: right, up, back (the body's +Z is behind the nose), then the position. */
  out[0] = rx * scale;
  out[1] = ry * scale;
  out[2] = rz * scale;
  out[3] = 0;
  out[4] = ux * scale;
  out[5] = uy * scale;
  out[6] = uz * scale;
  out[7] = 0;
  out[8] = -nx * scale;
  out[9] = -ny * scale;
  out[10] = -nz * scale;
  out[11] = 0;
  out[12] = pose.x;
  out[13] = pose.z;
  out[14] = -pose.y;
  out[15] = 1;
  return out;
}
