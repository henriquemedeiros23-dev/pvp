# @pvp/file-backup

## What it does

Keeps one data file (like `accounts.json`) safe: a daily backup copy next to it (only the newest N are kept),
safe atomic writes (temp file, then rename), and a "wipe everything" reset that always makes a backup first and
leaves a marker so the next server start wipes again (a running server could otherwise save its old data back). Node only.

## How to use

```js
import { backupIfDue, makeBackup, listBackups, resetFile, applyPendingReset, writeFileAtomic } from '@pvp/file-backup';

const file = '/data/accounts.json';

// server start: finish a launch-day reset if one was asked for, then the daily backup
applyPendingReset(file, { now: Date.now() });              // null, or { backup, file }
backupIfDue(file, { now: Date.now(), keep: 7 });           // -> '/data/accounts.json.backup-2026-10-30T12-00-00Z' or null
setInterval(() => backupIfDue(file, { now: Date.now(), keep: 7 }), 3600_000);

// the admin script (npm run admin:reset-accounts -- --yes)
resetFile(file, { now: Date.now() });  // copy to accounts.json.before-reset-<time>, write {}, leave accounts.json.reset-requested

listBackups(file);                     // [{ path, at }] oldest first
writeFileAtomic(file, '{}\n');
```

Backup names: `<file>.backup-<time>` (daily, pruned to `keep`) and `<file>.before-reset-<time>` (never deleted
automatically). Times look like `2026-10-30T12-00-00Z` (safe in file names everywhere).

## Determinism

Partly deterministic: every decision (names, which backups to delete, whether one is due) is a pure function of the
time passed in (`now`); reading and writing files is real I/O.
