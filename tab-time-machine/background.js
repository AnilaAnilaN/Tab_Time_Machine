// background.js — Tab Time Machine service worker

importScripts('storage/sessionManager.js');

const IDLE_DETECTION_INTERVAL = 60; // seconds
const IDLE_TIMEOUT_MINUTES = 20;
const STORAGE_KEY = 'ttm_sessions';
const CURRENT_SESSION_KEY = 'ttm_current_session';
const MAX_STORED_SESSIONS = 200;

let debounceTimer = null;

// ─── Session state ──────────────────────────────────────────────────────────

async function getCurrentSession() {
  const result = await chrome.storage.local.get(CURRENT_SESSION_KEY);
  return result[CURRENT_SESSION_KEY] || null;
}

async function saveCurrentSession(session) {
  await chrome.storage.local.set({ [CURRENT_SESSION_KEY]: session });
}

async function clearCurrentSession() {
  await chrome.storage.local.remove(CURRENT_SESSION_KEY);
}

async function startSession() {
  const existing = await getCurrentSession();
  if (existing) return existing;

  const session = SessionManager.createSession();
  await saveCurrentSession(session);
  console.log('[TTM] Session started:', session.id);
  return session;
}

async function endSession() {
  const session = await getCurrentSession();
  if (!session || session.tabs.length === 0) {
    await clearCurrentSession();
    return;
  }

  const finalized = SessionManager.finalizeSession(session);
  await persistSession(finalized);
  await clearCurrentSession();
  console.log('[TTM] Session ended:', finalized.id, 'tabs:', finalized.tabs.length);
}

async function persistSession(session) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const sessions = result[STORAGE_KEY] || [];

  // Trim oldest if needed
  const updated = [session, ...sessions].slice(0, MAX_STORED_SESSIONS);
  await chrome.storage.local.set({ [STORAGE_KEY]: updated });
}

// ─── Tab tracking ───────────────────────────────────────────────────────────

async function handleTabEvent(tab) {
  if (!tab || SessionManager.shouldIgnoreUrl(tab.url)) return;

  let session = await getCurrentSession();
  if (!session) {
    session = await startSession();
  }

  const updated = SessionManager.addTabToSession(session, tab);
  await saveCurrentSession(updated);

  // Debounced storage flush
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const s = await getCurrentSession();
    if (s) await saveCurrentSession(s);
  }, 1000);
}

// ─── Event listeners ────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    handleTabEvent(tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  handleTabEvent(tab);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    handleTabEvent(tab);
  } catch (_) {
    // Tab may have been closed
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[TTM] Browser started — new session');
  await startSession();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[TTM] Extension installed');
  await startSession();
  chrome.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL);
});

// ─── Idle detection ─────────────────────────────────────────────────────────

chrome.idle.onStateChanged.addListener(async (state) => {
  console.log('[TTM] Idle state:', state);
  if (state === 'idle' || state === 'locked') {
    await endSession();
  } else if (state === 'active') {
    await startSession();
  }
});

// ─── Alarm for periodic session flush ───────────────────────────────────────

chrome.alarms.create('ttm_flush', { periodInMinutes: IDLE_TIMEOUT_MINUTES });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'ttm_flush') {
    const session = await getCurrentSession();
    if (session) {
      // If session has been running a long time with no new tabs, finalize it
      const lastTab = session.tabs[session.tabs.length - 1];
      if (lastTab) {
        const msSinceLast = Date.now() - lastTab.timestamp;
        if (msSinceLast > IDLE_TIMEOUT_MINUTES * 60 * 1000) {
          await endSession();
        }
      }
    }
  }
});

// ─── Message handler (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SESSIONS') {
    (async () => {
      const result = await chrome.storage.local.get([STORAGE_KEY, CURRENT_SESSION_KEY]);
      sendResponse({
        sessions: result[STORAGE_KEY] || [],
        currentSession: result[CURRENT_SESSION_KEY] || null,
      });
    })();
    return true; // async response
  }

  if (message.type === 'RESTORE_SESSION') {
    const { tabs } = message.session;
    tabs.forEach(tab => {
      chrome.tabs.create({ url: tab.url });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'DELETE_SESSION') {
    (async () => {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const sessions = (result[STORAGE_KEY] || []).filter(s => s.id !== message.sessionId);
      await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'CLEAR_ALL') {
    (async () => {
      await chrome.storage.local.remove([STORAGE_KEY, CURRENT_SESSION_KEY]);
      sendResponse({ ok: true });
    })();
    return true;
  }
});
