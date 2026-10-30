import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  stamp, parseStamp, backupPath, listBackups, backupsToDelete, backupDue, writeFileAtomic,
  makeBackup, backupIfDue, resetFile, applyPendingReset, resetMarkerPath, DAY_MS, RESET_LABEL,
} from '../src/index.js';

const T = Date.parse('2026-10-30T12:00:00Z');
let dir, file;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-backup-')); file = path.join(dir, 'accounts.json'); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('stamps are file-name safe and go back to the same time', () => {
  assert.equal(stamp(T + 123), '2026-10-30T12-00-00Z');
  assert.equal(parseStamp('2026-10-30T12-00-00Z'), T);
  assert.ok(Number.isNaN(parseStamp('nope')));
  assert.equal(backupPath('/d/a.json', T), '/d/a.json.backup-2026-10-30T12-00-00Z');
});

test('pure helpers: which to delete, when one is due', () => {
  const list = [1, 2, 3, 4].map(at => ({ path: String(at), at }));
  assert.deepEqual(backupsToDelete(list, 2).map(b => b.at), [1, 2]);
  assert.deepEqual(backupsToDelete(list, 9), []);
  assert.equal(backupDue(undefined, T), true);
  assert.equal(backupDue(T, T + DAY_MS - 1), false);
  assert.equal(backupDue(T, T + DAY_MS), true);
});

test('writeFileAtomic writes the whole file and leaves no temp file', () => {
  writeFileAtomic(path.join(dir, 'sub', 'x.json'), '{"a":1}');
  assert.equal(fs.readFileSync(path.join(dir, 'sub', 'x.json'), 'utf8'), '{"a":1}');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sub')), ['x.json']);
});

test('makeBackup copies the file and keeps only the newest N', () => {
  assert.equal(makeBackup(file, { now: T }), null); // nothing to back up yet
  fs.writeFileSync(file, '{"day":0}');
  for (let d = 0; d < 5; d++) makeBackup(file, { now: T + d * DAY_MS, keep: 3 });
  const list = listBackups(file);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(b => b.at), [T + 2 * DAY_MS, T + 3 * DAY_MS, T + 4 * DAY_MS]);
  assert.equal(fs.readFileSync(list[0].path, 'utf8'), '{"day":0}');
  assert.throws(() => makeBackup(file, {}), TypeError);
});

test('two backups in the same second get different names', () => {
  fs.writeFileSync(file, '{}');
  const a = makeBackup(file, { now: T });
  const b = makeBackup(file, { now: T });
  assert.notEqual(a, b);
  assert.equal(listBackups(file).length, 2);
});

test('backupIfDue makes one a day', () => {
  fs.writeFileSync(file, '{}');
  assert.ok(backupIfDue(file, { now: T }));
  assert.equal(backupIfDue(file, { now: T + 1000 }), null);
  assert.ok(backupIfDue(file, { now: T + DAY_MS }));
  assert.equal(listBackups(file).length, 2);
});

test('resetFile backs up, empties, leaves a marker; applyPendingReset empties again once', () => {
  fs.writeFileSync(file, '{"ann":{}}');
  const r = resetFile(file, { now: T });
  assert.equal(fs.readFileSync(r.backup, 'utf8'), '{"ann":{}}');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  assert.ok(fs.existsSync(resetMarkerPath(file)));
  // a running server saved its old data over the empty file before it stopped
  fs.writeFileSync(file, '{"ann":{},"bob":{}}');
  const again = applyPendingReset(file, { now: T + 5000 });
  assert.ok(again);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  assert.equal(fs.existsSync(resetMarkerPath(file)), false);
  assert.equal(listBackups(file, RESET_LABEL).length, 2); // reset backups are all kept
  assert.equal(applyPendingReset(file, { now: T + 9000 }), null); // nothing waiting any more
});

test('resetFile works when there is no file yet', () => {
  const r = resetFile(file, { now: T, marker: false });
  assert.equal(r.backup, null);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}\n');
  assert.equal(fs.existsSync(resetMarkerPath(file)), false);
});
