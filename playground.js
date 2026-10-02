// woops playground — a pretend chat app shaped like WhatsApp Web's markup,
// so the real content script runs against it unchanged.

const inExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;

const teamNames = "Aarav Neha Kabir Isha Rohan Meera Arjun Tara Dev Anaya Vikram Zoya Nikhil Sara Kunal Riya Aditya Pooja Farhan Divya Ishaan Leela Manav Nisha Om Pari Raghav Sana Tanvi Uday Vani Yash Zara Aman Bhavna Chirag Diya Eshan Gauri Harsh Inaya Jai Kavya Laksh Mira Naveen Ojas Prisha Qasim Ritu Samar Trisha Ujjwal Varun Waqar Yamini Zubin Abhay Bela Chetan Daksh Ekta Gopal".split(" ");

const CHATS = [
  {
    name: "Product Team",
    members: [...teamNames.slice(0, 63), "You"],
    hue: 265,
    messages: [
      ["in", "Neha", "Reminder: launch review moves to 4pm today."],
      ["in", "Kabir", "Deck is in the shared folder, final-final-v3 😅"]
    ]
  },
  {
    name: "Priya Sharma",
    sub: "online",
    hue: 330,
    messages: [
      ["in", null, "did you get a chance to look at the proposal?"],
      ["out", null, "on it, will send notes by tonight"]
    ]
  },
  {
    name: "Weekend Trek",
    members: ["Aarav", "Neha", "Kabir", "Isha", "Rohan", "You"],
    hue: 190,
    messages: [
      ["in", "Isha", "Bus leaves at 5:30am sharp, don't be late"],
      ["in", "Rohan", "who's bringing the stove?"]
    ]
  },
  {
    name: "Mom",
    sub: "last seen today at 9:12",
    hue: 40,
    messages: [["in", null, "Call me when you're free beta ❤️"]]
  }
];

let current = 1;

const $ = (s) => document.querySelector(s);
const chatsEl = $("#chats");
const messagesEl = $("#messages");
const composer = $("#main footer .composer");

function renderList() {
  chatsEl.innerHTML = "";
  CHATS.forEach((c, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "chat" + (i === current ? " active" : "");
    b.innerHTML = `<span class="dot" style="--h:${c.hue}"></span><span class="chat-name"></span><span class="chat-meta"></span>`;
    b.querySelector(".chat-name").textContent = c.name;
    b.querySelector(".chat-meta").textContent = c.members ? `${c.members.length} people` : "";
    b.onclick = () => openChat(i);
    li.appendChild(b);
    chatsEl.appendChild(li);
  });
}

function openChat(i) {
  if (CHATS[current]) CHATS[current].draft = composer.innerText;
  current = i;
  composer.textContent = CHATS[i].draft || "";
  const c = CHATS[i];
  $("#chat-title").textContent = c.name;
  $("#chat-title").title = c.name;
  const sub = c.members ? c.members.join(", ") : c.sub;
  $("#chat-sub").textContent = sub;
  $("#chat-sub").title = sub;
  $("#avatar").style.setProperty("--h", c.hue);
  renderList();
  renderMessages();
  composer.focus();
}

