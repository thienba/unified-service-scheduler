# The pull request

## Opening it

Write the body to `tasks/<id>/PR.md` in the work repo first. When the branch was pushed,
`target.repoSlug` is set and `gh auth status` succeeds:

```sh
gh pr create -R <repoSlug> --base <base> --head <branchPrefix><id> --title "<ticket title>" --body-file tasks/<id>/PR.md
```

Without a slug or without `gh`, report the pushed branch (or the local branch when nothing was
pushed); `tasks/<id>/PR.md` holds the body for whoever opens the PR. Never add tool or AI
attribution lines to the body or the commits.

## Body

```markdown
## What

<the ticket's description, two or three sentences>

## Acceptance criteria

| Criterion | Proven by |
|---|---|
| <criterion text> | <test name and file, or the check, or "review only (no test setup)"> |

## Checks

| Check | Result |
|---|---|
| <name>: `<command>` | pass / fail / failing on base / not configured |

## Screenshots

<links, or "none (no UI change)" or the skipped reason>

## Guesses

<each Q- file this ticket raised: the question and the option taken, or "none">

## Review

<reviewer verdict, rounds used (n of 3), and any finding left as a follow-up>
```

The ticket's own history stays in the work repo; the PR body carries everything a reviewer of
the product needs; it links to the work repo only for screenshot images.

Screenshots live in the work repo at `tasks/<id>/shots/`. When the work repo has a GitHub
remote, link them as `https://github.com/<work repo slug>/blob/<branch>/tasks/<id>/shots/<file>.png?raw=true`
after the memory push; otherwise write "screenshots in the work repo: tasks/<id>/shots/".
