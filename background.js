// woops — background service worker
importScripts("config.js");
const BUILT_IN_KEYS = self.WOOPS_BUILT_IN_KEYS || {};
// Handles the Alt+W hotkey, injects woops into the current tab on demand,
// and sends Polish requests to free AI providers (Gemini, Groq, OpenRouter),
// falling back to the next one when a free quota runs out.

const DEFAULTS = {
  guardEnabled: true,
  switchCheck: true,
  switchWindowSec: 5,
  groupCheck: true,
  groupThreshold: 50,
  nameCheck: true,
  polishPill: true,
  defaultMode: "fix",
  provider: "gemini",
  models: {
    gemini: "gemini-3.5-flash",
    groq: "llama-3.3-70b-versatile",
    openrouter: "openrouter/free"
  }
};

const PROVIDER_ORDER = ["gemini", "groq", "openrouter"];
const PROVIDER_NAMES = { gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter" };
const GEMINI_SPARE_MODEL = "gemini-3.5-flash-lite"; // separate free quota, tried when the main model is rate-limited
const TIMEOUT_MS = 20000;

const STYLES = {
  fix: "Fix spelling, grammar, punctuation and capitalization only. Keep the user's own wording and tone.",
  professional: "Make it clear, polite and professional, suitable for work. Keep it about the same length.",
  casual: "Make it relaxed and friendly, and fix any errors. Keep it short.",
  shorter: "Make it as short as possible while keeping every important detail, and fix any errors."
};

const SYSTEM_PROMPT = [
  "You are woops, a careful editor for messages someone is about to send in a chat app or email.",
  "Rewrite the message in the requested style and reply with ONLY the rewritten message: no quotes, no preamble, no notes.",
  "Rules:",
  "- Keep the original language. If the message mixes languages (for example Hinglish), keep the same mix.",
  "- Keep the meaning, facts, names, numbers, links, emojis and line breaks.",
  "- Do not add greetings, sign-offs, apologies or new information.",
  "- If the message already fits the style, return it unchanged."
].join("\n");

const buildUserPrompt = (text, mode) => `Style: ${STYLES[mode] || STYLES.fix}\n\nMessage:\n<<<\n${text}\n>>>`;

function cleanOutput(out) {
  let t = String(out || "");
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  t = t.replace(/^<<<\s*/, "").replace(/\s*>>>$/, "");
  if (/^["“][\s\S]*["”]$/.test(t)) t = t.slice(1, -1);
  return t.trim();
}

function fail(code, provider, detail = "") {
  const e = new Error(`${PROVIDER_NAMES[provider] || provider}: ${code} ${detail}`.trim());
  e.code = code;
  e.provider = provider;
  return e;
}

async function post(url, headers, body, provider) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (res.ok) return data;
    const msg = (data?.error?.message || data?.message || "").toString();
    if (res.status === 401 || res.status === 403 || /api key|apikey|unauthor/i.test(msg)) throw fail("bad-key", provider, msg);
    if (res.status === 429 || /quota|rate limit|resource_exhausted/i.test(msg)) throw fail("rate-limit", provider, msg);
    if (res.status === 400) throw fail("bad-request", provider, msg);
    if (res.status === 404) throw fail("bad-model", provider, msg);
    throw fail("down", provider, `${res.status} ${msg}`);
  } catch (e) {
    if (e.code) throw e;
    throw fail("down", provider, e.name === "AbortError" ? "timed out" : String(e.message || e));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------- Providers ----------------------------

async function callGemini(key, model, text, mode, lowThinking = true) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(text, mode) }] }],
    generationConfig: { maxOutputTokens: 2048 }
  };
  if (lowThinking) body.generationConfig.thinkingConfig = { thinkingLevel: "low" };
  let data;
  try {
    data = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": key },
      body,
      "gemini"
    );
  } catch (e) {
    // Older models reject thinkingLevel; ask again without it.
    if (e.code === "bad-request" && lowThinking) return callGemini(key, model, text, mode, false);
    throw e;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const out = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  if (!out.trim()) throw fail("empty", "gemini");
  return cleanOutput(out);
}

async function callOpenAICompatible(provider, url, key, model, text, mode, extraHeaders = {}) {
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(text, mode) }
    ],
    max_tokens: 1024
  };
  if (/gpt-oss/.test(model)) body.reasoning_effort = "low";
  const data = await post(url, { authorization: `Bearer ${key}`, ...extraHeaders }, body, provider);
  const out = data?.choices?.[0]?.message?.content || "";
  if (!out.trim()) throw fail("empty", provider);
  return cleanOutput(out);
}

