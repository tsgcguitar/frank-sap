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
const show = (id, on) => { const n = el(id); if (n) n.style.display = on ? "" : "none"; };

function setAuthMsg(msg = "") {
  const box = el("authMsg");
  if (box) box.textContent = msg;
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

// =====================
// Reading plan
// 期待 JSON 格式：[{ date:"2026-01-01", ref:"創世記 1-3" }, ...]
// 或：[{ ref:"..." }, ...]（至少要有 ref）
// =====================
let readingPlan = [];
async function loadReadingPlan() {
  const res = await fetch(PLAN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`讀經計畫載入失敗：${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("讀經計畫格式錯誤：JSON 必須是 array");
  readingPlan = data;
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

async function loadProgress() {
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
}

async function saveProgress() {
  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("not login");

  const { error } = await sb
    .from("user_progress")
    .upsert({ user_id: user.id, progress_data: progress }, { onConflict: "user_id" });

  if (error) throw error;
}

// =====================
// App state
// =====================
let viewDate = new Date(); // 今天/前一天/後一天 用這個切
function getStartDate() {
  // 沒設定就用今天
  if (!progress.startDate) progress.startDate = toISODate(new Date());
  return parseISODate(progress.startDate);
}

function dayIndexFromStart(dateObj) {
  const start = getStartDate();
  const ms = dateObj.setHours(0,0,0,0) - start.setHours(0,0,0,0);
  return Math.floor(ms / 86400000) + 1; // 第1天起算
}

function getPlanForDayIndex(dayIndex) {
  if (!readingPlan.length) return null;
  const idx = Math.max(1, dayIndex) - 1;
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

// =====================
// UI
// =====================
function showLoggedOut() {
  show("authCard", true);
  show("appWrap", false);
  show("userBar", false);
}

async function showLoggedIn(session) {
  show("authCard", false);
  show("appWrap", true);
  show("userBar", true);

  const user = session.user;
  safeText("userNameText", user.user_metadata?.username || (user.email ? user.email.split("@")[0] : "user"));

  progress = await loadProgress();
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

function render() {
  const iso = toISODate(viewDate);
  safeText("targetDateText", iso);

  // 第幾天
  const dayIndex = dayIndexFromStart(new Date(viewDate));
  safeText("dayIndexText", `今天是第 ${dayIndex} 天`);

  // 今日章節
  const plan = getPlanForDayIndex(dayIndex);
  const refs = plan?.ref || plan?.refs || plan?.chapter || "";
  safeText("todayRefsText", refs ? String(refs) : "（找不到今日章節，請確認 reading_plan_365.json 格式）");

  // 完成狀態
  const done = isCompleted(iso);
  const btnDone = el("btnMarkDone");
  const btnUndo = el("btnUndo");
  if (btnDone) btnDone.disabled = done;
  if (btnUndo) btnUndo.disabled = !done;

  // debug
  const raw = el("rawData");
  if (raw) raw.value = JSON.stringify({ progress, planLoaded: readingPlan.length }, null, 2);
}

// =====================
// Events
// =====================
function bindEvents() {
  // Register
  el("btnRegister")?.addEventListener("click", async () => {
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

    if (error) { setAuthMsg(error.message); return; }
    setAuthMsg("註冊成功，請直接登入");
  });

  // Login
  el("btnLogin")?.addEventListener("click", async () => {
    setAuthMsg("");
    const username = el("username")?.value;
    const password = el("password")?.value;
    const email = usernameToEmail(username);

    if (!email) { setAuthMsg("Username 格式錯誤"); return; }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setAuthMsg(error.message); return; }

    await refreshAuth();
  });

  // Logout
  el("btnLogout")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    showLoggedOut();
  });

  // Mark done
  el("btnMarkDone")?.addEventListener("click", async () => {
    try {
      const iso = toISODate(viewDate);
      setCompleted(iso, true);
      await saveProgress();
      render();
    } catch (e) {
      console.error(e);
      alert(`保存失敗：${e.message || e}`);
    }
  });

  // Undo
  el("btnUndo")?.addEventListener("click", async () => {
    try {
      const iso = toISODate(viewDate);
      setCompleted(iso, false);
      await saveProgress();
      render();
    } catch (e) {
      console.error(e);
      alert(`保存失敗：${e.message || e}`);
    }
  });

  // Prev / Next / Today (如果你有這些按鈕 id)
  el("btnPrevDay")?.addEventListener("click", () => { viewDate = addDays(viewDate, -1); render(); });
  el("btnNextDay")?.addEventListener("click", () => { viewDate = addDays(viewDate, 1); render(); });
  el("btnToday")?.addEventListener("click", () => { viewDate = new Date(); render(); });

  // Start date save (如果你有輸入框與按鈕 id)
  el("btnSaveStartDate")?.addEventListener("click", async () => {
    try {
      const v = el("startDateInput")?.value;
      if (!v) return;
      progress.startDate = v;
      await saveProgress();
      render();
    } catch (e) {
      console.error(e);
      alert(`保存起始日失敗：${e.message || e}`);
    }
  });
}

// =====================
// Boot
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    bindEvents();
    await loadReadingPlan(); // ✅ 沒有這行，你就會「裡面東西不見」
    sb.auth.onAuthStateChange(() => refreshAuth());
    await refreshAuth();
    render();
  } catch (e) {
    console.error(e);
    alert(e.message || e);
  }
});
