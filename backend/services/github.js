const GITHUB_API = 'https://api.github.com';

function headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function githubFetch(url, token) {
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 401) throw new Error('GitHub token is invalid or expired.');
  if (res.status === 403) throw new Error('GitHub rate limit exceeded or insufficient permissions.');
  if (res.status === 404) throw new Error(`GitHub resource not found: ${url}`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  return res.json();
}

async function fetchPRDetails(owner, repo, prNumber, token) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`;
  return githubFetch(url, token);
}

async function fetchPRFiles(owner, repo, prNumber, token) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;
  return githubFetch(url, token);
}

async function fetchPRCommits(owner, repo, prNumber, token) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=50`;
  return githubFetch(url, token);
}

async function fetchIssue(owner, repo, issueNumber, token) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`;
  return githubFetch(url, token);
}

async function fetchContributors(owner, repo, token) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=30`;
  return githubFetch(url, token);
}

// Extract issue numbers from PR body e.g. "Fixes #123", "Closes #456"
function extractIssueNumbers(text) {
  if (!text) return [];
  const matches = text.matchAll(/(?:closes?|fixes?|resolves?)\s+#(\d+)/gi);
  return [...new Set([...matches].map(m => parseInt(m[1])))];
}

// Fetch linked issues from PR body (best-effort, skip failures)
async function fetchLinkedIssues(owner, repo, prBody, token) {
  const numbers = extractIssueNumbers(prBody);
  const results = await Promise.allSettled(
    numbers.map(n => fetchIssue(owner, repo, n, token))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

module.exports = {
  fetchPRDetails,
  fetchPRFiles,
  fetchPRCommits,
  fetchLinkedIssues,
  fetchContributors,
  extractIssueNumbers
};
