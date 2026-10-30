// Backups for one data file (e.g. accounts.json), kept next to it in the same folder:
//   accounts.json.backup-2026-10-30T12-00-00Z        (daily copies, only the last `keep` are kept)
//   accounts.json.before-reset-2026-10-30T12-00-00Z  (made by a reset, never deleted automatically)
// and a "wipe it" reset that also works while a server keeps the file open:
//   resetFile() empties the file AND leaves a marker; the next server start (applyPendingReset) empties it
//   again, in case the running server saved its old data over the empty file before it stopped.
// Time is always passed in (`now`, ms), so names and decisions are exact in tests.
import fs from 'node:fs';
import path from 'node:path';

export const BACKUP_LABEL = 'backup';
export const RESET_LABEL = 'before-reset';
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A time as text that is safe in file names on every system: 2026-10-30T12-00-00Z. */
export function stamp(now) {
  return new Date(now).toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

/** Back from stamp() to ms, or NaN. */
export function parseStamp(text) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(text);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : NaN;
}

/** The backup file name for `file` at `now`. */
export function backupPath(file, now, label = BACKUP_LABEL) {
  return `${file}.${label}-${stamp(now)}`;
}

/** The marker file that asks the next server start to empty `file`. */
export const resetMarkerPath = file => `${file}.reset-requested`;

/** Every backup of `file` with this label, oldest first: [{ path, at }]. */
export function listBackups(file, label = BACKUP_LABEL) {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.${label}-`;
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter(n => n.startsWith(prefix))
    .map(n => ({ path: path.join(dir, n), at: parseStamp(n.slice(prefix.length)) }))
    .filter(b => Number.isFinite(b.at))
    .sort((a, b) => a.at - b.at);
}

/** Pure: which backups to delete so only the newest `keep` stay (list oldest first, like listBackups). */
export function backupsToDelete(list, keep) {
  return keep >= list.length ? [] : list.slice(0, list.length - Math.max(0, keep));
}

/** Pure: is a new daily backup due? lastAt: time of the newest backup (or undefined/NaN for none). */
export function backupDue(lastAt, now, everyMs = DAY_MS) {
  return !Number.isFinite(lastAt) || now - lastAt >= everyMs;
}

/** Write a file safely: a temp file next to it, flushed to disk, then renamed over the real one. */
export function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/**
 * Copy `file` to a backup now. Returns the backup's path, or null if `file` does not exist.
 * keep: with the daily label, older backups beyond the newest `keep` are deleted (0 or Infinity: keep all).
 */
export function makeBackup(file, { now, keep = 7, label = BACKUP_LABEL } = {}) {
  if (!Number.isFinite(now)) throw new TypeError('makeBackup needs now (ms)');
  if (!fs.existsSync(file)) return null;
  let target = backupPath(file, now, label);
  for (let i = 1; fs.existsSync(target); i++) target = backupPath(file, now + i * 1000, label); // two in one second
  fs.copyFileSync(file, target);
  if (keep > 0 && Number.isFinite(keep)) {
    for (const old of backupsToDelete(listBackups(file, label), keep)) {
      try { fs.unlinkSync(old.path); } catch { /* already gone */ }
    }
  }
  return target;
}

/** A daily backup if one is due (the newest backup is older than everyMs). Returns its path or null. */
export function backupIfDue(file, { now, keep = 7, everyMs = DAY_MS } = {}) {
  const list = listBackups(file);
  if (!backupDue(list.at(-1)?.at, now, everyMs)) return null;
  return makeBackup(file, { now, keep });
}

/**
 * Wipe `file`: first a 'before-reset' backup (never deleted automatically), then write `empty`.
 * marker: true also leaves the marker so the next server start empties it again (see applyPendingReset).
 * Returns { backup, file }.
 */
export function resetFile(file, { now, empty = '{}\n', marker = true } = {}) {
  const backup = makeBackup(file, { now, label: RESET_LABEL, keep: 0 });
  writeFileAtomic(file, empty);
  if (marker) writeFileAtomic(resetMarkerPath(file), `reset requested at ${new Date(now).toISOString()}\n`);
  return { backup, file };
}

/**
 * At server start: if a reset was requested, back up and empty `file` and remove the marker.
 * Returns the same as resetFile, or null if no reset was waiting.
 */
export function applyPendingReset(file, { now, empty = '{}\n' } = {}) {
  const markerFile = resetMarkerPath(file);
  if (!fs.existsSync(markerFile)) return null;
  const r = resetFile(file, { now, empty, marker: false });
  fs.unlinkSync(markerFile);
  return r;
}
