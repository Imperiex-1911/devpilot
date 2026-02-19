const KEYS = ['githubToken', 'backendUrl', 'jiraBaseUrl', 'jiraToken'];

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
  if (data.backendUrl)  $('backend-url').value  = data.backendUrl;
  if (data.jiraBaseUrl) $('jira-url').value      = data.jiraBaseUrl;
  if (data.jiraToken)   $('jira-token').value    = data.jiraToken;

  // Default backend URL
  if (!data.backendUrl) $('backend-url').value = 'http://localhost:3000';
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
    KEYS.forEach(k => {
      const el = $('github-token backend-url jira-url jira-token'.split(' ')[KEYS.indexOf(k)]);
      if (el) el.value = '';
    });
    $('github-token').value = '';
    $('backend-url').value  = 'http://localhost:3000';
    $('jira-url').value     = '';
    $('jira-token').value   = '';
    showStatus('Settings cleared.', 'success');
  });
});
