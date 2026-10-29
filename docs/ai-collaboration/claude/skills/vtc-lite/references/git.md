# Git: two repos

`<work>` is this work repo (the folder you are in); `<target>` is `target.path` from
`vtc.config.json`, resolved from `<work>`; `<default>` is `target.defaultBranch`.

## The work repo: memory

- Commit `context/`, `tasks/`, `cost.md`, `reports/`, `logs/` whenever the procedure says "commit memory":
  `git add context tasks cost.md reports logs && git commit -m "memory: <what>"`. Never `git add -A`: `.state/`
  is ignored, but keep the habit.
- Push after each commit when the work repo has a remote (`git remote` prints one). A refused
  push: keep the commit, say so once in the report, retry at the end of the run.
- Pull first, once per run, when it has a remote: `git pull --ff-only`, or `git pull --rebase` if
  that fails.

## The product repo: code only

Never edit `<target>`'s own checkout, never commit to `<default>`, never push `<default>`.

1. `git -C <target> fetch origin` (skip when it has no remote).
2. Base: `origin/<default>`, or `<default>` without a remote, or the branch of an open ticket the
   ticket `dependsOn` (stacked).
3. `git -C <target> worktree add <work>/.state/<id> -b <branchPrefix><id> <base>`; when the
   branch already exists (a re-queued ticket), reuse it: `git -C <target> worktree add
   <work>/.state/<id> <branchPrefix><id>`, then merge `<base>` into it — the worktree
   lives inside the work repo, so every edit and check happens inside the folder you opened.
4. Roles edit and run checks in `<work>/.state/<id>`. Run each command as one plain command with
   that folder as its working directory, never as a `cd <path> && ...` chain.
5. Commit in the worktree: `git -C .state/<id> add -A && git -C .state/<id> commit -m "<ticket title>"`.
6. `git -C .state/<id> push -u origin <branchPrefix><id>` (skip without a remote; report it). A
   refused push: skip the PR, keep the ticket `done` with
   `pr: "<branchPrefix><id> (local; push refused: <reason>)"`, and list it in the report.
7. PR ([pr-evidence.md](pr-evidence.md)), then `git -C <target> worktree remove <work>/.state/<id>`,
   keeping the branch.

A failed ticket keeps its branch; remove its worktree all the same.
