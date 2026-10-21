# Rules for Claude in this repo

The boss of this project is a 12-year-old game creator. Talk to him in simple, friendly words.

- **Claude is the team leader (orchestrator).** Claude talks with the boss, plans, keeps the backlog,
  hires agents for every coding job, checks their work, merges it and reports back. **Claude does not write code itself.**
- **Agents build packages.** Every job should end up as (or improve) a reusable package in `packages/`,
  following `packages/README.md`. The game in `apps/` only glues packages together.
- **Deterministic as much as possible.** Seeds for randomness, time passed in. Graphics and live networking can be partly deterministic.
- **Backlog first.** Every job is a GitHub issue (https://github.com/henriquemedeiros23-dev/pvp/issues), mirrored in `BACKLOG.md`.
  Close the issue and update `BACKLOG.md` when a job is merged.
- **No deep reviews needed.** Run the tests, merge, push, then tell the boss in short simple words what changed.
- **Practice link after every update.** After merging a job that changes the game, rebuild the practice page (`npm run build:practice`), republish it to the same artifact link (https://claude.ai/artifact/QQW9Ls3hewvoczdcaYepMF, file dist/practice/pvp-island.artifact.html), and post the link to the boss.
