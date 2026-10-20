// @pvp/island-scene: the three.js scenery of an island from @pvp/world-gen.
// Sky, sun, lights, ground, beach, water, grass, palms, ruins, chests and the golden chest.
import * as THREE from 'three';
import { createRandom } from '@pvp/seeded-random';
import { buildSky, buildLights, buildGround, buildPlants, SKY, SUN_OFFSET } from './environment.js';
import { buildRuins, STONE_COLORS } from './ruins.js';
import { buildChest, createChests, createGoldenChest, CHEST_SIZE, LID_OPEN_ANGLE } from './chests.js';
import { noiseTexture, noisePixels } from './textures.js';

export {
  buildSky, buildLights, buildGround, buildPlants, buildRuins, buildChest, createChests, createGoldenChest,
  noiseTexture, noisePixels, SKY, SUN_OFFSET, STONE_COLORS, CHEST_SIZE, LID_OPEN_ANGLE,
};

export const DEFAULT_SEED = 'island-scene';

/**
 * Build the whole island scenery.
 * @param {object} opts
 * @param {{ islandRadius: number, boxes: any[], chests: Array<{x:number,z:number}> }} opts.island from generateIsland()
 * @param {boolean} [opts.mobile] fewer grass tufts and a smaller shadow map
 * @param {number|string|{ next(): number }} [opts.random] a seed or a seeded random (default 'island-scene')
 */
export function createIslandScene({ island, mobile = false, random = DEFAULT_SEED } = {}) {
  if (!island) throw new TypeError('createIslandScene needs { island } (from generateIsland())');
  const root = typeof random === 'object' && random && typeof random.next === 'function' ? random : createRandom(random);
  // every part gets its own stream, so changing one part never moves the others
  const fork = label => (typeof root.fork === 'function' ? root.fork(label) : root);

  const group = new THREE.Group();
  group.name = 'island-scene';

  const sky = buildSky();
  const { hemi, sun } = buildLights({ mobile });
  const ground = buildGround({ islandRadius: island.islandRadius, random: fork('ground') });
  const plants = buildPlants({ islandRadius: island.islandRadius, random: fork('plants'), mobile });
  const ruins = buildRuins({ boxes: island.boxes, random: fork('ruins') });
  const chests = createChests({ chests: island.chests });
  const golden = createGoldenChest();
  group.add(sky.group, hemi, sun, sun.target, ground.group, ground.water, plants.group, ruins.group, chests.group, golden.mesh);

  const fog = new THREE.Fog(sky.horizon.clone(), SKY.fogNear, SKY.fogFar);
  const background = sky.horizon.clone();
  const water = ground.water;

  /**
   * Call every frame. `focus` is where the camera is looking (the player, or the menu spot):
   * the sky, the water and the sun's shadow box follow it.
   * @param {number} dt seconds since the last frame
   * @param {number} time seconds, passed in
   * @param {{ x: number, z: number }} [focus]
   */
  function update(dt, time, focus = { x: 0, z: 0 }) {
    sky.group.position.set(focus.x, 0, focus.z);
    water.position.set(focus.x, -0.35 + Math.sin(time * 0.8) * 0.05, focus.z);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.set(focus.x + SUN_OFFSET.x, SUN_OFFSET.y, focus.z + SUN_OFFSET.z);
    chests.update(dt);
    golden.update(time);
  }
  update(0, 0);

  return {
    group, fog, background, sun, hemi, water, sky, ground: ground.ground, beach: ground.beach,
    ruins, chests, golden, update,
    /** Add everything to a THREE.Scene and set its fog and background color. */
    addTo(scene) { scene.add(group); scene.fog = fog; scene.background = background; return this; },
  };
}
