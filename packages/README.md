# Packages

Small, reusable pieces of the game. Each one could be used in another game too.

## Template

Every package follows this layout:

```
packages/<name>/
  package.json     name "@pvp/<name>", "type": "module", "main": "src/index.js", script "test": "node --test"
  src/index.js     the entry point (everything public is exported here)
  test/*.test.js   tests with the built-in node:test runner
  README.md        see below
```

The README has three sections:

- **What it does**: one or two sentences.
- **How to use**: a short code example.
- **Determinism**: fully, partly or not deterministic, and why
  (randomness comes from a seed, time is passed in; graphics and live networking may be only partly).

Rules:

- No dependency on the game app (`apps/`). Packages may depend on other `@pvp/*` packages.
- Keep outside dependencies to a minimum.
- `npm test` at the repo root runs every package's tests.
