# How we work

## Team
- **The boss** (the game's creator) decides what the game should be and the order of the jobs.
- **Claude, the team leader**, plans the work, keeps the backlog, hands each job to an agent, checks the result and reports back. The team leader does not write code.
- **Agents** do the coding, one backlog issue at a time.

## Rules
1. **Packages first.** Code goes into small packages in `packages/` that could be used in other games too. The game itself lives in `apps/`.
2. **Deterministic when possible.** Same input = same result. Randomness uses a seed and time is passed in, so tests can replay things exactly. Graphics and live networking can be only partly deterministic.
3. **Every package has tests** and a short README: what it does, how to use it, how deterministic it is.
4. **Work from the backlog.** Each change belongs to one issue in [BACKLOG.md](../BACKLOG.md) (or GitHub Issues once the repo is online).
5. **Short reports.** When a job is finished, the team leader tells the boss what changed in simple words.
