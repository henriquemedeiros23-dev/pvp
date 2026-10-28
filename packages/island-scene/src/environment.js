// Sky (with clouds), sun, lights, the ground, the beach, the water and the foam at the shore.
import * as THREE from 'three';
import { noiseTexture, grassDetailTextures, waterNormalTexture, dataTexture } from './textures.js';
import { createGroundField, GROUND_COLORS } from './ground-field.js';
import { smoothstep } from './noise.js';

export const SKY = Object.freeze({
  horizon: '#d3e4ee', // light hazy blue near the ground (also the fog color)
  top: '#3a78cf',
  radius: 600,        // keep it inside the camera's far plane (the game uses 900)
  fogNear: 80,
  fogFar: 400,
});

export const SUN_OFFSET = Object.freeze({ x: -40, y: 70, z: -50 }); // light position, relative to the focus point

/** Water and beach numbers (y in meters). */
export const WATER = Object.freeze({
  level: -0.35, bob: 0.05,  // the water goes up and down a little
  color: '#1f86ad', opacity: 0.84,
  tile: 14,                 // meters per wave texture repeat
});

/**
 * The sky dome with the sun disc and a few clouds. It must move with the camera (see scene.update):
 * a fixed dome lets the far side poke out of the camera's far plane, and that hole
 * showed the black clear color (the "black triangle" of issue #17).
 * @param {{ random?: { next(): number }, mobile?: boolean }} [opts] random places the clouds (no random: no clouds)
 */
export function buildSky({ random = null, mobile = false } = {}) {
  const horizon = new THREE.Color(SKY.horizon), top = new THREE.Color(SKY.top);
  const group = new THREE.Group();
  group.name = 'sky';
  const geo = new THREE.SphereGeometry(SKY.radius, 32, 16);
  const pos = geo.attributes.position, cols = [];
  const sunDir = new THREE.Vector3(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z).normalize();
  const glow = new THREE.Color('#fff1d6'), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / SKY.radius);
    const c = horizon.clone().lerp(top, Math.pow(t, 0.55));
    // a warm glow around the sun
    const s = Math.max(0, p.fromBufferAttribute(pos, i).normalize().dot(sunDir));
    c.lerp(glow, Math.pow(s, 6) * 0.55);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  dome.renderOrder = -10; // drawn first, everything else on top
  dome.frustumCulled = false;
  group.add(dome);
  // the sun disc, inside the dome, in the same direction as the light
  const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false, depthWrite: false, toneMapped: false }));
  sun.position.copy(sunDir).multiplyScalar(SKY.radius * 0.85);
  sun.renderOrder = -9;
  group.add(sun);

  // clouds: puffy white blobs (one instanced mesh), far away and high up, inside the dome
  let clouds = null;
  if (random) {
    const count = mobile ? 9 : 16, puffs = mobile ? 4 : 6;
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const pp = puff.attributes.position, pc = [];
    for (let i = 0; i < pp.count; i++) { const k = 0.8 + 0.2 * Math.max(0, pp.getY(i)); pc.push(k * 0.93, k * 0.95, k); } // grey-blue bellies
    puff.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    clouds = new THREE.InstancedMesh(puff, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.92 }), count * puffs);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let n = 0;
    for (let c = 0; c < count; c++) {
      const a = random.next() * Math.PI * 2, d = 330 + random.next() * 170, y = 85 + random.next() * 90;
      const size = 14 + random.next() * 16;
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d, along = a + Math.PI / 2;
      for (let k = 0; k < puffs; k++) {
        const off = (k / (puffs - 1) - 0.5) * size * 2.6 + (random.next() - 0.5) * size * 0.5;
        const r = size * (0.55 + random.next() * 0.5) * (1 - Math.abs(k / (puffs - 1) - 0.5));
        v.set(cx + Math.cos(along) * off, y + (random.next() - 0.3) * size * 0.3, cz + Math.sin(along) * off);
        sc.set(r * 1.4 + 6, r * 0.55 + 3, r + 6);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        clouds.setMatrixAt(n++, m.compose(v, q, sc));
      }
    }
    clouds.renderOrder = -8;
    clouds.frustumCulled = false;
    clouds.name = 'clouds';
    group.add(clouds);
  }
  return { group, dome, sunDisc: sun, clouds, horizon, top };
}

