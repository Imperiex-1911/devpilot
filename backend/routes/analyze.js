const express = require('express');
const router = express.Router();
const github = require('../services/github');
const jira = require('../services/jira');
const airia = require('../services/airia');

router.post('/', async (req, res) => {
  const {
    owner,
    repo,
    prNumber,
    githubToken,
    jiraBaseUrl,
    jiraToken
  } = req.body;

  // Validate required fields
  if (!owner || !repo || !prNumber || !githubToken) {
    return res.status(400).json({
      error: 'Missing required fields: owner, repo, prNumber, githubToken'
    });
  }

  try {
    // Fetch all GitHub data in parallel
    const [prDetails, prFiles, prCommits, contributors] = await Promise.all([
      github.fetchPRDetails(owner, repo, prNumber, githubToken),
      github.fetchPRFiles(owner, repo, prNumber, githubToken),
      github.fetchPRCommits(owner, repo, prNumber, githubToken),
      github.fetchContributors(owner, repo, githubToken)
    ]);

    // Fetch linked issues (GitHub + Jira) in parallel, best-effort
    const prBody = prDetails.body || '';
    const [linkedIssues, jiraIssues] = await Promise.all([
      github.fetchLinkedIssues(owner, repo, prBody, githubToken).catch(() => []),
      jira.fetchLinkedIssues(jiraBaseUrl, `${prDetails.title} ${prBody}`, jiraToken).catch(() => [])
    ]);

    const prData = {
      title: prDetails.title,
      body: prBody,
      author: prDetails.user?.login,
      baseBranch: prDetails.base?.ref,
      headBranch: prDetails.head?.ref,
      state: prDetails.state,
      files: prFiles,
      commits: prCommits,
      contributors,
      linkedIssues,
      jiraIssues
    };

    const apiKey = process.env.AIRIA_API_KEY;
    const agentId = process.env.AIRIA_AGENT_ID;

    const analysis = await airia.analyzePR(prData, apiKey, agentId);

    return res.json({
      pr: {
        title: prData.title,
        author: prData.author,
        url: prDetails.html_url
      },
      analysis
    });

  } catch (err) {
    console.error('[analyze]', err.message);

    // Return structured error so extension can show per-card messages
    if (err.message.includes('GitHub')) {
      return res.status(502).json({ error: err.message, source: 'github' });
    }
    if (err.message.includes('Jira')) {
      return res.status(502).json({ error: err.message, source: 'jira' });
    }
    if (err.message.includes('Airia')) {
      return res.status(502).json({ error: err.message, source: 'airia' });
    }

    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

module.exports = router;
