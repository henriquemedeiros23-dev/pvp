// @pvp/island-scene: the three.js scenery of an island from @pvp/world-gen.
// Sky, sun, lights, ground, beach, water, grass, palms, ruins, chests, the golden chest and coin pops.
import * as THREE from 'three';
import { createRandom } from '@pvp/seeded-random';
import { buildSky, buildLights, buildGround, buildPlants, SKY, SUN_OFFSET } from './environment.js';
import { buildRuins, STONE_COLORS } from './ruins.js';
import { buildChest, createChests, createGoldenChest, CHEST_SIZE, LID_OPEN_ANGLE } from './chests.js';
import { noiseTexture, noisePixels } from './textures.js';
import { buildCoin, createCoinPops, COIN_COLORS, COIN_SIZE, COIN_POP } from './coins.js';

export {
  buildSky, buildLights, buildGround, buildPlants, buildRuins, buildChest, createChests, createGoldenChest,
  noiseTexture, noisePixels, SKY, SUN_OFFSET, STONE_COLORS, CHEST_SIZE, LID_OPEN_ANGLE,
  buildCoin, createCoinPops, COIN_COLORS, COIN_SIZE, COIN_POP,
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
  // a few gold coins jump out of a chest when it opens (#29); fewer on phones
  const coinPops = createCoinPops({ max: mobile ? 8 : 16, random: fork('coins') });
  const coinsPerChest = mobile ? 4 : 6;
  group.add(sky.group, hemi, sun, sun.target, ground.group, ground.water, plants.group, ruins.group, chests.group, golden.mesh, coinPops.group);

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
    coinPops.update(dt);
  }

  /** Coins pop out of normal chest i (call it when the chest opens). Returns how many coins. */
  function popChestCoins(i, { count = coinsPerChest } = {}) {
    const m = chests.meshes[i];
    if (!m) return 0;
    return coinPops.burst(m.position.x, CHEST_SIZE.height + 0.15, m.position.z, { count });
  }

  /** Coins pop out of the golden chest (where it is, or at x, z). A few more than a normal chest. */
  function popGoldenCoins(x = golden.mesh.position.x, z = golden.mesh.position.z, { count = coinsPerChest + 2 } = {}) {
    return coinPops.burst(x, CHEST_SIZE.height * golden.mesh.scale.y + 0.2, z, { count });
  }
  update(0, 0);

  return {
    group, fog, background, sun, hemi, water, sky, ground: ground.ground, beach: ground.beach,
    ruins, chests, golden, coinPops, popChestCoins, popGoldenCoins, update,
    /** Add everything to a THREE.Scene and set its fog and background color. */
    addTo(scene) { scene.add(group); scene.fog = fog; scene.background = background; return this; },
  };
}
