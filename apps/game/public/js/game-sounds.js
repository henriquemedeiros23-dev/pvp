// Glue between the game and @pvp/sound (#55): server messages -> sounds, the camera as the listener,
// your own footsteps and raising your shield. All sound making and deciding lives in the package.
import { soundEventsFor } from '@pvp/sound';

export class GameSounds {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.shieldUp = false;
  }

  // Call BEFORE the game handles the message (a chest or golden chest is still in its old state).
  message(m) {
    const g = this.game;
    if (!this.player || m.t === 'snap') return;
    const events = soundEventsFor(m, {
      myId: g.myId,
      weaponOf: id => (id === g.myId ? g.inv?.weapons?.[g.inv.slot] : g.remotes.get(id)?.sm.weaponId) ?? null,
      chestPos: i => g.world.chests[i],
      chestOpen: i => g.chests.isOpen(i),
      golden: g.golden,
    });
    for (const e of events) {
      let pos = e.pos ?? null;
      if (!pos && e.id != null) {
        const p = g.playerPos(e.id);
        if (!p) continue; // someone we cannot see: too far to hear
        pos = [p.x, p.y, p.z];
      }
      this.player.play(e.sound, { pos, delayMs: e.delayMs || 0 });
    }
  }

  // Every frame: the listener follows the camera; footsteps and the shield while playing.
  frame(dt) {
    const g = this.game, me = g.me;
    if (!this.player) return;
    this.player.setListener({ x: g.camera.position.x, z: g.camera.position.z, yaw: g.yaw });
    if (g.mode !== 'play' || !me) { this.shieldUp = false; this.player.resetFootsteps(); return; }
    this.player.footsteps(dt, { speed: me.speed, onGround: me.onGround });
    if (g.shieldUp && !this.shieldUp) this.player.play('shieldUp');
    this.shieldUp = g.shieldUp;
  }
}