const MODEL_NAMES = {
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "llama-3.3-70b-versatile": "Llama 3.3 70B",
  "openai/gpt-oss-120b": "GPT-OSS 120B",
  "llama-3.1-8b-instant": "Llama 3.1 8B",
  "openrouter/free": "a free OpenRouter model"
};

function prettyModel(model) {
  if (MODEL_NAMES[model]) return MODEL_NAMES[model];
  return model
    .replace(/^.*\//, "")
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
    .replace(/\bGpt\b/, "GPT")
    .replace(/\bOss\b/, "OSS");
}

async function runProvider(provider, key, model, text, mode) {
  if (provider === "gemini") {
    try {
      return { text: await callGemini(key, model, text, mode), label: prettyModel(model) };
    } catch (e) {
      if (e.code === "rate-limit" && model !== GEMINI_SPARE_MODEL) {
        return { text: await callGemini(key, GEMINI_SPARE_MODEL, text, mode), label: prettyModel(GEMINI_SPARE_MODEL) };
      }
      throw e;
    }
  }
  if (provider === "groq") {
    const out = await callOpenAICompatible("groq", "https://api.groq.com/openai/v1/chat/completions", key, model, text, mode);
    return { text: out, label: prettyModel(model) + " on Groq" };
  }
  if (provider === "openrouter") {
    const out = await callOpenAICompatible("openrouter", "https://openrouter.ai/api/v1/chat/completions", key, model, text, mode, {
      "X-Title": "woops"
    });
    return { text: out, label: prettyModel(model) };
  }
  throw fail("unknown", provider);
}

async function polish(text, mode, onlyProvider) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const { keys: savedKeys = {} } = await chrome.storage.local.get({ keys: {} });
  const keys = { ...BUILT_IN_KEYS, ...savedKeys }; // your own saved key wins over the built-in one
  const models = { ...DEFAULTS.models, ...(settings.models || {}) };

  const order = onlyProvider ? [onlyProvider] : [settings.provider, ...PROVIDER_ORDER.filter((p) => p !== settings.provider)];
  const usable = order.filter((p) => keys[p]);
  if (!usable.length) throw fail("no-key", onlyProvider || settings.provider);

  let firstError = null;
  for (const p of usable) {
    try {
      return await runProvider(p, keys[p], models[p] || DEFAULTS.models[p], text, mode);
    } catch (e) {
      firstError = firstError || e;
      if (e.code === "rate-limit") firstError = e; // most useful thing to tell the user
    }
  }
  throw firstError;
}

async function bumpStat(key) {
  const { stats = { caught: 0, polished: 0 } } = await chrome.storage.local.get({ stats: { caught: 0, polished: 0 } });
  stats[key] = (stats[key] || 0) + 1;
  await chrome.storage.local.set({ stats });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "woops:polish" || msg?.type === "woops:test") {
    const text = msg.type === "woops:test" ? "hey can u send me teh file tmrw, i need to check it before the meting" : msg.text;
    polish(text, msg.mode || "fix", msg.provider)
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) =>
        sendResponse({ ok: false, code: e.code || "unknown", provider: e.provider, providerName: PROVIDER_NAMES[e.provider], error: String(e.message || e) })
      );
    return true;
  }
  if (msg?.type === "woops:stat") bumpStat(msg.key);
  if (msg?.type === "woops:open-settings") chrome.runtime.openOptionsPage();
  return false;
});

// ------------------------------ Hotkey ------------------------------

async function polishInTab(tab) {
  if (!tab?.id) return;
  const ping = { type: "woops:polish-now" };
  if (tab.url?.startsWith(chrome.runtime.getURL(""))) {
    chrome.runtime.sendMessage(ping).catch(() => {});
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, ping);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/woops.js"] });
      await chrome.tabs.sendMessage(tab.id, ping);
    } catch {
      // Chrome pages and the Web Store can't be scripted.
    }
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "polish") return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  polishInTab(tab);
});

async function saveHotkeyLabel() {
  const cmds = await chrome.commands.getAll();
  const polishCmd = cmds.find((c) => c.name === "polish");
  const label = polishCmd?.shortcut ? polishCmd.shortcut.replace(/\+/g, " ") : "";
  await chrome.storage.sync.set({ hotkeyLabel: label || "No shortcut" });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  current.models = { ...DEFAULTS.models, ...(current.models || {}) };
  await chrome.storage.sync.set(current);
  await saveHotkeyLabel();
  if (reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(saveHotkeyLabel);
