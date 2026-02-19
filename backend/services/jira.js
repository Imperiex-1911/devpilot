// Jira Cloud REST API v3
// Auth: Basic base64(email:token)

function authHeader(token) {
  // token format expected: "email:api_token"
  const encoded = Buffer.from(token).toString('base64');
  return `Basic ${encoded}`;
}

// Extract Jira issue keys from text e.g. "PROJ-123", "DEV-456"
function extractIssueKeys(text) {
  if (!text) return [];
  const matches = text.matchAll(/\b([A-Z][A-Z0-9]+-\d+)\b/g);
  return [...new Set([...matches].map(m => m[1]))];
}

async function fetchIssue(jiraBaseUrl, issueKey, token) {
  const url = `${jiraBaseUrl}/rest/api/3/issue/${issueKey}?fields=summary,description,status,assignee,priority`;
  const res = await fetch(url, {
    headers: {
      'Authorization': authHeader(token),
      'Accept': 'application/json'
    }
  });
  if (res.status === 401) throw new Error('Jira token is invalid.');
  if (res.status === 404) throw new Error(`Jira issue not found: ${issueKey}`);
  if (!res.ok) throw new Error(`Jira API error ${res.status}`);
  return res.json();
}

// Fetch multiple issues from PR text, skip failures silently
async function fetchLinkedIssues(jiraBaseUrl, text, token) {
  if (!jiraBaseUrl || !token) return [];
  const keys = extractIssueKeys(text);
  if (keys.length === 0) return [];

  const results = await Promise.allSettled(
    keys.map(key => fetchIssue(jiraBaseUrl, key, token))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => ({
      key: r.value.key,
      summary: r.value.fields?.summary,
      status: r.value.fields?.status?.name,
      priority: r.value.fields?.priority?.name,
      url: `${jiraBaseUrl}/browse/${r.value.key}`
    }));
}

module.exports = { fetchLinkedIssues, extractIssueKeys };
