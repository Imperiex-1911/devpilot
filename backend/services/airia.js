// Airia API service
// Endpoint: POST https://api.airia.ai/v2/PipelineExecution/{agentId}
// Auth:      X-API-KEY header
// Sync:      asyncOutput: false — result returned immediately, no polling needed

const AIRIA_BASE = 'https://api.airia.ai';

function buildPrompt(prData) {
  const {
    title, body, author, baseBranch, headBranch,
    files, commits, linkedIssues, jiraIssues, contributors
  } = prData;

  const changedFiles = (files || [])
    .slice(0, 50)
    .map(f => `  ${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  const hasTests = (files || []).some(f =>
    f.filename.match(/\.(test|spec)\.[jt]sx?$/) || f.filename.includes('__tests__')
  );

  const commitMessages = (commits || [])
    .slice(0, 10)
    .map(c => `  - ${c.commit.message.split('\n')[0]}`)
    .join('\n');

  const issueContext = (linkedIssues || [])
    .map(i => `  #${i.number}: ${i.title} [${i.state}]`)
    .join('\n');

  const jiraContext = (jiraIssues || [])
    .map(i => `  ${i.key}: ${i.summary} [${i.status}] - ${i.url}`)
    .join('\n');

  const topContributors = (contributors || [])
    .slice(0, 10)
    .map(c => `  ${c.login} (${c.contributions} contributions)`)
    .join('\n');

  return `You are DevPilot, an expert code reviewer AI. Analyze this GitHub Pull Request and respond with a JSON object.

## Pull Request
Title: ${title}
Author: ${author}
Branch: ${headBranch} -> ${baseBranch}
Has test changes: ${hasTests}

## Description
${body || 'No description provided.'}

## Files Changed (${(files || []).length} total)
${changedFiles || 'No files listed.'}

## Recent Commits
${commitMessages || 'No commits listed.'}

## Linked GitHub Issues
${issueContext || 'None found.'}

## Linked Jira Issues
${jiraContext || 'None found.'}

## Top Repository Contributors
${topContributors || 'None available.'}

---

Respond ONLY with a valid JSON object in this exact format:
{
  "summary": "2-3 sentence plain-English summary of what this PR does and why",
  "risks": [
    { "level": "high|medium|low", "category": "security|testing|scope|breaking-change|performance|other", "description": "specific risk description" }
  ],
  "resources": [
    { "title": "resource title", "url": "url if available else empty string", "type": "issue|jira|docs|other" }
  ],
  "reviewers": [
    { "username": "github_username", "reason": "why they should review this" }
  ]
}

Rules:
- risks array: 0-5 items, only real concerns, skip if none
- resources array: include all linked issues and tickets found above
- reviewers array: 2-3 suggestions from the contributors list relevant to the files changed
- Do not suggest the PR author as a reviewer
- Output raw JSON only, no markdown fences, no extra text`;
}

async function analyzePR(prData, apiKey, agentId) {
  if (!apiKey) throw new Error('AIRIA_API_KEY is not set.');
  if (!agentId) throw new Error('AIRIA_AGENT_ID is not set.');

  const prompt = buildPrompt(prData);

  const res = await fetch(`${AIRIA_BASE}/v2/PipelineExecution/${agentId}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      userInput: prompt,
      asyncOutput: false
    })
  });

  if (res.status === 401) throw new Error('Airia API key is invalid or expired.');
  if (res.status === 404) throw new Error('Airia agent not found. Check AIRIA_AGENT_ID in .env');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airia API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  // Airia returns the output in the response — extract it
  const output = data.output || data.result || data.content || data.message || '';

  if (!output) throw new Error('Airia returned an empty response.');

  // Strip markdown fences if the model wrapped JSON in ```
  const cleaned = output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Airia response was not valid JSON. Got: ${output.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

module.exports = { analyzePR, buildPrompt };
