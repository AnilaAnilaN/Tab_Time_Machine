# Tab Time Machine

A Chrome extension that tracks your browsing sessions and lets you restore them later.

Chrome has bookmarks for saving pages you want to revisit. It has history for finding pages you already visited. What it doesn't have is any concept of a *work session*: the 12 tabs you had open while debugging that one issue, the research spread across 8 sites you pulled together last Tuesday, the context you'll definitely lose the moment you close the window.

Tab Time Machine tracks sessions automatically and lets you bring any of them back with one click.

---

## What it does

- **Records sessions automatically.** When you open Chrome and start browsing, a session starts. When you go idle for 20 minutes or close Chrome, the session ends and gets saved. No setup needed.

- **Groups tabs into sessions, not just a flat history.** Instead of "you visited GitHub at 2:47pm", it saves "here are the 11 tabs you had open together during that 45-minute block".

- **Categorizes what you were doing.** Sessions get tagged by activity type: dev work, AI tools, learning, communication, design, docs, social. You can see at a glance what a session was about without reading every URL.

- **Generates a short session summary.** Each session gets a one-line description based on what you were doing: "You spent time coding and building" or "An AI-assisted session". More useful than reading a list of domains.

- **Restores sessions in one click.** The "Restore session" button opens every tab from that session. Good for picking up where you left off.

- **Insights tab.** Shows total sessions, tab visits, estimated browse time, a breakdown by activity category, and your most visited domains across all recorded sessions.

- **Search.** Search across all sessions by URL, page title, or domain name.

- **Everything stays local.** All data is stored in `chrome.storage.local`. Nothing is sent anywhere.

---

## Installation

This extension isn't on the Chrome Web Store. To install it:

1. Download or clone this repo
2. Go to `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `tab-time-machine` folder

That's it. The extension starts recording immediately.

---

## File structure

```
tab-time-machine/
├── manifest.json
├── background.js           # Service worker — session tracking logic
├── storage/
│   └── sessionManager.js   # Session creation, tab categorization, story generation
├── utils/
│   └── time.js             # Date/time formatting helpers
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js            # UI rendering, search, restore, delete
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How sessions work

A session starts when:
- Chrome opens
- You come back from being idle (20+ minutes of inactivity)

A session ends when:
- You've been idle for 20 minutes
- Chrome closes (on next startup, the previous session is finalized)

Tabs that fire within 5 seconds of each other on the same URL are deduplicated, so quick reloads and redirects don't bloat the tab count. Chrome internal pages (`chrome://`, `about:`, new tab) are ignored.

Sessions are capped at 200 stored entries. The oldest ones get trimmed once you hit that limit.

---

## Permissions used

| Permission | Why |
|------------|-----|
| `tabs` | Read tab URLs and titles as you browse |
| `storage` | Save sessions locally |
| `idle` | Detect when you stop using the browser to end a session |
| `alarms` | Periodic background check for stale sessions |

No `history` permission. No `activeTab` snooping. No network requests.

---

## Known limitations

- Sessions don't survive if Chrome crashes rather than closing normally. The in-progress session at crash time won't be finalized.
- The 20-minute idle timeout is hardcoded. If you want a different threshold, change `IDLE_TIMEOUT_MINUTES` in `background.js`.
- Tab favicons are saved as URLs, so if you're offline when you open the popup, some favicons won't load.
- The extension tracks tab navigations, not time-on-page. A tab you opened and immediately ignored looks the same as one you spent an hour reading.

---

## Contributing

Pull requests are welcome. A few things that would improve it:

- Configurable idle timeout via an options page
- Export sessions as JSON or CSV
- Better session merging logic for very long continuous sessions
- A timeline view instead of the flat list

If you find a bug, open an issue with your Chrome version and a description of what happened.

---