function renderMessages() {
  messagesEl.innerHTML = "";
  for (const [dir, who, text] of CHATS[current].messages) {
    const m = document.createElement("div");
    m.className = "msg " + dir;
    if (who) {
      const w = document.createElement("span");
      w.className = "msg-who";
      w.textContent = who;
      m.appendChild(w);
    }
    const t = document.createElement("span");
    t.textContent = text;
    m.appendChild(t);
    messagesEl.appendChild(m);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function send() {
  const text = composer.innerText.trim();
  if (!text) return;
  CHATS[current].messages.push(["out", null, text]);
  composer.innerHTML = "";
  renderMessages();
}

composer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
$("#main footer .send").addEventListener("click", send);

// ------------------------------------------------------------------
// Offline stand-in for the AI, used only when this page is opened as a
// plain file. Inside the extension, Polish uses your real AI engine.
// ------------------------------------------------------------------
const FIXES = {
  u: "you", ur: "your", r: "are", pls: "please", plz: "please", thx: "thanks", tmrw: "tomorrow", tmr: "tomorrow",
  im: "I'm", dont: "don't", cant: "can't", wont: "won't", didnt: "didn't", isnt: "isn't", doesnt: "doesn't",
  ill: "I'll", ive: "I've", idk: "I don't know", btw: "by the way", reveiw: "review", recieve: "receive",
  teh: "the", definately: "definitely", wierd: "weird", seperate: "separate", untill: "until", alot: "a lot",
  becuase: "because", beacuse: "because", wanna: "want to", gonna: "going to", abt: "about", msg: "message",
  i: "I", ok: "okay", meting: "meeting", tommorow: "tomorrow", tomorow: "tomorrow"
};

function basicFix(text) {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/[\p{L}']+/gu, (w) => {
    const r = FIXES[w.toLowerCase()];
    if (!r) return w;
    return w[0] === w[0].toUpperCase() && w.toLowerCase() !== "i" ? r[0].toUpperCase() + r.slice(1) : r;
  });
  t = t.replace(/^(hey|hi|hello)\s+([a-z])(\w*)\s+/i, (_, g, a, b) => `${g[0].toUpperCase() + g.slice(1)} ${a.toUpperCase()}${b}, `);
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  t = t.replace(/\s+,/g, ",").replace(/,(?=\S)/g, ", ");
  t = t.replace(/\btomorrow meeting\b/gi, "tomorrow's meeting");
  t = t.replace(/(\b(can|could|would|will|did|do|are|is)\s+you\b[^.!?]*?)(,\s+)(I\s)/i, "$1? $4");
  if (!/[.!?…)]$/u.test(t) && !/\p{Extended_Pictographic}$/u.test(t)) {
    const lastClause = t.split(/[.!?]\s+/).pop().replace(/^(Hey|Hi|Hello)\s+\w+,\s*/, "");
    t += /^(can|could|would|will|did|do|are|is|what|when|where|who|why|how)\b/i.test(lastClause) ? "?" : ".";
  }
  return t;
}

async function mockPolish(text, mode) {
  await new Promise((r) => setTimeout(r, 900));
  let t = basicFix(text);
  if (mode === "professional") {
    t = t
      .replace(/^Hey\b/, "Hi")
      .replace(/\bcan you\b/gi, "could you please")
      .replace(/\bASAP\b/g, "as soon as possible")
      .replace(/\bkinda\b/gi, "somewhat")
      .replace(/\s*😅|\s*lol\b/gi, "");
    if (!/thank/i.test(t)) t = t.replace(/([.?!])$/, "$1 Thank you.");
  } else if (mode === "casual") {
    t = t.replace(/^Hi\b/, "Hey").replace(/\bcould you please\b/gi, "can you").replace(/\.$/, "");
  } else if (mode === "shorter") {
    t = t
      .replace(/\b(just|really|basically|actually|honestly|literally|very|I think|kind of|sort of)\s+/gi, "")
      .replace(/\bin order to\b/gi, "to")
      .replace(/\bbefore tomorrow's meeting\b/gi, "before the meeting");
  }
  return { ok: true, text: t.replace(/\s{2,}/g, " ").trim(), label: "the offline demo" };
}

window.WOOPS_PREVIEW = {
  forceWhatsApp: true,
  mockAI: !inExtension,
  cssHref: "content/woops.css",
  fontHref: "assets/fonts/Sora.woff2",
  polish: mockPolish
};

// The real Alt+W shortcut is handled by Chrome inside the extension.
// When this page is opened as a plain file, listen for it here instead.
if (!inExtension) {
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.code === "KeyW") {
      e.preventDefault();
      window.__woops?.polish(null);
    }
  });
}

if (inExtension) {
  chrome.storage.sync.get({ hotkeyLabel: "Alt W" }).then(({ hotkeyLabel }) => ($("#hk").textContent = hotkeyLabel));
} else if (/Mac/.test(navigator.platform)) {
  $("#hk").textContent = "⌥W";
}

$("#theme").addEventListener("click", (e) => {
  const light = document.body.classList.toggle("light");
  e.currentTarget.textContent = light ? "Dark chat" : "Light chat";
  e.currentTarget.setAttribute("aria-pressed", String(light));
});

openChat(current);