/** Hemisphere light (sky blue from above, green bounce from the grass) plus the warm sun. Phones get no shadows. */
export function buildLights({ mobile = false } = {}) {
  const hemi = new THREE.HemisphereLight('#d4e4ff', '#9a9c78', 1.8);
  const sun = new THREE.DirectionalLight('#ffe9c8', 2.7);
  sun.position.set(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
  sun.castShadow = !mobile; // shadows cost a second drawing of the scene: desktop only
  sun.shadow.mapSize.set(mobile ? 512 : 2048, mobile ? 512 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  return { hemi, sun };
}

const DETAIL_TILE = 3.2; // meters per grass detail repeat (desktop also mixes in a 3.7x bigger one, so no repeats show)

/**
 * The ground disc: a big seeded color texture (lush and lighter grass patches, dirt around the ruins and on a few
 * paths, sand at the edge) times a small tiling grass detail texture. Then the beach sloping into the sea
 * (dry light sand, darker wet sand at the water line), the foam line and the water with moving waves.
 * @param {object} opts
 * @param {number} opts.islandRadius
 * @param {{ next(): number }} opts.random
 * @param {any[]} [opts.boxes] the ruins (for the worn dirt around them)
 * @param {boolean} [opts.mobile] smaller textures, one detail layer, no normal maps, cheaper materials
 * @param {ReturnType<typeof createGroundField>} [opts.field] a ground field made before (else one is made here)
 */
export function buildGround({ islandRadius, random, boxes = [], mobile = false, field = null }) {
  const R = islandRadius;
  const group = new THREE.Group();
  group.name = 'ground';
  field = field || createGroundField({ islandRadius: R, boxes, random, size: mobile ? 256 : 512 });

  const geo = new THREE.CircleGeometry(field.half, mobile ? 64 : 96);
  geo.rotateX(-Math.PI / 2); // uv (0..1 across the disc) now matches the field's cells
  const colorMap = dataTexture(field.colorPixels(), field.size, { channels: 4 });
  colorMap.wrapS = colorMap.wrapT = THREE.ClampToEdgeWrapping;
  const repeat = (2 * field.half) / DETAIL_TILE;
  const detail = grassDetailTextures(random, { size: mobile ? 128 : 256, normals: !mobile, repeat });
  const params = { map: colorMap };
  if (detail.normalMap) Object.assign(params, { normalMap: detail.normalMap, normalScale: new THREE.Vector2(0.7, 0.7) });
  const mat = mobile ? new THREE.MeshLambertMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: 0.96 });
  // multiply the small grass detail in the shader (less of it on dirt and sand: the color map's alpha)
  mat.onBeforeCompile = shader => {
    shader.uniforms.detailMap = { value: detail.map };
    shader.uniforms.detailRepeat = { value: repeat };
    shader.uniforms.detailGain = { value: new THREE.Vector3(...detail.gain) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform float detailRepeat;\nuniform vec3 detailGain;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 grassDetail = texture2D(detailMap, vMapUv * detailRepeat).rgb;
  ${mobile ? '' : 'grassDetail = mix(grassDetail, texture2D(detailMap, vMapUv * detailRepeat * 0.27 + 0.31).rgb, 0.45);'}
  diffuseColor.rgb *= mix(vec3(1.0), grassDetail * detailGain, sampledDiffuseColor.a);
  diffuseColor.a = opacity;`);
  };
  mat.customProgramCacheKey = () => (mobile ? 'island-ground-mobile' : 'island-ground');
  const groundMesh = new THREE.Mesh(geo, mat);
  groundMesh.receiveShadow = true;
  groundMesh.name = 'groundDisc';
  groundMesh.userData.detail = detail; // the detail textures (for tests and disposal)
  group.add(groundMesh);

  // beach: a ring from the ground's edge (y = 0) sloping down under the water (y = -1.6)
  const inner = R + 11, width = 34, drop = 1.6;
  const beachGeo = new THREE.RingGeometry(inner, inner + width, mobile ? 96 : 160, mobile ? 16 : 28);
  beachGeo.rotateX(-Math.PI / 2);
  const bp = beachGeo.attributes.position, bc = [];
  const dry = new THREE.Color(GROUND_COLORS.sand), wet = new THREE.Color('#b99c68'), under = new THREE.Color('#a99a70'), deep = new THREE.Color('#6f9a92');
  const shore = (-0.02 - WATER.level) / drop; // where the water meets the sand (0..1 across the ring)
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const f = (Math.hypot(x, z) - inner) / width;
    bp.setY(i, -0.02 - f * drop);
    // a slightly wavy water line, so it is not a perfect circle
    const a = Math.atan2(z, x), w = Math.sin(a * 23) * 0.012 + Math.sin(a * 57 + 1.3) * 0.008;
    const g = f + w;
    const c = dry.clone()
      .lerp(wet, smoothstep(shore - 0.17, shore - 0.01, g))
      .lerp(under, smoothstep(shore + 0.02, shore + 0.12, g))
      .lerp(deep, smoothstep(shore + 0.1, 1, g));
    bc.push(c.r, c.g, c.b);
  }
  beachGeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  beachGeo.computeVertexNormals();
  const sandTex = noiseTexture(random, { size: mobile ? 64 : 128, base: 246, spread: 26 }); // near white: the ground's sand edge has no texture, so they match
  sandTex.repeat.setScalar((2 * (inner + width)) / 2.5); // the ring's uv is flat (x, z): one repeat every 2.5 m
  const beachMat = mobile ? new THREE.MeshLambertMaterial({ vertexColors: true, map: sandTex })
    : new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTex, roughness: 1 });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.receiveShadow = true;
  beach.name = 'beach';
  group.add(beach);

  // foam: a thin soft white ring where the water touches the sand (follows the water's height in update)
  const shoreR = inner + shore * width;
  const foamGeo = new THREE.RingGeometry(shoreR - 0.5, shoreR + 0.9, mobile ? 96 : 160, 2);
  {
    const fp = foamGeo.attributes.position, fc = [];
    for (let i = 0; i < fp.count; i++) {
      const r = Math.hypot(fp.getX(i), fp.getY(i)), t = (r - (shoreR - 0.5)) / 1.4;
      const k = Math.max(0, 1 - Math.abs(t - 0.35) / 0.65); // strongest a bit inside, fading both ways
      fc.push(1, 1, 1, k);
    }
    foamGeo.setAttribute('color', new THREE.Float32BufferAttribute(fc, 4)); // alpha: soft at both edges
  }
  foamGeo.rotateX(-Math.PI / 2);
  const foam = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ color: '#f4fbff', vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }));
  foam.position.y = WATER.level + 0.02;
  foam.name = 'foam';
  foam.userData = { shoreR, inner, width, drop };
  group.add(foam);

  // water: follows the focus point (see scene.update) so its edge is never seen. The wave texture is moved
  // back by the same amount, so the waves stay put in the world and only drift slowly with time.
  const waterSize = 1600, waterRepeat = waterSize / WATER.tile;
  const waves = waterNormalTexture(random, { size: mobile ? 64 : 128, repeat: waterRepeat });
  const waterMat = new THREE.MeshStandardMaterial({
    color: WATER.color, roughness: 0.14, metalness: 0.05, transparent: true, opacity: WATER.opacity,
    normalMap: waves, normalScale: new THREE.Vector2(0.45, 0.45),
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(waterSize / 2, 64), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER.level;
  water.name = 'water';
  water.userData = { waves, size: waterSize, repeat: waterRepeat };
  return { group, ground: groundMesh, beach, foam, water, field };
}

/**
 * Move the water with the focus point and animate it: it bobs, the waves drift, the foam breathes.
 * Pure function of (time, focus): the same numbers give the same picture.
 */
export function updateWater({ water, foam }, time, focus = { x: 0, z: 0 }) {
  const y = WATER.level + Math.sin(time * 0.8) * WATER.bob;
  water.position.set(focus.x, y, focus.z);
  const { waves, size, repeat } = water.userData;
  if (waves) {
    // uv = local / size + 0.5; local x = world x, local y = -world z (the circle is turned flat)
    const frac = v => v - Math.floor(v);
    waves.offset.set(frac((focus.x / size) * repeat + time * 0.012), frac(-(focus.z / size) * repeat + time * 0.008));
  }
  if (foam) {
    const { shoreR, inner, width, drop } = foam.userData;
    foam.position.y = y + 0.02;
    foam.scale.setScalar((inner + ((-0.02 - y) / drop) * width) / shoreR); // the water line moves in and out
    foam.material.opacity = 0.4 + 0.2 * Math.sin(time * 1.3 + 0.7);
  }
}
