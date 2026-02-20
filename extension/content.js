// DevPilot - content script
// Runs on: https://github.com/*/*/pull/*
// Responsibilities:
//     1. Detect GitHub PR pages (including SPA navigation)
//     2. Inject collapsible sidebar
//     3. Extract PR metadata from the page
//     4. Call DevPilot backend
//     5. Render results in 4 cards

(function () {
  'use strict';

  const SIDEBAR_ID = 'devpilot-sidebar';
  let currentPRUrl = '';
  let isAnalyzing  = false;
  let lastAnalysis = null;
  let lastPrMeta   = null;

  // ─── URL / PR Detection ────────────────────────────────────────────────────

  function isPRPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+/.test(window.location.pathname);
  }

  function getPRInfo() {
    const parts = window.location.pathname.split('/');
    // /owner/repo/pull/number
    return {
      owner: parts[1],
      repo: parts[2],
      prNumber: parseInt(parts[4], 10)
    };
  }

  // ─── Sidebar DOM ───────────────────────────────────────────────────────────

  function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = SIDEBAR_ID;
    sidebar.innerHTML = `
      <div id="dp-toggle" title="Toggle DevPilot">
        <span id="dp-toggle-icon">🧭</span>
        <span id="dp-toggle-label">DevPilot</span>
      </div>
      <div id="dp-panel">
        <div id="dp-header">
          <span id="dp-title">🧭 DevPilot</span>
          <button id="dp-refresh" title="Re-analyze">↻</button>
        </div>
        <div id="dp-cards">
          ${makeCard('summary',   '📝', 'Summary')}
          ${makeCard('risks',     '⚠️', 'Risks')}
          ${makeCard('resources', '🔗', 'Resources')}
          ${makeCard('reviewers', '👥', 'Suggested Reviewers')}
        </div>
        <div id="dp-actions">
          <button id="dp-btn-comment">📝 Post Review to GitHub</button>
          <button id="dp-btn-notify">🔔 Notify on Slack</button>
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);
    bindEvents(sidebar);
    return sidebar;
  }

  function makeCard(id, icon, title) {
    return `
      <div class="dp-card" id="dp-card-${id}">
        <div class="dp-card-header">
          <span>${icon} ${title}</span>
          <span class="dp-card-chevron">▾</span>
        </div>
        <div class="dp-card-body" id="dp-body-${id}">
          <div class="dp-placeholder">—</div>
        </div>
      </div>`;
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  function bindEvents(sidebar) {
    // Toggle sidebar open/closed
    sidebar.querySelector('#dp-toggle').addEventListener('click', () => {
      sidebar.classList.toggle('dp-open');
      chrome.storage.local.set({ dpOpen: sidebar.classList.contains('dp-open') });
    });

    // Refresh button
    sidebar.querySelector('#dp-refresh').addEventListener('click', () => {
      if (!isAnalyzing) analyze();
    });

    // Collapsible cards
    sidebar.querySelectorAll('.dp-card-header').forEach(header => {
      header.addEventListener('click', () => {
        header.closest('.dp-card').classList.toggle('dp-collapsed');
      });
    });

    // Action buttons
    sidebar.querySelector('#dp-btn-comment').addEventListener('click', postReview);
    sidebar.querySelector('#dp-btn-notify').addEventListener('click', notifySlack);
  }

  function restoreOpenState(sidebar) {
    chrome.storage.local.get('dpOpen', data => {
      if (data.dpOpen) sidebar.classList.add('dp-open');
    });
  }

  // ─── PR Data Extraction ────────────────────────────────────────────────────

  function getPRBody() {
    // Try the PR description element
    const desc = document.querySelector('.comment-body[data-target="issue-body.renderedBody"], #pull-request-body-preview .comment-body, .js-issue-body .comment-body');
    return desc ? desc.innerText.trim() : '';
  }

  // ─── Loading States ────────────────────────────────────────────────────────

  function setLoading() {
    ['summary', 'risks', 'resources', 'reviewers'].forEach(id => {
      const body = document.getElementById(`dp-body-${id}`);
      if (body) body.innerHTML = '<div class="dp-loading"><span></span><span></span><span></span></div>';
    });
  }

  function setCardError(cardId, message) {
    const body = document.getElementById(`dp-body-${cardId}`);
    if (body) body.innerHTML = `<div class="dp-error">${escapeHtml(message)}</div>`;
  }

  function setCardContent(cardId, html) {
    const body = document.getElementById(`dp-body-${cardId}`);
    if (body) body.innerHTML = html;
  }

  // ─── Render Results ────────────────────────────────────────────────────────

  function renderSummary(summary) {
    setCardContent('summary', `<p class="dp-summary-text">${escapeHtml(summary)}</p>`);
  }

  function renderRisks(risks) {
    if (!risks || risks.length === 0) {
      setCardContent('risks', '<p class="dp-no-issues">No significant risks detected.</p>');
      return;
    }
    const items = risks.map(r => `
      <div class="dp-risk dp-risk-${r.level}">
        <span class="dp-risk-badge">${r.level.toUpperCase()}</span>
        <div>
          <strong>${escapeHtml(r.category)}</strong>
          <p>${escapeHtml(r.description)}</p>
        </div>
      </div>`).join('');
    setCardContent('risks', items);
  }

  function renderResources(resources) {
    if (!resources || resources.length === 0) {
      setCardContent('resources', '<p class="dp-no-issues">No linked resources found.</p>');
      return;
    }
    const items = resources.map(r => {
      const href = r.url ? `href="${escapeHtml(r.url)}" target="_blank" rel="noopener"` : '';
      const tag = r.url ? 'a' : 'span';
      return `<div class="dp-resource">
        <span class="dp-resource-type">${escapeHtml(r.type)}</span>
        <${tag} class="dp-resource-title" ${href}>${escapeHtml(r.title)}</${tag}>
      </div>`;
    }).join('');
    setCardContent('resources', items);
  }

  function renderReviewers(reviewers) {
    if (!reviewers || reviewers.length === 0) {
      setCardContent('reviewers', '<p class="dp-no-issues">No suggestions available.</p>');
      return;
    }
    const items = reviewers.map(r => `
      <div class="dp-reviewer">
        <a href="https://github.com/${escapeHtml(r.username)}" target="_blank" rel="noopener" class="dp-reviewer-name">@${escapeHtml(r.username)}</a>
        <p class="dp-reviewer-reason">${escapeHtml(r.reason)}</p>
      </div>`).join('');
    setCardContent('reviewers', items);
  }

  // ─── Analyze ──────────────────────────────────────────────────────────────

  async function analyze() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    setLoading();

    const sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar) sidebar.classList.add('dp-open');

    try {
      const settings = await getSettings();

      if (!settings.githubToken) {
        ['summary', 'risks', 'resources', 'reviewers'].forEach(id =>
          setCardError(id, 'GitHub token not configured. Click the DevPilot icon to set it up.')
        );
        return;
      }

      const { owner, repo, prNumber } = getPRInfo();
      const backendUrl = settings.backendUrl || 'http://localhost:3000';

      // Hide actions from any previous analysis
      const actionsEl = document.getElementById('dp-actions');
      if (actionsEl) actionsEl.classList.remove('dp-actions-visible');
      lastAnalysis = null;
      lastPrMeta   = null;

      const payload = JSON.stringify({
        owner,
        repo,
        prNumber,
        githubToken: settings.githubToken,
        jiraBaseUrl: settings.jiraBaseUrl || null,
        jiraToken: settings.jiraToken || null
      });

      // Retry up to 2 times — Render free tier sleeps after inactivity (~30s wake-up)
      let res;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          res = await fetch(`${backendUrl}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
          break; // success — exit retry loop
        } catch (fetchErr) {
          if (attempt === 2) throw fetchErr;
          // Show waking-up message and wait before retrying
          const waitSecs = 15;
          setCardContent('summary', `<span class="dp-placeholder">Backend is waking up (attempt ${attempt + 1}/3)… retrying in ${waitSecs}s</span>`);
          await new Promise(r => setTimeout(r, waitSecs * 1000));
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Backend error ${res.status}`);
      }

      const data = await res.json();
      const { analysis } = data;

      renderSummary(analysis.summary || 'No summary returned.');
      renderRisks(analysis.risks);
      renderResources(analysis.resources);
      renderReviewers(analysis.reviewers);

      // Store for action buttons
      lastAnalysis = analysis;
      lastPrMeta   = { owner, repo, prNumber, prUrl: window.location.href, prTitle: document.title, backendUrl, settings };
      const el = document.getElementById('dp-actions');
      if (el) el.classList.add('dp-actions-visible');

    } catch (err) {
      console.error('[DevPilot]', err);
      const msg = err.message || 'Unexpected error. Check the console.';
      ['summary', 'risks', 'resources', 'reviewers'].forEach(id => setCardError(id, msg));
    } finally {
      isAnalyzing = false;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['githubToken', 'backendUrl', 'jiraBaseUrl', 'jiraToken', 'slackWebhook'],
        resolve
      );
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── HITL Modal ────────────────────────────────────────────────────────────

  function showModal({ title, previewText, confirmLabel, onConfirm }) {
    const overlay = document.createElement('div');
    overlay.id = 'dp-modal-overlay';
    overlay.innerHTML = `
      <div id="dp-modal">
        <div id="dp-modal-header">${escapeHtml(title)}</div>
        <div id="dp-modal-body">
          <p id="dp-modal-desc">Review what will be posted, then confirm:</p>
          <pre id="dp-modal-preview">${escapeHtml(previewText)}</pre>
        </div>
        <div id="dp-modal-footer">
          <button id="dp-modal-cancel">Cancel</button>
          <button id="dp-modal-confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#dp-modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#dp-modal-overlay')?.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#dp-modal-confirm').addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });
    // Close on background click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ─── Action: Post Review to GitHub ─────────────────────────────────────────

  async function postReview() {
    if (!lastAnalysis || !lastPrMeta) return;

    const { owner, repo, prNumber, backendUrl, settings } = lastPrMeta;

    // Build a short preview of what will be posted
    const riskLines = (lastAnalysis.risks || [])
      .map(r => `[${r.level.toUpperCase()}] ${r.category}: ${r.description}`)
      .join('\n') || 'No significant risks detected.';
    const previewText =
      `SUMMARY:\n${lastAnalysis.summary}\n\nRISKS:\n${riskLines}\n\nSUGGESTED REVIEWERS:\n` +
      (lastAnalysis.reviewers || []).map(r => `@${r.username} — ${r.reason}`).join('\n') ||
      'No suggestions.';

    showModal({
      title: 'Post Review to GitHub',
      previewText,
      confirmLabel: 'Post Comment',
      onConfirm: async () => {
        const btn = document.getElementById('dp-btn-comment');
        if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }

        try {
          const res = await fetch(`${backendUrl}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner, repo, prNumber,
              githubToken: settings.githubToken,
              analysis: lastAnalysis
            })
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            const msg = errText.includes('<!DOCTYPE') || errText.includes('<html')
              ? 'Backend is offline — wait 30s and retry'
              : errText.substring(0, 120) || `HTTP ${res.status}`;
            throw new Error(msg);
          }
          const data = await res.json();

          if (btn) {
            btn.textContent = 'Comment Posted!';
            btn.style.background = '#1f883d';
            btn.style.color = '#fff';
            if (data.commentUrl) {
              btn.onclick = () => window.open(data.commentUrl, '_blank');
              btn.title = 'Click to view comment';
            }
          }
        } catch (err) {
          console.error('[DevPilot] postReview', err);
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Post failed — retry?';
          }
        }
      }
    });
  }

  // ─── Action: Notify on Slack ───────────────────────────────────────────────

  async function notifySlack() {
    if (!lastAnalysis || !lastPrMeta) return;

    const { owner, repo, prNumber, prUrl, prTitle, backendUrl, settings } = lastPrMeta;
    const webhook = settings.slackWebhook;

    if (!webhook) {
      const btn = document.getElementById('dp-btn-notify');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Add webhook in Settings';
        setTimeout(() => { btn.textContent = orig; }, 3000);
      }
      return;
    }

    const btn = document.getElementById('dp-btn-notify');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
      const res = await fetch(`${backendUrl}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slackWebhook: webhook,
          analysis: lastAnalysis,
          prTitle, prUrl, owner, repo, prNumber
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const msg = errText.includes('<!DOCTYPE') || errText.includes('<html')
          ? 'Backend is offline — wait 30s and retry'
          : errText.substring(0, 120) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json();

      if (btn) {
        btn.textContent = 'Slack Notified!';
        btn.style.background = '#4a154b';
        btn.style.color = '#fff';
      }
    } catch (err) {
      console.error('[DevPilot] notifySlack', err);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Notify failed — retry?';
      }
    }
  }

  function onURLChange() {
    if (!isPRPage()) {
      const sidebar = document.getElementById(SIDEBAR_ID);
      if (sidebar) sidebar.remove();
      currentPRUrl = '';
      return;
    }

    if (window.location.href !== currentPRUrl) {
      currentPRUrl = window.location.href;
      init();
    }
  }

  // GitHub uses pushState for navigation — watch for it
  const _pushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _pushState(...args);
    setTimeout(onURLChange, 300);
  };
  window.addEventListener('popstate', () => setTimeout(onURLChange, 300));

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Remove any existing sidebar first
    const existing = document.getElementById(SIDEBAR_ID);
    if (existing) existing.remove();

    if (!isPRPage()) return;

    const sidebar = createSidebar();
    restoreOpenState(sidebar);
    currentPRUrl = window.location.href;

    // Auto-analyze on load
    analyze();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
