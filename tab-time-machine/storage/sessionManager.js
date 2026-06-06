// storage/sessionManager.js
// Shared session management logic

const SESSION_IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const MAX_SESSIONS = 200;
const MAX_TABS_PER_SESSION = 500;

const IGNORED_URLS = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'newtab',
  'edge://',
];

function shouldIgnoreUrl(url) {
  if (!url) return true;
  return IGNORED_URLS.some(prefix => url.startsWith(prefix) || url.includes(prefix));
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function classifyDomain(domain) {
  const categories = {
    dev: ['github.com', 'gitlab.com', 'stackoverflow.com', 'developer.mozilla.org', 'npmjs.com', 'codepen.io', 'replit.com', 'vercel.com', 'netlify.com', 'heroku.com'],
    docs: ['docs.', 'documentation.', 'wiki.', 'man.', 'devdocs.io', 'readthedocs.io'],
    ai: ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai', 'copilot.microsoft.com', 'bard.google.com'],
    learn: ['youtube.com', 'udemy.com', 'coursera.org', 'medium.com', 'dev.to', 'hashnode.dev', 'substack.com'],
    comms: ['mail.google.com', 'outlook.com', 'slack.com', 'discord.com', 'teams.microsoft.com', 'notion.so', 'linear.app'],
    design: ['figma.com', 'dribbble.com', 'behance.net', 'canva.com', 'sketch.com'],
    social: ['twitter.com', 'x.com', 'linkedin.com', 'reddit.com', 'instagram.com', 'facebook.com'],
  };

  for (const [cat, domains] of Object.entries(categories)) {
    if (domains.some(d => domain.includes(d))) return cat;
  }
  return 'other';
}

function createSession() {
  return {
    id: 'session_' + Date.now(),
    startTime: Date.now(),
    endTime: null,
    tabs: [],
    clusters: {},
  };
}

function addTabToSession(session, tab) {
  if (shouldIgnoreUrl(tab.url)) return session;

  const domain = getDomain(tab.url);
  const category = classifyDomain(domain);

  // Avoid duplicates within 5 seconds
  const recent = session.tabs[session.tabs.length - 1];
  if (recent && recent.url === tab.url && Date.now() - recent.timestamp < 5000) {
    return session;
  }

  const entry = {
    url: tab.url,
    title: tab.title || domain,
    domain,
    category,
    timestamp: Date.now(),
    favicon: tab.favIconUrl || null,
  };

  const tabs = session.tabs.length >= MAX_TABS_PER_SESSION
    ? session.tabs.slice(-MAX_TABS_PER_SESSION + 1)
    : session.tabs;

  // Update clusters
  const clusters = { ...session.clusters };
  clusters[category] = (clusters[category] || 0) + 1;

  return { ...session, tabs: [...tabs, entry], clusters };
}

function finalizeSession(session) {
  return { ...session, endTime: Date.now() };
}

function generateSessionStory(session) {
  const { tabs, clusters } = session;
  if (!tabs || tabs.length === 0) return 'No activity recorded.';

  const topCategory = Object.entries(clusters || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  const uniqueDomains = [...new Set(tabs.map(t => t.domain))];
  const duration = session.endTime
    ? Math.round((session.endTime - session.startTime) / 60000)
    : Math.round((Date.now() - session.startTime) / 60000);

  const stories = {
    dev: `You spent time coding and building — hitting GitHub, Stack Overflow, and documentation along the way.`,
    ai: `An AI-assisted session — asking questions, exploring ideas, and iterating with tools like ChatGPT or Claude.`,
    learn: `A learning-focused session — reading articles, watching videos, and absorbing new material.`,
    comms: `You were in communication mode — managing emails, Slack, and team coordination.`,
    design: `A creative session — exploring designs, mockups, and visual ideas.`,
    docs: `Deep in documentation — reading specs, references, and technical manuals.`,
    social: `A social/browsing session — catching up on feeds and conversations.`,
    other: `A general browsing session across ${uniqueDomains.length} different site${uniqueDomains.length !== 1 ? 's' : ''}.`,
  };

  const story = stories[topCategory] || stories.other;
  const durationText = duration < 1 ? 'under a minute' : duration === 1 ? '1 minute' : `${duration} minutes`;

  return `${story} Lasted ${durationText}.`;
}

// eslint-disable-next-line no-unused-vars
const SessionManager = { createSession, addTabToSession, finalizeSession, generateSessionStory, shouldIgnoreUrl };
