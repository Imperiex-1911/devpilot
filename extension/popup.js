const KEYS = ['githubToken', 'backendUrl', 'jiraBaseUrl', 'jiraToken'];
const RENDER_URL = 'https://devpilot-backend-fqtm.onrender.com';

const $ = id => document.getElementById(id);
const statusEl = $('status');

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
}

// Load saved settings on popup open
chrome.storage.local.get(KEYS, data => {
  if (data.githubToken) $('github-token').value = data.githubToken;
  if (data.jiraBaseUrl) $('jira-url').value      = data.jiraBaseUrl;
  if (data.jiraToken)   $('jira-token').value    = data.jiraToken;

  // Default to Render URL
  $('backend-url').value = data.backendUrl || RENDER_URL;
});

$('btn-save').addEventListener('click', () => {
  const githubToken = $('github-token').value.trim();
  const backendUrl  = $('backend-url').value.trim();
  const jiraBaseUrl = $('jira-url').value.trim();
  const jiraToken   = $('jira-token').value.trim();

  if (!githubToken) {
    showStatus('GitHub token is required.', 'error');
    return;
  }

  if (!backendUrl) {
    showStatus('Backend URL is required.', 'error');
    return;
  }

  chrome.storage.local.set({ githubToken, backendUrl, jiraBaseUrl, jiraToken }, () => {
    showStatus('Settings saved!', 'success');
  });
});

$('btn-clear').addEventListener('click', () => {
  chrome.storage.local.remove(KEYS, () => {
    $('github-token').value = '';
    $('backend-url').value  = RENDER_URL;
    $('jira-url').value     = '';
    $('jira-token').value   = '';
    showStatus('Settings cleared.', 'success');
  });
});
