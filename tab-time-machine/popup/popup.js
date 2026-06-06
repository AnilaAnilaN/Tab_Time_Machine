// popup/popup.js — Tab Time Machine UI

let allSessions = [];
let currentSession = null;
let activeTab = 'sessions';
let searchQuery = '';
let expandedSessions = new Set();

const CATEGORY_COLORS = {
  dev:    '#60a5fa',
  ai:     '#a89dff',
  learn:  '#fbbf24',
  comms:  '#3ecf8e',
  design: '#ff5ca0',
  docs:   '#a5b4fc',
  social: '#fb923c',
  other:  '#5a5a70',
};

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSearch();
  setupButtons();
  loadData();
});

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderActiveTab();
    });
  });
}

function setupSearch() {
  const btnSearch = document.getElementById('btn-search');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const btnCloseSearch = document.getElementById('btn-close-search');

  btnSearch.addEventListener('click', () => {
    searchBar.style.display = 'flex';
    searchInput.focus();
  });

  btnCloseSearch.addEventListener('click', () => {
    searchBar.style.display = 'none';
    searchQuery = '';
    searchInput.value = '';
    renderSessions();
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderSessions();
  });
}

function setupButtons() {
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    showConfirm(
      'Clear <strong>all</strong> saved sessions? This cannot be undone.',
      () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, () => {
          allSessions = [];
          renderSessions();
          showToast('All sessions cleared');
        });
      }
    );
  });
}

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadData() {
  chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (response) => {
    document.getElementById('loading').style.display = 'none';

    if (chrome.runtime.lastError || !response) {
      console.error('Failed to load sessions');
      return;
    }

    allSessions = response.sessions || [];
    currentSession = response.currentSession || null;

    updateActiveBar();
    renderActiveTab();
  });
}

function updateActiveBar() {
  const bar = document.getElementById('active-bar');
  const tabCount = document.getElementById('active-tab-count');

  if (currentSession) {
    bar.style.display = 'flex';
    const count = currentSession.tabs ? currentSession.tabs.length : 0;
    tabCount.textContent = `${count} tab${count !== 1 ? 's' : ''}`;
  } else {
    bar.style.display = 'none';
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderActiveTab() {
  if (activeTab === 'sessions') {
    document.getElementById('sessions-panel').style.display = 'block';
    document.getElementById('insights-panel').style.display = 'none';
    renderSessions();
  } else {
    document.getElementById('sessions-panel').style.display = 'none';
    document.getElementById('insights-panel').style.display = 'block';
    renderInsights();
  }
}

function renderSessions() {
  const panel = document.getElementById('sessions-panel');
  const emptyState = document.getElementById('empty-state');

  let sessions = [...allSessions];

  // Apply search filter
  if (searchQuery) {
    sessions = sessions.filter(s =>
      s.tabs && s.tabs.some(t =>
        (t.url || '').toLowerCase().includes(searchQuery) ||
        (t.title || '').toLowerCase().includes(searchQuery) ||
        (t.domain || '').toLowerCase().includes(searchQuery)
      )
    );
  }

  if (sessions.length === 0) {
    panel.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  // Group by date
  const groups = {};
  sessions.forEach(s => {
    const label = TimeUtils.formatDate(s.startTime);
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  });

  panel.innerHTML = '';
  for (const [dateLabel, groupSessions] of Object.entries(groups)) {
    const groupEl = document.createElement('div');
    groupEl.className = 'date-group';
    groupEl.innerHTML = `<div class="date-label">${dateLabel}</div>`;
    panel.appendChild(groupEl);

    groupSessions.forEach(session => {
      panel.appendChild(buildSessionCard(session));
    });
  }
}

function buildSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card' + (expandedSessions.has(session.id) ? ' expanded' : '');
  card.dataset.id = session.id;

  const story = SessionManager.generateSessionStory(session);
  const duration = TimeUtils.formatDuration(session.startTime, session.endTime);
  const tabCount = session.tabs ? session.tabs.length : 0;
  const time = TimeUtils.formatTime(session.startTime);

  // Build cluster pills
  const clusterPills = Object.entries(session.clusters || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat]) => `<span class="cluster-pill pill-${cat}">${cat}</span>`)
    .join('');

  card.innerHTML = `
    <div class="session-header">
      <span class="session-time-badge">${time}</span>
      <div class="session-info">
        <div class="session-meta">
          <span class="session-duration">${duration}</span>
          <span class="session-tab-count">· ${tabCount} tab${tabCount !== 1 ? 's' : ''}</span>
        </div>
        ${clusterPills ? `<div class="cluster-pills">${clusterPills}</div>` : ''}
        <div class="session-story">${story}</div>
      </div>
      <div class="session-toggle"><i class="icon-chevron-down"></i></div>
    </div>
  `;

  // Tab list (hidden until expanded)
  const tabListEl = buildTabList(session);
  tabListEl.style.display = expandedSessions.has(session.id) ? 'block' : 'none';
  card.appendChild(tabListEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.className = 'session-actions';
  actionsEl.style.display = expandedSessions.has(session.id) ? 'flex' : 'none';
  actionsEl.innerHTML = `
    <button class="btn btn-restore"><i class="icon-rotate-ccw"></i> Restore session</button>
    <button class="btn btn-delete"><i class="icon-trash-2"></i></button>
  `;
  card.appendChild(actionsEl);

  // Toggle expand
  card.querySelector('.session-header').addEventListener('click', () => {
    const isExpanded = expandedSessions.has(session.id);
    if (isExpanded) {
      expandedSessions.delete(session.id);
      card.classList.remove('expanded');
      tabListEl.style.display = 'none';
      actionsEl.style.display = 'none';
    } else {
      expandedSessions.add(session.id);
      card.classList.add('expanded');
      tabListEl.style.display = 'block';
      actionsEl.style.display = 'flex';
    }
  });

  // Restore
  actionsEl.querySelector('.btn-restore').addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'RESTORE_SESSION', session }, () => {
      showToast(`Restoring ${tabCount} tab${tabCount !== 1 ? 's' : ''}…`);
    });
  });

  // Delete
  actionsEl.querySelector('.btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirm('Delete this session?', () => {
      chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId: session.id }, () => {
        allSessions = allSessions.filter(s => s.id !== session.id);
        expandedSessions.delete(session.id);
        renderSessions();
        showToast('Session deleted');
      });
    });
  });

  return card;
}

