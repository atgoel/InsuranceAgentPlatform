# Worktrees and clean-checkout images

Why: parallel sessions in one checkout break each other's gates and leak uncommitted work into Docker images
([BUG-17](../quality/demo-readiness-findings.md); [Wave 2 retro](../quality/wave2-retro.md) item 5).

## One worktree per session

```
node scripts/worktree.mjs new <task> [--base <ref>] [--dry-run]
node scripts/worktree.mjs check [path]
```

- `new` validates `<task>` (`/^[a-z0-9-]+$/`), runs `git worktree add ../IMF-<task> -b ui/<task> <base>`
  (base defaults to the current HEAD), runs `npm ci` there and checks that `node_modules/vitest` and
  `node_modules/jest` exist. It exits 1 if the branch or folder already exists or any step fails.
- `check` only verifies the dependencies of an existing worktree (default: the current repo root) and
  prints `run npm ci in <path>` when they are missing.
- Clean up when the branch is merged: `git worktree remove --force ../IMF-<task>` and `git branch -D ui/<task>`.

## Images from a committed ref

```
node scripts/build-images.mjs [ref] [--dry-run]
docker compose -f infra/dev/docker-compose.yml --profile app up -d --no-build core web
```

- Resolves `ref` (default HEAD) to a sha, checks it out as a detached temporary worktree under the OS temp
  folder, builds `migrate` (image `iap-core:dev`) and `web` from that tree, and tags `iap-core:<sha12>` and
  `iap-web:<sha12>`. The temporary worktree is always removed, also on failure.
- Uncommitted changes are excluded; the script prints `excluded: N uncommitted paths`.
- Start the stack with `up -d --no-build`. `up --build` rebuilds from the working tree and brings the WIP back.
- `--dry-run` prints the commands and runs nothing.
