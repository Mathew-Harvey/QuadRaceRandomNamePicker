/*
 * fleet.js: up to fifty of the simulator's five inch quads, drawn in a
 * handful of calls.
 *
 * THE AIRFRAME IS THE SIMULATOR'S. buildHeroCraft is 65 meshes and about 45
 * materials, all procedural, and nothing in it is instanced, so fifty
 * copies would be three to four thousand draw calls before the ink doubled
 * them. This builds one, walks it once, bakes every mesh into the airframe's
 * own frame and merges what shares a material into one geometry, and draws
 * the fleet as an InstancedMesh per material: about forty draws for any
 * number of quads, with every material the simulator's own, its rim light
 * and its specular catch included.
 *
 * THE LIVERY IS AN INSTANCE COLOUR. The canopy, the front props, the front
 * discs and the front LED bars multiply their white material by a colour per
 * quad (src/livery.js); the frame, the arms, the battery and the rear props
 * stay carbon, so a quad reads as a colour on a dark body and its nose is
 * always the coloured end.
 *
 * THE PROPS SPIN, and the rest of a quad does not. Each rotor is its own
 * instance, turned about its own axis by a phase the fleet advances, so a
 * quad on the grid can idle with blades you can see and a quad at race speed
 * shows only its discs.
 *
 * THE INK. The post chain inks what it finds in a normal and depth prepass,
 * and the prepass overrides every material with one that has no idea what an
 * instance is, so a quad drawn by instancing would be drawn at the origin in
 * the prepass, and the world's own ink lines (a board's frame, the treeline)
 * would run straight through every quad. So the fleet keeps itself off the
 * layers the prepass draws, and draws itself into the same normal and depth
 * target afterward with a material that does understand instances, in one
 * call (every body part merged into a single geometry), through the same
 * packing. The wrap is around the composer's render, which is a public
 * property of the object post.js returns; nothing in sim/ is touched.
 *
 * LAYERS. Layer 4 is the fleet in the colour pass, enabled on the camera by
 * attachPrepass. Layer 5 is the one proxy that writes the geometry buffer,
 * and only that pass looks at it.
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
import { buildHeroCraft, PROP_SPIN } from '../sim/src/render/herocraft.js';
import { startBlockDims } from '../sim/src/art/startblock.js';
import { PAD_SIZE, FLEET_SCALE } from './layout.js';
import { liveryHex } from './livery.js';
import { quadMatrix } from './frame.js';

export const MAX_QUADS = 50;
export const FLEET_LAYER = 4;
export const GEO_LAYER = 5;

/* The sakura the simulator paints its canopy: the one body material that takes the livery. */
const CANOPY_HEX = 0xe8a8b8;
/* How long, from the moment the race clock starts, a quad takes to go from its block's pose to the plan's. */
const LIFT_OFF = 0.25;

const jerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));

/* A geometry with only what the fleet needs, non indexed, so any two can be merged. */
function plain(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') {
      g.deleteAttribute(name);
    }
  }
  if (!g.attributes.normal) {
    g.computeVertexNormals();
  }
  return g;
}

/* The mesh's geometry in the airframe's frame (the group's origin), with the mesh's own transform baked in. */
function baked(mesh, relativeTo) {
  const g = plain(mesh.geometry);
  if (relativeTo) {
    g.applyMatrix4(new THREE.Matrix4().copy(relativeTo).invert().multiply(mesh.matrixWorld));
  } else {
    g.applyMatrix4(mesh.matrixWorld);
  }
  return g;
}

/* Where the pose in the plan's frame puts a quad resting on a start block: nose down at the ramp's angle. */
function blockPose(course, slot, out = {}) {
  const dims = startBlockDims(PAD_SIZE);
  const at = {};
  course.place(slot.s0, slot.u0, 0, at);
  const sit = dims.baseH + dims.rise * 0.5 + dims.railT + dims.foamT + 0.004 * FLEET_SCALE;
  const tilt = dims.tilt;
  /* Up leans back from the way the nose points by the ramp's angle. */
  out.x = at.x;
  out.y = at.y;
  out.z = sit;
  out.tx = -Math.sin(tilt) * at.tx;
  out.ty = -Math.sin(tilt) * at.ty;
  out.tz = Math.cos(tilt);
  out.fx = at.tx;
  out.fy = at.ty;
  out.wobble = 0;
  out.flip = 0;
  return out;
}