function buildTabList(session) {
  const el = document.createElement('div');
  el.className = 'tab-list';

  const tabs = session.tabs || [];
  // Deduplicate by URL, show latest visit
  const seen = new Set();
  const unique = [];
  for (let i = tabs.length - 1; i >= 0; i--) {
    if (!seen.has(tabs[i].url)) {
      seen.add(tabs[i].url);
      unique.unshift(tabs[i]);
    }
  }

  unique.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const faviconEl = tab.favicon
      ? `<img class="tab-favicon" src="${tab.favicon}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="tab-favicon-fallback" style="display:none"><i class="icon-globe"></i></span>`
      : `<span class="tab-favicon-fallback"><i class="icon-globe"></i></span>`;

    item.innerHTML = `
      ${faviconEl}
      <span class="tab-title" title="${tab.title || tab.url}">${tab.title || tab.domain || tab.url}</span>
      <span class="tab-domain">${tab.domain || ''}</span>
      <span class="tab-time">${TimeUtils.formatTime(tab.timestamp)}</span>
    `;
    el.appendChild(item);
  });

  return el;
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function renderInsights() {
  const panel = document.getElementById('insights-panel');

  const allTabs = allSessions.flatMap(s => s.tabs || []);
  const totalSessions = allSessions.length;
  const totalTabs = allTabs.length;

  // Category breakdown
  const catCounts = {};
  allTabs.forEach(t => {
    const c = t.category || 'other';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  const maxCat = Math.max(...Object.values(catCounts), 1);

  const catRows = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => {
      const pct = Math.round((count / maxCat) * 100);
      return `
        <div class="category-row">
          <span class="category-name">${cat}</span>
          <div class="category-bar-wrap">
            <div class="category-bar" style="width:${pct}%;background:${CATEGORY_COLORS[cat] || '#5a5a70'}"></div>
          </div>
          <span class="category-count">${count}</span>
        </div>`;
    }).join('');

  // Top domains
  const domainCounts = {};
  allTabs.forEach(t => {
    if (t.domain) domainCounts[t.domain] = (domainCounts[t.domain] || 0) + 1;
  });

  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([domain, count], i) => `
      <div class="domain-row">
        <span class="domain-rank">${i + 1}.</span>
        <span class="domain-name">${domain}</span>
        <span class="domain-visits">${count}</span>
      </div>`
    ).join('');

  // Total browsing time estimate (sum of session durations)
  const totalMs = allSessions.reduce((sum, s) => {
    return sum + ((s.endTime || Date.now()) - s.startTime);
  }, 0);
  const totalHours = (totalMs / 3600000).toFixed(1);

  panel.innerHTML = `
    <div class="insights-wrap">
      <div>
        <div class="insight-section-title">Overview</div>
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value">${totalSessions}</div>
            <div class="stat-label">Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalTabs}</div>
            <div class="stat-label">Tab visits</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalHours}h</div>
            <div class="stat-label">Browse time</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalSessions > 0 ? Math.round(totalTabs / totalSessions) : 0}</div>
            <div class="stat-label">Avg tabs/session</div>
          </div>
        </div>
      </div>

      ${catRows ? `
      <div>
        <div class="insight-section-title">By category</div>
        <div class="category-list">${catRows}</div>
      </div>` : ''}

      ${topDomains ? `
      <div>
        <div class="insight-section-title">Top sites</div>
        <div class="domain-list">${topDomains}</div>
      </div>` : ''}
    </div>
  `;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <p>${message}</p>
      <div class="confirm-actions">
        <button class="btn btn-danger" id="confirm-yes"><i class="icon-trash-2"></i> Delete</button>
        <button class="btn btn-cancel" id="confirm-no">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-yes').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  overlay.querySelector('#confirm-no').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2200);
}
