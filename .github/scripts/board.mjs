// Moves cards on the project board where GitHub's built-in workflows cannot:
// - a linked issue goes to "In review" when its pull request is ready, and back to "In progress" as a draft;
// - an open issue goes to "Blocked" while an issue it is blocked by is open, and back to "Todo" after.
// Built-in workflows still handle "added", "linked", "merged" and "closed".
import { readFileSync } from 'node:fs';

const token = process.env.BOARD_TOKEN;
const [owner, number] = [process.env.BOARD_OWNER, Number(process.env.BOARD_NUMBER)];
const repo = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === '1';

if (!token) {
  console.log('No BOARD_TOKEN secret yet, so the board is left as it is.');
  process.exit(0);
}

async function github(path, body) {
  const res = await fetch('https://api.github.com' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'board-sync' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.errors) throw new Error(path + ': ' + JSON.stringify(data.errors ?? data));
  return data;
}
const graphql = async (query, variables) => (await github('/graphql', { query, variables })).data;

async function loadBoard() {
  const items = [];
  let project, after = null;
  do {
    const { user } = await graphql(
      `query($owner: String!, $number: Int!, $after: String) {
        user(login: $owner) { projectV2(number: $number) {
          id
          field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
              content { ... on Issue { number state repository { nameWithOwner } } }
            }
          }
        } }
      }`,
      { owner, number, after },
    );
    project = user.projectV2;
    items.push(...project.items.nodes);
    after = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (after);
  const issues = items
    .filter((i) => i.content?.repository?.nameWithOwner === repo)
    .map((i) => ({ item: i.id, number: i.content.number, open: i.content.state === 'OPEN', status: i.status?.name ?? null }));
  return { id: project.id, field: project.field, issues };
}

async function move(board, issue, status) {
  if (issue.status === status) return;
  const option = board.field.options.find((o) => o.name === status);
  if (!option) throw new Error('The board has no "' + status + '" status.');
  console.log('#' + issue.number + ': ' + (issue.status ?? 'no status') + ' → ' + status + (dryRun ? ' (dry run)' : ''));
  if (dryRun) return;
  await graphql(
    `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { clientMutationId }
    }`,
    { project: board.id, item: issue.item, field: board.field.id, option: option.id },
  );
  issue.status = status;
}

// A pull request that closes issues moves them to "In review" when it is ready, or "In progress" as a draft.
async function followPullRequest(board, event) {
  const pr = event.pull_request;
  if (!pr || pr.state !== 'open') return;
  const [prOwner, prName] = repo.split('/');
  const { repository } = await graphql(
    `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { pullRequest(number: $number) { closingIssuesReferences(first: 20) { nodes { number } } } }
    }`,
    { owner: prOwner, name: prName, number: pr.number },
  );
  const linked = repository.pullRequest.closingIssuesReferences.nodes.map((n) => n.number);
  for (const issue of board.issues.filter((i) => i.open && linked.includes(i.number) && i.status !== 'Done'))
    await move(board, issue, pr.draft ? 'In progress' : 'In review');
}

// Only waiting cards change: someone already working on a blocked issue keeps it where it is.
async function syncBlocked(board) {
  for (const issue of board.issues.filter((i) => i.open && (i.status === 'Todo' || i.status === 'Blocked'))) {
    const blockers = await github('/repos/' + repo + '/issues/' + issue.number + '/dependencies/blocked_by?per_page=100');
    const waiting = blockers.some((b) => b.state === 'open');
    if (waiting && issue.status === 'Todo') await move(board, issue, 'Blocked');
    if (!waiting && issue.status === 'Blocked') await move(board, issue, 'Todo');
  }
}

const board = await loadBoard();
if (process.env.GITHUB_EVENT_NAME === 'pull_request_target')
  await followPullRequest(board, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
await syncBlocked(board);
