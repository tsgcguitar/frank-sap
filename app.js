console.log("app.js loaded");

// =====================
// 設定
// =====================
const PLAN_MAP = {
  bible_365: "data/plan_full_365.json",         // 你原本那份（如果還要留）
  ot_365: "data/plan_ot_365_fixed.json",
  nt_365: "data/plan_nt_365_fixed.json",
  gospels_365: "data/plan_gospels_365_fixed.json",
  mix_ot_nt_365: "data/plan_mix_ot_nt_365_fixed.json",
  psa_pro_365: "data/plan_psa_pro_365_fixed.json",
  chrono_365: "data/plan_chrono_365_fixed.json",
};

const SUPABASE_URL = "https://wqrcszwtakkxtykfzexm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p89YaCGUKJJ9WnVenxrbGQ_RrkPYu1s";

const USERNAME_EMAIL_DOMAIN = "bible.local";
const TOTAL_DAYS = 365;

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
// =====================
const BIBLE_COM_BASE = "https://www.bible.com/bible";
let BIBLE_ID = "46"; // CUNP-神

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

async function loadReadingPlanByKey(planKey) {
  const url = PLAN_MAP[planKey];
  if (!url) throw new Error(`未知的計畫 planKey: ${planKey}`);

  const res = await fetch(url, { cache: "no-store" });
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
let calMonth = new Date(); // ✅ 月曆顯示月份

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

// ✅ 微調：總天數固定 365 + 完成率用 completed/365
function computeStats() {
  const keys = Object.keys(progress.completed || {});
  const completedDays = keys.length;

  const totalDays = TOTAL_DAYS;
  const rateFloat = totalDays ? (completedDays / totalDays) * 100 : 0;

  return { totalDays, completedDays, rateFloat };
}

// =====================
// Calendar（月曆）
// =====================
function monthTitle(d) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y} 年 ${m} 月`;
}

function renderCalendar() {
  const table = el("calendar");
  if (!table) return;

  safeText("calTitle", monthTitle(calMonth));

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const startDow = first.getDay(); // 0=日
  const daysInMonth = last.getDate();

  table.innerHTML = "";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  ["日", "一", "二", "三", "四", "五", "六"].forEach((w) => {
    const th = document.createElement("th");
    th.textContent = w;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  let day = 1 - startDow;
  for (let row = 0; row < 6; row++) {
    const tr = document.createElement("tr");

    for (let col = 0; col < 7; col++, day++) {
      const td = document.createElement("td");

      if (day < 1 || day > daysInMonth) {
        td.className = "muted";
        td.innerHTML = "&nbsp;";
      } else {
        const d = new Date(year, month, day);
        const iso = toISODate(d);

        const top = document.createElement("div");
        top.className = "cal-day";
        top.textContent = String(day);

        const done = isCompleted(iso);
        const badge = document.createElement("div");
        badge.className = "cal-badge";
        badge.textContent = done ? "✅" : "";

        td.appendChild(top);
        td.appendChild(badge);

        td.style.cursor = "pointer";
        td.addEventListener("click", () => {
          viewDate = d;
          render();
        });

        const todayIso = toISODate(new Date());
        if (iso === todayIso) td.classList.add("today");
        if (done) td.classList.add("done");
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
    if (day > daysInMonth) break;
  }

  table.appendChild(tbody);
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

  // ✅ 微調：左格顯示 365、完成率顯示 1/365（0.27%）
  const { totalDays, completedDays, rateFloat } = computeStats();
  safeText("streak", String(totalDays));
  safeText("completed", String(completedDays));
  safeText("rate", `${completedDays} / ${totalDays}（${rateFloat.toFixed(2)}%）`);

  renderCalendar();

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
    // 沒選過計畫就問一次
  if (!progress.planKey) {
    const pick = prompt(
`請選擇讀經計畫（輸入數字）：
1 全本一年 (365)
2 舊約一年 (365)
3 新約一年 (365)
4 四福音一年 (365)
5 每日混讀 (舊+新)
6 詩篇+箴言 (靈修)
7 按時間順序 (Chronological)`,
"1"
    );

    const mapNumToKey = {
      "1": "bible_365",     // 如果你沒有這份，就改成你要的預設
      "2": "ot_365",
      "3": "nt_365",
      "4": "gospels_365",
      "5": "mix_ot_nt_365",
      "6": "psa_pro_365",
      "7": "chrono_365",
    };

    progress.planKey = mapNumToKey[String(pick || "1")] || "bible_365";
    await saveProgressSafe(); // 存起來
  }

  // 依 planKey 載入計畫
  await loadReadingPlanByKey(progress.planKey);

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
    const username = el("usernameusername")?.value; // ✅ 保留你的 UI 不動（這行沒用到就不影響）
    const password = el("password")?.value;
    const email = usernameToEmail(el("username")?.value);

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

    for (const r of readings) {
      const url = makeBibleComChapterUrl(r.book_id, r.chapter);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  // 月曆：上月/下月
  el("calPrev")?.addEventListener("click", () => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  el("calNext")?.addEventListener("click", () => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  
}

// =====================
// Boot
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    bindEvents();
  

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



