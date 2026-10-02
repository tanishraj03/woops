# woops

Catches messages headed to the wrong chat on WhatsApp Web, and polishes any message you're about to send.

## Install (developer mode)

1. Unzip this folder somewhere you'll keep it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `woops` folder.
5. The settings page opens. Under **Free AI**, click **Get a free Gemini key**, paste it, and press **Save**. woops tests it right away.
6. Optional: add a free Groq or OpenRouter key too. When one free quota runs out, woops switches to the next.

## Your API key

This version has no key built in. Each person adds their own free key in settings, and woops saves it in their own browser. Keys never leave that browser except to call the AI provider they belong to.

## Use it

- **Polish:** type anywhere, press **Alt W** (⌥W on Mac). Pick Fix, Professional, Casual or Shorter. Enter uses it, Esc keeps yours, Undo is in the toast.
- **Wrong-chat guard:** just use WhatsApp Web. woops only asks when you switched chats a few seconds ago, you're in a big group, or you greeted someone who isn't in the chat.
- **Playground:** click the woops icon, then **Try it in the playground** to test everything on fake chats.
- Change the shortcut at `chrome://extensions/shortcuts`.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Permissions, hotkey, where scripts run |
| `background.js` | Hotkey, injects woops into the current tab, calls Gemini, Groq or OpenRouter with fallback |
| `content/woops.js` | Guard, Polish button, review card, diff |
| `content/woops.css` | Liquid glass styles for everything on the page |
| `panel/` | Settings (toolbar popup and options page) |
| `playground.*` | Practice chat app |

## When WhatsApp changes its page

If the guard stops showing up, open `content/woops.js` and update the `WA` selectors block near the top (chat title, member list, message box). Nothing else should need to change.

## Before publishing

- "Woops" is already used by another extension on the Chrome Web Store, so pick a distinct name.
- In the store's privacy form, say that message text is sent to the AI provider the user picked (Gemini, Groq or OpenRouter) only when they press Polish.
- Free tiers may use submitted text to improve their models. The settings page says so; keep that note.
- Model names change often. They live in `MODEL_NAMES` in `background.js` and `PROVIDERS` in `panel/panel.js`.
