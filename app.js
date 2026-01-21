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

function normalizeProgress(p) {
  return {
    startDate: p?.startDate || "",
    completed: p?.completed || {}
  };
}

// ⚠️ 你目前 DB 400，很可能是 RLS/constraint/欄位名問題
// 我先讓畫面不會因為 DB 壞掉而沒內容：讀不到就用空 progress
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
    // 只提示一次，避免一直跳
    safeText("authMsg", "⚠️ 進度資料庫讀取失敗（先可正常使用，但無法同步進度）");
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

  // rate：已完成 / 計畫天數（或已過天數）
  const start = getStartDate();
  const today = new Date();
  today.setHours(0,0,0,0);
  start.setHours(0,0,0,0);
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

  // 依 book_id/英文名 生成 Bible.com 連結（用 NIV/和合本你可再調）
  // 這裡先用你已有資料顯示「中文 + 章」
  for (const r of readings) {
    const li = document.createElement("li");
    const text = `${r.book_zh || r.book_en || r.book_id || ""} ${r.chapter || ""}`.trim();
    li.textContent = text;
    list.appendChild(li);
  }
}

function render() {
  const iso = toISODate(viewDate);
  safeText("targetDateText", iso);

  const dayIndex = dayIndexFromStart(new Date(viewDate));
  safeText("dayIndex", String(dayIndex));

  // 顯示章節清單
  renderReadingList(dayIndex);

  // 範圍提示
  safeText("rangeHint", readingPlan.length ? `共 ${readingPlan.length} 天` : "-");

  // 起始日 input
  if (el("startDate")) el("startDate").value = progress.startDate || "";

  // 進度 stats
  const { streak, completedDays, rate } = computeStats();
  safeText("streak", String(streak));
  safeText("completed", String(completedDays));
  safeText("rate", String(rate));

  // debug
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

  // 防止 form submit
  document.addEventListener("submit", (e) => e.preventDefault());

  // Register/Login/Logout
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

  // 你 HTML 有兩個 btnLogout（上面 userBar 一個、authCard 也一個）
  // 用 querySelectorAll 綁兩個
  document.querySelectorAll("#btnLogout").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await sb.auth.signOut();
      showLoggedOut();
    });
  });

  // 起始日儲存
  el("saveStartDate")?.addEventListener("click", async () => {
    const v = el("startDate")?.value;
    if (v) progress.startDate = v;
    await saveProgressSafe();
    render();
  });

  // 日期切換
  el("prevDay")?.addEventListener("click", () => { viewDate = addDays(viewDate, -1); render(); });
  el("today")?.addEventListener("click", () => { viewDate = new Date(); render(); });
  el("nextDay")?.addEventListener("click", () => { viewDate = addDays(viewDate, +1); render(); });

  // 打卡/取消
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

  // 一鍵開啟：把今日章節逐一開啟（先用 alert/console，避免被 popup 擋）
  el("openAll")?.addEventListener("click", () => {
    const dayIndex = dayIndexFromStart(new Date(viewDate));
    const plan = getPlanForDayIndex(dayIndex);
    const readings = plan?.readings || [];
    if (!readings.length) { alert("無今日章節"); return; }
    alert("若瀏覽器擋彈出視窗，請允許此網站彈出視窗。\n將逐章開啟：" + readings.length + " 章");
    // TODO：你想用 Bible.com 連結，我再幫你接 URL
  });
}

// =====================
// Boot
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    bindEvents();
    await loadReadingPlan();

    // localStorage 有 token 的話，先嘗試直接顯示登入
    const hasToken = Object.keys(localStorage).some(k => k.includes("sb-") && k.includes("auth-token"));
    if (hasToken) {
      const { data } = await sb.auth.getSession();
      if (data?.session) {
        await showLoggedIn(data.session);
        return;
      }
    }

    // 正常 auth 流程
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
