// Airia API service
// Base URL: https://airia.ai
// Auth: X-API-KEY header
// Run agent:  POST /v1/JobOrchestration
// Stream:     GET  /v1/JobOrchestration/{id}/sse
// Result:     GET  /v1/JobOrchestration/{id}/result

const AIRIA_BASE = 'https://airia.ai';

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
Branch: ${headBranch} → ${baseBranch}
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
- resources array: include all linked issues/tickets found above
- reviewers array: 2-3 suggestions from the contributors list who are most relevant based on files changed
- If author is in contributors list, do not suggest them as reviewer`;
}

async function createJob(userInput, apiKey, agentId) {
  const body = {
    pipelineVersionId: agentId,
    userInput
  };

  const res = await fetch(`${AIRIA_BASE}/v1/JobOrchestration`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.status === 401) throw new Error('Airia API key is invalid or expired.');
  if (res.status === 404) throw new Error('Airia agent not found. Check AIRIA_AGENT_ID in .env');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airia API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function getJobResult(jobId, apiKey) {
  const res = await fetch(`${AIRIA_BASE}/v1/JobOrchestration/${jobId}/result`, {
    headers: {
      'X-API-KEY': apiKey,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Failed to get job result: ${res.status}`);
  return res.json();
}

// Poll for job completion and return parsed result
async function waitForResult(jobId, apiKey, timeoutMs = 60000) {
  const start = Date.now();
  const interval = 2000;

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, interval));
    const result = await getJobResult(jobId, apiKey);

    // Status values observed from Airia platform: Completed, Failed, Running, Pending
    if (result.status === 'Completed' || result.status === 'completed') {
      return result;
    }
    if (result.status === 'Failed' || result.status === 'failed') {
      throw new Error(`Airia job failed: ${result.errorMessage || 'unknown error'}`);
    }
  }
  throw new Error('Airia job timed out after 60 seconds.');
}

async function analyzePR(prData, apiKey, agentId) {
  if (!apiKey) throw new Error('AIRIA_API_KEY is not set.');
  if (!agentId) throw new Error('AIRIA_AGENT_ID is not set. Create your agent on Airia and add its ID to .env');

  const prompt = buildPrompt(prData);
  const job = await createJob(prompt, apiKey, agentId);
  const jobId = job.id || job.jobId;

  if (!jobId) throw new Error('Airia did not return a job ID.');

  const result = await waitForResult(jobId, apiKey);

  // Try to parse output as JSON
  const output = result.output || result.result || result.content || '';
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Airia response was not valid JSON.');

  return JSON.parse(jsonMatch[0]);
}

module.exports = { analyzePR, buildPrompt };
