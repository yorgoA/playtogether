@AGENTS.md

# How we work with Claude

Yorgo (product and screens) and Arthur (server) both code with Claude. These steps keep the board and the pull requests in order.

## Before starting

- Find the issue for the task: `gh issue list --label "P1 now"` or `gh issue view <n>`. `gh issue view` does not show blockers, so also run `gh api repos/yorgoA/playtogether/issues/<n>/dependencies/blocked_by --jq '.[] | "#\(.number) \(.state)"'`. Do not start an issue with an open blocker without saying so.
- Check what is already moving: `gh pr list` and `git worktree list`. Never start work an open pull request already covers.
- No issue for real work (a feature, a fix, a rule change)? Create one first, with an area label (`backend`, `screens` or `product`), a priority (`P1 now`, `P2 soon` or `P3 later`) and the owner as assignee. A typo or a package bump needs none.
- Product questions (which games, what a screen shows, what is allowed for adults) are Yorgo's to decide. Ask; do not guess.

## While working

- One issue, one branch, one worktree (see AGENTS.md).
- Commit messages follow the history: `feat(scope): …`, `fix(…)`, `chore(…)`, `ci(…)`, `test(…)`, `refactor(…)`, `docs(…)`.

## Pull requests

- Fill in the template. Its first section names the issue: `Closes #<n>` when the pull request finishes it, `Part of #<n>` when more follow, or `None`.
- `Closes #<n>` is what moves the board: the issue goes to In progress when the PR links it, to In review when the PR is ready, and to Done when it merges. Do not move cards by hand, except for issues split over several pull requests: `Part of #<n>` does not move the card, so move it to In progress or In review yourself, and let the last pull request say `Closes #<n>`.
- Open it as a draft until `npm run check` passes and the work is tried.
- Tag the other person when the pull request touches their area.

## Merging

- Merge only when the person you work for says so, and only on a green CI.
- Merge with `gh pr merge <n> --merge --delete-branch --match-head-commit <sha>`, so nothing pushed after the check slips in.
- Never push to `main`, never force-push someone else's branch, never bypass push protection.

## Never

- Use OpenAI or other AI services in the product. The project uses Claude only.
- Commit secrets, tokens or `.dev.vars`, or paste them into issues and pull requests.