const GEO_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying float vViewDepth;
  void main() {
    mat4 im = instanceMatrix;
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    vNormalView = normalMatrix * (mat3(im) * normal);
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/* post.js's own packing, line for line, so the ink pass cannot tell a quad from a gate. */
const GEO_FRAGMENT = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  varying vec3 vNormalView;
  varying float vViewDepth;
  vec2 packDepth16(float v) {
    vec2 r = vec2(v, fract(v * 255.0));
    r.x -= r.y / 255.0;
    return r;
  }
  void main() {
    float d = clamp((vViewDepth - uNear) / (uFar - uNear), 0.0, 1.0);
    vec3 n = normalize(vNormalView);
    gl_FragColor = vec4(n.xy * 0.5 + 0.5, packDepth16(d));
  }
`;

export function buildFleet({ course }) {
  const craft = buildHeroCraft({ lite: true, fog: true });
  craft.group.updateMatrixWorld(true);
  const rotors = craft.blades;
  const isRotorChild = (o) => rotors.includes(o.parent);

  /* ---- Walk the airframe once: buckets by material, and the two rotors' blades. ---- */
  const buckets = new Map();
  const proxyParts = [];
  const bladeGeos = { front: [], rear: [] };
  const discGeos = { front: [], rear: [] };
  const ledGeos = { front: [], rear: [] };
  const discSet = new Map(craft.discs.map((d, k) => [d, k]));
  const ledSet = new Map(craft.leds.map((l) => [l.mesh, l]));
  let tinted = 0;

  craft.group.traverse((o) => {
    if (!o.isMesh || o === craft.group) {
      return;
    }
    if (discSet.has(o)) {
      const front = craft.leds[discSet.get(o)].front;
      discGeos[front ? 'front' : 'rear'].push(baked(o));
      return;
    }
    if (ledSet.has(o)) {
      const led = ledSet.get(o);
      ledGeos[led.front ? 'front' : 'rear'].push(baked(o));
      proxyParts.push(baked(o));
      return;
    }
    if (isRotorChild(o) && o.material !== o.parent.children[0].material) {
      /* A blade, in its rotor's own frame: the one geometry both of that kind of rotor share. */
      const m = rotors.indexOf(o.parent);
      const front = craft.leds[m].front;
      const rel = new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(o.matrixWorld);
      const g = plain(o.geometry);
      g.applyMatrix4(rel);
      if (m === (front ? 1 : 0)) {
        bladeGeos[front ? 'front' : 'rear'].push(g);
      }
      return;
    }
    /* Everything else is the body, including the hubs. */
    const key = o.material;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    const g = baked(o);
    buckets.get(key).push(g);
    proxyParts.push(baked(o));
  });

  const matrices = new THREE.InstancedBufferAttribute(new Float32Array(MAX_QUADS * 16), 16);
  matrices.setUsage(THREE.DynamicDrawUsage);
  const colours = new THREE.InstancedBufferAttribute(new Float32Array(MAX_QUADS * 3).fill(1), 3);
  colours.setUsage(THREE.DynamicDrawUsage);

  const group = new THREE.Group();
  group.name = 'fleet';
  const meshes = [];
  const shadowers = new Set([0x1c241e, 0x161c18]);

  const instanced = (geometry, material, { colour = false, own = null, shadows = false, order = 0 } = {}) => {
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_QUADS);
    mesh.instanceMatrix = own || matrices;
    mesh.instanceColor = colour ? colours : null;
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    mesh.renderOrder = order;
    mesh.layers.set(FLEET_LAYER);
    mesh.count = 0;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) {
      g.dispose();
    }
    const takesLivery = material.isMeshToonMaterial && material.color.getHex() === CANOPY_HEX;
    if (takesLivery) {
      /* White, so the instance colour is the colour: the cel material's rim and specular stay as they were. */
      material.color.setHex(0xffffff);
      tinted += 1;
    }
    const shadows = material.isMeshToonMaterial && shadowers.has(material.color.getHex());
    instanced(merged, material, { colour: takesLivery, shadows: shadows || takesLivery });
  }
  if (!tinted) {
    throw new Error('fleet: the airframe has no sakura canopy to take the livery. The simulator changed its colours; find the canopy again.');
  }

  /* The front LED bars take the livery, the rear stay the simulator's mint. */
  const ledMaterial = (hex, fog = true) => new THREE.MeshBasicMaterial({ color: hex, fog });
  instanced(mergeGeometries(ledGeos.front, false), ledMaterial(0xffffff), { colour: true });
  instanced(mergeGeometries(ledGeos.rear, false), ledMaterial(0x7dffb4));

  /* Discs: faint at rest, a little stronger once the props are a blur. */
  const discMaterial = (hex) => new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.14, depthWrite: false, fog: true,
  });
  const frontDiscMaterial = discMaterial(0xffffff);
  const rearDiscMaterial = discMaterial(0x5a6558);
  instanced(mergeGeometries(discGeos.front, false), frontDiscMaterial, { colour: true, order: 1 });
  instanced(mergeGeometries(discGeos.rear, false), rearDiscMaterial, { order: 1 });

  /* Blades: two per rotor kind per quad, each with a matrix of its own so it can turn. */
  const bladeMatrices = {
    front: new THREE.InstancedBufferAttribute(new Float32Array(MAX_QUADS * 2 * 16), 16),
    rear: new THREE.InstancedBufferAttribute(new Float32Array(MAX_QUADS * 2 * 16), 16),
  };
  bladeMatrices.front.setUsage(THREE.DynamicDrawUsage);
  bladeMatrices.rear.setUsage(THREE.DynamicDrawUsage);
  const propMaterials = { front: null, rear: null };
  for (const m of [1, 0]) {
    const front = craft.leds[m].front;
    const blade = rotors[m].children.find((c) => c.material !== rotors[m].children[0].material);
    propMaterials[front ? 'front' : 'rear'] = blade.material;
  }
  propMaterials.front.color.setHex(0xffffff);
  const bladeMeshes = {
    front: instanced(mergeGeometries(bladeGeos.front, false), propMaterials.front, { colour: false, own: bladeMatrices.front }),
    rear: instanced(mergeGeometries(bladeGeos.rear, false), propMaterials.rear, { own: bladeMatrices.rear }),
  };
  /* The front blades take the livery through a colour attribute of their own, two instances to a quad. */
  const bladeColours = new THREE.InstancedBufferAttribute(new Float32Array(MAX_QUADS * 2 * 3).fill(1), 3);
  bladeMeshes.front.instanceColor = bladeColours;

  /* The rotors' places in the airframe, and which way each turns. */
  const rotorAt = rotors.map((r, m) => ({
    x: r.matrixWorld.elements[12],
    y: r.matrixWorld.elements[13],
    z: r.matrixWorld.elements[14],
    spin: PROP_SPIN[m],
    front: craft.leds[m].front,
    slot: 0,
  }));
  {
    const seen = { front: 0, rear: 0 };
    for (const r of rotorAt) {
      r.slot = seen[r.front ? 'front' : 'rear'];
      seen[r.front ? 'front' : 'rear'] += 1;
    }
  }

  /* The proxy that writes the geometry buffer: every body part in one geometry, one draw. */
  const proxyGeometry = mergeGeometries(proxyParts, false);
  for (const g of proxyParts) {
    g.dispose();
  }
  const geoMaterial = new THREE.ShaderMaterial({
    uniforms: { uNear: { value: 0.2 }, uFar: { value: 2600 } },
    vertexShader: GEO_VERTEX,
    fragmentShader: GEO_FRAGMENT,
  });
  const proxy = new THREE.InstancedMesh(proxyGeometry, geoMaterial, MAX_QUADS);
  proxy.instanceMatrix = matrices;
  proxy.frustumCulled = false;
  proxy.layers.set(GEO_LAYER);
  proxy.count = 0;
  group.add(proxy);

  /* The session's own aircraft, built for the walk, is not drawn: only its pieces are. */
  craft.group.traverse((o) => {
    if (o.isMesh && o.geometry) {
      o.geometry.dispose();
    }
  });

  /* ---- State. ---- */
  let count = 0;
  let slots = [];
  let phase = 0;
  const pose = {};
  const park = {};
  const base = new Array(16);
  const positions = new Float32Array(MAX_QUADS * 3);
  const mat = matrices.array;
  const rotorArrays = { front: bladeMatrices.front.array, rear: bladeMatrices.rear.array };
  const rgb = new THREE.Color();

  function setCount(n) {
    count = Math.max(0, Math.min(MAX_QUADS, n));
    slots = count ? course.grid(count) : [];
    for (const m of meshes) {
      m.count = count;
    }
    bladeMeshes.front.count = count * 2;
    bladeMeshes.rear.count = count * 2;
    proxy.count = count;
  }

  /* The livery of every entry, from its number: written once when the list changes, not per frame. */
  function setLiveries(n = count) {
    for (let i = 0; i < n; i += 1) {
      rgb.setHex(liveryHex(i));
      colours.setXYZ(i, rgb.r, rgb.g, rgb.b);
      bladeColours.setXYZ(i * 2, rgb.r, rgb.g, rgb.b);
      bladeColours.setXYZ(i * 2 + 1, rgb.r, rgb.g, rgb.b);
    }
    colours.needsUpdate = true;
    bladeColours.needsUpdate = true;
  }

  /*
   * Put every quad where it is at race time t.
   *
   *   plan     from makePlan, or null for the grid
   *   t        seconds on the race clock; below zero is the grid
   *   spin     how fast the blades turn, radians a second; zero is still
   *   dt       wall seconds since the last call, for the blades' phase
   *   discs    the discs' opacity, which rises as the props blur
   *
   * A spin of 400 or more is a blur: the blades are hidden and the discs say so.
   */
  function place({ plan = null, t = -1, spin = 0, dt = 0, discs = 0.14 }) {
    phase += spin * dt;
    frontDiscMaterial.opacity = discs;
    rearDiscMaterial.opacity = discs;
    for (let i = 0; i < count; i += 1) {
      blockPose(course, slots[i], park);
      let source = park;
      if (plan && t >= 0) {
        plan.pose(i, Math.min(t, plan.duration), pose);
        if (t < LIFT_OFF) {
          const w = jerk(t / LIFT_OFF);
          /* Block to plan: the pose's numbers blended, and re-normalised by quadMatrix. */
          for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'fx', 'fy']) {
            pose[k] = park[k] + (pose[k] - park[k]) * w;
          }
        }
        source = pose;
      }
      quadMatrix(source, FLEET_SCALE, base);
      for (let k = 0; k < 16; k += 1) {
        mat[i * 16 + k] = base[k];
      }
      positions[i * 3] = source.x;
      positions[i * 3 + 1] = source.z;
      positions[i * 3 + 2] = -source.y;
      /* Each rotor: the airframe's matrix, moved to its motor and turned about its own axis. */
      for (let m = 0; m < 4; m += 1) {
        const r = rotorAt[m];
        const arr = rotorArrays[r.front ? 'front' : 'rear'];
        const o = (i * 2 + r.slot) * 16;
        const angle = r.spin * phase + i * 1.3 + m * 0.7;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        arr[o] = base[0] * c - base[8] * s;
        arr[o + 1] = base[1] * c - base[9] * s;
        arr[o + 2] = base[2] * c - base[10] * s;
        arr[o + 3] = 0;
        arr[o + 4] = base[4];
        arr[o + 5] = base[5];
        arr[o + 6] = base[6];
        arr[o + 7] = 0;
        arr[o + 8] = base[0] * s + base[8] * c;
        arr[o + 9] = base[1] * s + base[9] * c;
        arr[o + 10] = base[2] * s + base[10] * c;
        arr[o + 11] = 0;
        arr[o + 12] = base[12] + base[0] * r.x + base[4] * r.y + base[8] * r.z;
        arr[o + 13] = base[13] + base[1] * r.x + base[5] * r.y + base[9] * r.z;
        arr[o + 14] = base[14] + base[2] * r.x + base[6] * r.y + base[10] * r.z;
        arr[o + 15] = 1;
      }
    }
    matrices.needsUpdate = true;
    bladeMatrices.front.needsUpdate = true;
    bladeMatrices.rear.needsUpdate = true;
    /* At race speed the blades are a blur and the discs say so; the blades go. */
    const visible = spin < 400;
    bladeMeshes.front.visible = visible;
    bladeMeshes.rear.visible = visible;
  }

  /*
   * Draw the fleet into the post chain's normal and depth target, after the
   * world's own prepass and before the ink pass reads it. See the header.
   */
  function attachPrepass(post, renderer, scene, camera) {
    camera.layers.enable(FLEET_LAYER);
    const composer = post && post.composer;
    if (!composer || !post.normalTarget) {
      return false;
    }
    const original = composer.render.bind(composer);
    composer.render = (deltaTime) => {
      if (count > 0) {
        const target = renderer.getRenderTarget();
        const auto = renderer.autoClear;
        const mask = camera.layers.mask;
        const background = scene.background;
        const fog = scene.fog;
        const shadowAuto = renderer.shadowMap.autoUpdate;
        geoMaterial.uniforms.uNear.value = camera.near;
        geoMaterial.uniforms.uFar.value = camera.far;
        scene.background = null;
        scene.fog = null;
        renderer.shadowMap.autoUpdate = false;
        renderer.autoClear = false;
        renderer.setRenderTarget(post.normalTarget);
        camera.layers.mask = 1 << GEO_LAYER;
        renderer.render(scene, camera);
        camera.layers.mask = mask;
        renderer.setRenderTarget(target);
        renderer.autoClear = auto;
        renderer.shadowMap.autoUpdate = shadowAuto;
        scene.background = background;
        scene.fog = fog;
      }
      original(deltaTime);
    };
    return true;
  }

  function dispose() {
    for (const m of meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    proxy.geometry.dispose();
    proxy.dispose();
    geoMaterial.dispose();
    group.removeFromParent();
  }

  return {
    group, proxy, setCount, setLiveries, place, attachPrepass, dispose, positions,
    get count() {
      return count;
    },
    get slots() {
      return slots;
    },
  };
}
