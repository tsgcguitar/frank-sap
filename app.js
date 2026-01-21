console.log("app.js loaded");

// =====================
// 設定
// =====================
const PLAN_URL = "data/reading_plan_365.json";

const SUPABASE_URL = "https://wqrcszwtakkxtykfzexm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p89YaCGUKJJ9WnVenxrbGQ_RrkPYu1s";

const USERNAME_EMAIL_DOMAIN = "bible.local";

// =====================
// Supabase client（只建立一次）
// =====================
if (!window.supabase?.createClient) {
  console.error("Supabase SDK not loaded. Fix index.html script order.");
}
window._sb = window._sb || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sb = window._sb;

// =====================
// DOM helpers
// =====================
const el = (id) => document.getElementById(id);
const safeText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const show = (id, on, displayValue = "") => { const n = el(id); if (n) n.style.display = on ? displayValue : "none"; };

function setAuthMsg(msg = "") {
  safeText("authMsg", msg);
}

function usernameToEmail(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return null;
  return `${u}@${USERNAME_EMAIL_DOMAIN}`;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISODate(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// =====================
// Bible.com 外連（和合本）
// 你要改這個：BIBLE_ID
// 方式：打開 Bible.com 的和合本任一章，網址 /bible/XXXX/GEN.1 的 XXXX
// =====================
const BIBLE_COM_BASE = "https://www.bible.com/bible";
let BIBLE_ID = "46"; // ← 改成你 Bible.com 和合本的 XXXX（很重要）

const BOOK_MAP = {
  gen: "GEN", exo: "EXO", lev: "LEV", num: "NUM", deu: "DEU",
  jos: "JOS", jdg: "JDG", rut: "RUT",
  "1sa": "1SA", "2sa": "2SA",
  "1ki": "1KI", "2ki": "2KI",
  "1ch": "1CH", "2ch": "2CH",
  ezr: "EZR", neh: "NEH", est: "EST",
  job: "JOB", psa: "PSA", pro: "PRO", ecc: "ECC", sng: "SNG",
  isa: "ISA", jer: "JER", lam: "LAM", ezk: "EZK", dan: "DAN",
  hos: "HOS", jol: "JOL", amo: "AMO", oba: "OBA", jon: "JON", mic: "MIC",
  nam: "NAM", hab: "HAB", zep: "ZEP", hag: "HAG", zec: "ZEC", mal: "MAL",
  mat: "MAT", mrk: "MRK", luk: "LUK", jhn: "JHN", act: "ACT",
  rom: "ROM", "1co": "1CO", "2co": "2CO", gal: "GAL", eph: "EPH", php: "PHP",
  col: "COL", "1th": "1TH", "2th": "2TH", "1ti": "1TI", "2ti": "2TI",
  tit: "TIT", phm: "PHM", heb: "HEB", jas: "JAS",
  "1pe": "1PE", "2pe": "2PE", "1jn": "1JN", "2jn": "2JN", "3jn": "3JN",
  jud: "JUD", rev: "REV",
};

function makeBibleComChapterUrl(book_id, chapter) {
  const code = BOOK_MAP[String(book_id || "").toLowerCase()];
  if (!code) return null;
  return `${BIBLE_COM_BASE}/${BIBLE_ID}/${code}.${chapter}`;
}

// =====================
// Reading plan
// JSON: { plan: [ { day:1, readings:[{book_zh,chapter,book_id,...}, ...] }, ... ] }
// =====================
let readingPlan = [];

async function loadReadingPlan() {
  const res = await fetch(PLAN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`讀經計畫載入失敗：${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data?.plan)) {
    throw new Error("讀經計畫格式錯誤：找不到 plan array（預期 { plan: [...] }）");
  }
  readingPlan = data.plan;
}

// =====================
// Progress (DB)
// =====================
let progress = { startDate: "", completed: {} }; // completed: { "YYYY-MM-DD": true }
let warnedDb = false;

function normalizeProgress(p) {
  return {
    startDate: p?.startDate || "",
    completed: p?.completed || {}
  };
}

async function loadProgressSafe() {
  try {
    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr) throw userErr;
    if (!user) throw new Error("not login");

    const { data, error } = await sb
      .from("user_progress")
      .select("progress_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const empty = normalizeProgress({});
      const { error: insErr } = await sb
        .from("user_progress")
        .insert({ user_id: user.id, progress_data: empty });
      if (insErr) throw insErr;
      return empty;
    }

    return normalizeProgress(data.progress_data);
  } catch (e) {
    console.error("loadProgress failed:", e);
    if (!warnedDb) {
      warnedDb = true;
      setAuthMsg("⚠️ 進度資料庫讀取失敗（可使用，但無法同步進度）");
      alert("loadProgress failed: " + (e?.message || JSON.stringify(e)));
    }
    return { startDate: "", completed: {} };
  }
}

async function saveProgressSafe() {
  try {
    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr) throw userErr;
    if (!user) throw new Error("not login");

    const { error } = await sb
      .from("user_progress")
      .upsert({ user_id: user.id, progress_data: progress }, { onConflict: "user_id" });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("saveProgress failed:", e);
    alert("⚠️ 儲存進度失敗（Supabase 400/RLS/constraint）\n\n" + (e?.message || JSON.stringify(e)));
    return false;
  }
}

// =====================
// App state
// =====================
let viewDate = new Date();

function getStartDate() {
  if (!progress.startDate) {
    progress.startDate = toISODate(new Date());
  }
  return parseISODate(progress.startDate);
}

function dayIndexFromStart(dateObj) {
  const start = getStartDate();

  const a = new Date(dateObj);
  a.setHours(0, 0, 0, 0);

  const b = new Date(start);
  b.setHours(0, 0, 0, 0);

  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / 86400000) + 1; // Day 1 start
}

function getPlanForDayIndex(dayIndex) {
  if (!readingPlan.length) return null;
  const idx = clamp(dayIndex, 1, readingPlan.length) - 1;
  return readingPlan[idx] || null;
}

function isCompleted(isoDate) {
  return !!progress.completed?.[isoDate];
}

function setCompleted(isoDate, done) {
  if (!progress.completed) progress.completed = {};
  if (done) progress.completed[isoDate] = true;
  else delete progress.completed[isoDate];
}

function computeStats() {
  const keys = Object.keys(progress.completed || {});
  const completedDays = keys.length;

  // streak：從今天往回算連續完成
  let streak = 0;
  let d = new Date();
  for (;;) {
    const iso = toISODate(d);
    if (progress.completed?.[iso]) {
      streak += 1;
      d = addDays(d, -1);
    } else {
      break;
    }
  }

  // rate：已完成 / 已過天數（上限 365）
  const start = getStartDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const passed = Math.max(1, Math.floor((today - start) / 86400000) + 1);
  const denom = Math.min(passed, readingPlan.length || passed);
  const rate = denom ? Math.round((completedDays / denom) * 100) : 0;

  return { streak, completedDays, rate };
}

// =====================
// Render
// =====================
function renderReadingList(dayIndex) {
  const list = el("readingList");
  if (!list) return;

  list.innerHTML = "";

  const plan = getPlanForDayIndex(dayIndex);
  const readings = plan?.readings || [];

  if (!readings.length) {
    const li = document.createElement("li");
    li.textContent = "（無今日章節）";
    list.appendChild(li);
    return;
  }

  for (const r of readings) {
    const li = document.createElement("li");
    const a = document.createElement("a");

    const text = `${r.book_zh || r.book_en || r.book_id || ""} ${r.chapter || ""}`.trim();
    a.textContent = text;

    const url = makeBibleComChapterUrl(r.book_id, r.chapter);
    if (url) {
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else {
      a.href = "#";
    }

    li.appendChild(a);
    list.appendChild(li);
  }
}

function render() {
  const iso = toISODate(viewDate);
  safeText("targetDateText", iso);

  const dayIndex = dayIndexFromStart(new Date(viewDate));
  safeText("dayIndex", String(dayIndex));

  safeText("rangeHint", readingPlan.length ? `共 ${readingPlan.length} 天` : "-");

  if (el("startDate")) el("startDate").value = progress.startDate || "";

  renderReadingList(dayIndex);

  const { streak, completedDays, rate } = computeStats();
  safeText("streak", String(streak));
  safeText("completed", String(completedDays));
  safeText("rate", String(rate));

  const raw = el("rawData");
  if (raw) raw.value = JSON.stringify({ progress, planLoaded: readingPlan.length, dayIndex }, null, 2);
}

// =====================
// Auth UI
// =====================
function showLoggedOut() {
  show("authCard", true);
  show("appWrap", false);
  show("userBar", false);
}

async function showLoggedIn(session) {
  show("authCard", false);
  show("appWrap", true, "block");
  show("userBar", true, "flex");

  const user = session.user;
  safeText("userNameText", user.user_metadata?.username || user.email.split("@")[0]);

  progress = await loadProgressSafe();
  render();
}

async function refreshAuth() {
  const { data: { session }, error } = await sb.auth.getSession();
  if (error) {
    console.error(error);
    showLoggedOut();
    return;
  }
  if (!session) showLoggedOut();
  else await showLoggedIn(session);
}

// =====================
// Events
// =====================
let _bound = false;

function bindEvents() {
  if (_bound) return;
  _bound = true;

  document.addEventListener("submit", (e) => e.preventDefault());

  el("btnRegister")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setAuthMsg("");
    const username = el("username")?.value;
    const password = el("password")?.value;
    const email = usernameToEmail(username);

    if (!email) { setAuthMsg("Username 格式錯誤"); return; }
    if (!password || password.length < 6) { setAuthMsg("密碼至少 6 碼"); return; }

    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });

    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("already")) setAuthMsg("此帳號已註冊，請直接按「登入」");
      else setAuthMsg(msg);
      return;
    }
    setAuthMsg("註冊成功，請直接登入");
  });

  el("btnLogin")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setAuthMsg("");
    const username = el("username")?.value;
    const password = el("password")?.value;
    const email = usernameToEmail(username);

    if (!email) { setAuthMsg("Username 格式錯誤"); return; }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setAuthMsg(error.message || "登入失敗"); return; }

    await refreshAuth();
  });

  // 你 HTML 有兩個 btnLogout（userBar 一個、authCard 一個）
  document.querySelectorAll("#btnLogout").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await sb.auth.signOut();
      showLoggedOut();
    });
  });

  el("saveStartDate")?.addEventListener("click", async () => {
    const v = el("startDate")?.value;
    if (v) progress.startDate = v;
    await saveProgressSafe();
    render();
  });

  el("prevDay")?.addEventListener("click", () => { viewDate = addDays(viewDate, -1); render(); });
  el("today")?.addEventListener("click", () => { viewDate = new Date(); render(); });
  el("nextDay")?.addEventListener("click", () => { viewDate = addDays(viewDate, +1); render(); });

  el("checkin")?.addEventListener("click", async () => {
    const iso = toISODate(viewDate);
    setCompleted(iso, true);
    await saveProgressSafe();
    render();
  });

  el("undo")?.addEventListener("click", async () => {
    const iso = toISODate(viewDate);
    setCompleted(iso, false);
    await saveProgressSafe();
    render();
  });

  el("openAll")?.addEventListener("click", () => {
    const dayIndex = dayIndexFromStart(new Date(viewDate));
    const plan = getPlanForDayIndex(dayIndex);
    const readings = plan?.readings || [];
    if (!readings.length) { alert("無今日章節"); return; }

    // 依序開啟（可能被 popup 擋，建議使用者允許）
    for (const r of readings) {
      const url = makeBibleComChapterUrl(r.book_id, r.chapter);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  // 朗讀/停止：先保留按鈕不報錯（你要朗讀內容，之後要有經文來源才行）
  el("ttsPlay")?.addEventListener("click", () => {
    alert("朗讀需要有「經文內容」來源。外連 Bible.com 沒辦法直接抓全文朗讀。若你要朗讀，我可以幫你做『開啟外連後朗讀標題』或改用可授權 API。");
  });
  el("ttsStop")?.addEventListener("click", () => {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  });
}

// =====================
// Boot
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    bindEvents();
    await loadReadingPlan();

    const hasToken = Object.keys(localStorage).some(k => k.includes("sb-") && k.includes("auth-token"));
    if (hasToken) {
      const { data } = await sb.auth.getSession();
      if (data?.session) {
        await showLoggedIn(data.session);
        return;
      }
    }

    sb.auth.onAuthStateChange((_event, session) => {
      if (session) showLoggedIn(session);
      else showLoggedOut();
    });

    await refreshAuth();
  } catch (e) {
    console.error(e);
    alert(e?.message || String(e));
  }
});
