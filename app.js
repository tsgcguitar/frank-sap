// =====================
// 設定
// =====================
const PLAN_URL = "reading_plan_365.json";
const STORAGE_KEY = "bible_app_progress_v1";
const START_DATE_KEY = "bible_app_start_date_v1";

// =====================
// Supabase（登入 + 雲端同步）
// =====================
// ⚠️ 請務必用 Supabase 後台 Settings -> API 的 Project URL（完全一致）
// 你之前常見錯誤：...tykfzem vs ...tykfzexm（字母順序不同就會連不到）
const SUPABASE_URL = "https://wqrcszwtakkxtykfzexm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p89YaCGUKJJ9WnVenxrbGQ_RrkPYu1s";

// ✅ Supabase CDN 會提供 window.supabase（全域物件）
const hasSupabaseSDK = typeof window !== "undefined" && !!window.supabase;
const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabaseEnabled = hasSupabaseSDK && hasSupabaseConfig;

// ✅ 重要：不要用 supabase 當變數名（會跟 CDN 全域撞名）
const supabaseClient = supabaseEnabled
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentUser = null;

// =====================
// 小工具（DOM）
// =====================
const el = (id) => document.getElementById(id);
function on(id, event, handler) {
  const node = el(id);
  if (!node) return;
  node.addEventListener(event, handler);
}

// Supabase 啟用時：要求先登入才顯示讀經內容
function setAppVisible(isAuthed) {
  const app = el("appContent");
  const hint = el("loginHint");
  if (app) app.style.display = isAuthed ? "block" : "none";
  if (hint) hint.style.display = isAuthed ? "none" : "block";
}

function setSupabaseHint(msg = "") {
  const hint = el("supabaseHint");
  if (!hint) return;

  if (!hasSupabaseSDK) {
    hint.textContent = "（Supabase SDK 未載入，請確認 index.html script）";
    return;
  }
  if (!hasSupabaseConfig) {
    hint.textContent = "（尚未填入 Supabase Project URL / Key）";
    return;
  }
  hint.textContent = msg;
}

async function refreshAuthUI() {
  const who = el("whoami");
  const btnLogout = el("btnLogout");
  const btnLogin = el("btnLogin");
  const btnSignup = el("btnSignup");

  if (who) who.textContent = currentUser?.email || "未登入";
  if (btnLogout) btnLogout.disabled = !currentUser;

  const disableAuth = !supabaseEnabled;
  if (btnLogin) btnLogin.disabled = disableAuth;
  if (btnSignup) btnSignup.disabled = disableAuth;
}

// =====================
// DB
// =====================
async function dbLoadProgress(userId) {
  const { data, error } = await supabaseClient
    .from("user_progress")
    .select("progress_data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.progress_data || { start_date: "", completed: {} };
}

async function dbSaveProgress(userId, progressData) {
  const { error } = await supabaseClient
    .from("user_progress")
    .upsert(
      {
        user_id: userId,
        progress_data: progressData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}

// =====================
// Bible.com / YouVersion 外連（繁中：CUNP-神）
// =====================
const YOUVERSION_BIBLE_ID = 46;
const YOUVERSION_VERSION_CODE = "CUNP-神";

const BOOK_OSIS = {
  "Genesis":"GEN","Exodus":"EXO","Leviticus":"LEV","Numbers":"NUM","Deuteronomy":"DEU",
  "Joshua":"JOS","Judges":"JDG","Ruth":"RUT","1 Samuel":"1SA","2 Samuel":"2SA",
  "1 Kings":"1KI","2 Kings":"2KI","1 Chronicles":"1CH","2 Chronicles":"2CH","Ezra":"EZR",
  "Nehemiah":"NEH","Esther":"EST","Job":"JOB","Psalms":"PSA","Proverbs":"PRO",
  "Ecclesiastes":"ECC","Song of Solomon":"SNG","Isaiah":"ISA","Jeremiah":"JER","Lamentations":"LAM",
  "Ezekiel":"EZK","Daniel":"DAN","Hosea":"HOS","Joel":"JOL","Amos":"AMO","Obadiah":"OBA","Jonah":"JON",
  "Micah":"MIC","Nahum":"NAM","Habakkuk":"HAB","Zephaniah":"ZEP","Haggai":"HAG","Zechariah":"ZEC","Malachi":"MAL",
  "Matthew":"MAT","Mark":"MRK","Luke":"LUK","John":"JHN","Acts":"ACT",
  "Romans":"ROM","1 Corinthians":"1CO","2 Corinthians":"2CO","Galatians":"GAL","Ephesians":"EPH","Philippians":"PHP",
  "Colossians":"COL","1 Thessalonians":"1TH","2 Thessalonians":"2TH","1 Timothy":"1TI","2 Timothy":"2TI","Titus":"TIT",
  "Philemon":"PHM","Hebrews":"HEB","James":"JAS","1 Peter":"1PE","2 Peter":"2PE","1 John":"1JN","2 John":"2JN",
  "3 John":"3JN","Jude":"JUD","Revelation":"REV"
};

function toOsis(bookEn) {
  return BOOK_OSIS[String(bookEn || "").trim()] || "";
}

function youVersionUrl(osis, chapter) {
  const v = encodeURIComponent(YOUVERSION_VERSION_CODE);
  return `https://www.bible.com/bible/${YOUVERSION_BIBLE_ID}/${osis}.${chapter}.${v}`;
}

// =====================
// 小工具（日期/字串）
// =====================
function pad2(n){ return String(n).padStart(2, "0"); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseISODate(s) { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); }
function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function daysBetween(a, b) {
  const ms = 24*60*60*1000;
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / ms);
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// =====================
// localStorage（僅未啟用 Supabase 時用）
// =====================
function loadProgressLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: {} };
    const obj = JSON.parse(raw);
    if (!obj.completed) obj.completed = {};
    return obj;
  } catch {
    return { completed: {} };
  }
}
function saveProgressLocal(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p, null, 2)); }
function getStartDateLocal() { return localStorage.getItem(START_DATE_KEY) || ""; }
function setStartDateLocal(s) { localStorage.setItem(START_DATE_KEY, s); }

// =====================
// Progress（Supabase: 必須登入；未啟用 Supabase 才允許 localStorage）
// =====================
let progress = { completed: {} };
let startDateCache = "";
function getStartDate() { return startDateCache || ""; }
function setStartDate(s) { startDateCache = s || ""; }

async function loadAllProgress() {
  if (supabaseEnabled && !currentUser) {
    progress = { completed: {} };
    startDateCache = "";
    return;
  }
  if (!supabaseEnabled) {
    progress = loadProgressLocal();
    startDateCache = getStartDateLocal();
    return;
  }
  const pd = await dbLoadProgress(currentUser.id);
  progress = { completed: pd.completed || {} };
  startDateCache = pd.start_date || "";
}

async function saveAllProgress() {
  if (supabaseEnabled && !currentUser) return;

  if (!supabaseEnabled) {
    saveProgressLocal(progress);
    setStartDateLocal(startDateCache);
    return;
  }

  await dbSaveProgress(currentUser.id, {
    start_date: startDateCache,
    completed: progress.completed || {},
  });
}

// =====================
// 主流程
// =====================
let plan = null;
let targetDate = new Date();

async function loadPlan() {
  const res = await fetch(PLAN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load plan: ${res.status}`);
  plan = await res.json();
}

function getDayIndexByDate(date) {
  const start = getStartDate();
  if (!start) return null;
  const startDate = parseISODate(start);
  return daysBetween(startDate, date) + 1;
}

function getReadingsForDay(dayIndex) {
  const arr = plan?.plan;
  if (!Array.isArray(arr)) return null;
  return arr.find(x => Number(x.day) === Number(dayIndex)) || null;
}

function groupReadings(readings) {
  const groups = [];
  for (const r of readings) {
    const bookEn = r.book_en || r.bookEn || "";
    const bookZh = r.book_zh || r.bookZh || r.book || "";
    const chap = Number(r.chapter);
    const last = groups[groups.length - 1];
    if (last && last.bookEn === bookEn && chap === last.end + 1) last.end = chap;
    else groups.push({ bookEn, bookZh, start: chap, end: chap });
  }
  return groups;
}

// =====================
// UI Render
// =====================
function render() {
    // ✅ 保險：有些瀏覽器/情況 cache 可能是空，但 input 有值
  if (!getStartDate() && el("startDate")?.value) {
    setStartDate(el("startDate").value);
  }
  const start = getStartDate();
  if (el("startDate")) el("startDate").value = start;
  if (el("targetDateText")) el("targetDateText").textContent = toISODate(targetDate);

  if (!start) {
    if (el("dayIndex")) el("dayIndex").textContent = "-";
    if (el("rangeHint")) el("rangeHint").textContent = "先設定起始日";
    if (el("readingList")) el("readingList").innerHTML = `<li>請先設定「讀經計畫起始日」</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  const dayIndex = getDayIndexByDate(targetDate);
  if (el("dayIndex")) el("dayIndex").textContent = String(dayIndex);

  const totalDays = Number(plan?.days || 365);
  if (dayIndex < 1 || dayIndex > totalDays) {
    if (el("rangeHint")) el("rangeHint").textContent = `超出 ${totalDays} 天範圍`;
    if (el("readingList")) el("readingList").innerHTML = `<li>第 ${dayIndex} 天超出 ${totalDays} 天計畫範圍</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj || !Array.isArray(dayObj.readings)) {
    if (el("rangeHint")) el("rangeHint").textContent = "找不到資料";
    if (el("readingList")) el("readingList").innerHTML = `<li>找不到第 ${dayIndex} 天資料</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  const grouped = groupReadings(dayObj.readings);
  if (el("rangeHint")) el("rangeHint").textContent = grouped.length ? `${grouped.length} 段` : "-";

  const dateKey = toISODate(targetDate);
  const checked = !!progress.completed[dateKey];

  if (el("checkin")) {
    el("checkin").textContent = checked ? "今日已完成 ✅" : "完成今日 ✅";
    el("checkin").disabled = checked;
  }
  if (el("undo")) el("undo").disabled = !checked;
  if (el("openAll")) el("openAll").disabled = false;

  if (el("readingList")) {
    el("readingList").innerHTML = grouped.map(g => {
      const titleZh = (g.start === g.end)
        ? `${g.bookZh} 第 ${g.start} 章`
        : `${g.bookZh} 第 ${g.start}–${g.end} 章`;

      const titleEn = (g.start === g.end)
        ? `${g.bookEn} ${g.start}`
        : `${g.bookEn} ${g.start}-${g.end}`;

      const osis = toOsis(g.bookEn);
      const right = osis
        ? `<button class="btn ghost open-yv"
             data-osis="${osis}"
             data-start="${g.start}"
             data-end="${g.end}">
             開啟/聆聽（Bible.com）
           </button>`
        : `<span class="hint">找不到書卷代碼：${escapeHtml(g.bookEn)}</span>`;

      return `
        <li>
          <div>
            <div class="label">${escapeHtml(titleZh)}</div>
            <div class="hint">${escapeHtml(titleEn)}</div>
          </div>
          <div class="row right">${right}</div>
        </li>
      `;
    }).join("");

    document.querySelectorAll(".open-yv").forEach(btn => {
      btn.addEventListener("click", () => {
        const osis = btn.dataset.osis;
        const startC = Number(btn.dataset.start);
        const endC = Number(btn.dataset.end);
        for (let c = startC; c <= endC; c++) {
          window.open(youVersionUrl(osis, c), "_blank", "noopener,noreferrer");
        }
      });
    });
  }

  updateStats();
  updateRawData();
  renderCalendar();
}

function setButtonsDisabled(disabled) {
  if (el("checkin")) el("checkin").disabled = disabled || el("checkin").disabled;
  if (el("undo")) el("undo").disabled = disabled || el("undo").disabled;
  if (el("openAll")) el("openAll").disabled = disabled;
}

function updateStats() {
  if (!el("completed") || !el("rate") || !el("streak")) return;

  const completedDates = Object.keys(progress.completed).filter(k => progress.completed[k]);
  const completedCount = completedDates.length;

  const totalDays = plan?.days ? Number(plan.days) : 365;
  const rate = totalDays ? (completedCount / totalDays) : 0;

  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(today, -i);
    const key = toISODate(d);
    if (progress.completed[key]) streak++;
    else break;
  }

  el("completed").textContent = String(completedCount);
  el("rate").textContent = `${Math.round(rate * 1000) / 10}%`;
  el("streak").textContent = String(streak);
}

function updateRawData() {
  if (!el("rawData")) return;
  el("rawData").value = JSON.stringify(progress, null, 2);
}

// =====================
// Calendar
// =====================
let calDate = new Date();

function renderCalendar() {
  const cal = el("calendar");
  if (!cal) return;

  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  const title = el("calTitle");
  if (title) title.textContent = `${year} 年 ${month + 1} 月`;

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = `
    <tr>
      <th>日</th><th>一</th><th>二</th><th>三</th>
      <th>四</th><th>五</th><th>六</th>
    </tr>
    <tr>
  `;

  let cell = 0;
  for (let i = 0; i < startWeekday; i++) { html += "<td></td>"; cell++; }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = toISODate(date);
    const isToday = toISODate(date) === toISODate(new Date());
    const isDone = !!progress.completed[iso];

    html += `
      <td class="${isToday ? "today" : ""} ${isDone ? "done" : ""}" data-date="${iso}">
        ${d}
      </td>
    `;

    cell++;
    if (cell % 7 === 0) html += "</tr><tr>";
  }

  html += "</tr>";
  cal.innerHTML = html;

  cal.querySelectorAll("td[data-date]").forEach(td => {
    td.addEventListener("click", () => {
      targetDate = parseISODate(td.dataset.date);
      calDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      render();
    });
  });
}

// =====================
// TTS
// =====================
function speakToday() {
  if (!window.speechSynthesis) return alert("此瀏覽器不支援語音朗讀");
  const dayIndex = getDayIndexByDate(targetDate);
  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj) return;

  const grouped = groupReadings(dayObj.readings);
  const lines = grouped.map(g => {
    const range = (g.start === g.end) ? `第 ${g.start} 章` : `第 ${g.start} 到 ${g.end} 章`;
    return `${g.bookZh} ${range}`;
  });

  const text = `今天是第 ${dayIndex} 天。今日讀經：${lines.join("。")}。`;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-TW";
  u.rate = 1.0;
  window.speechSynthesis.speak(u);
}
function stopSpeak() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// =====================
// Events（安全綁定）
// =====================
on("saveStartDate", "click", async () => {
  const v = el("startDate")?.value;
  if (!v) return;

  setStartDate(v);

  // ✅ 讓畫面立刻有「今天」可算的 dayIndex（避免顯示 -）
  targetDate = new Date();
  calDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);

  await saveAllProgress();
  render();
});

on("prevDay", "click", () => { targetDate = addDays(targetDate, -1); render(); });
on("nextDay", "click", () => { targetDate = addDays(targetDate,  1); render(); });
on("today",   "click", () => { targetDate = new Date(); render(); });

on("checkin", "click", async () => {
  const key = toISODate(targetDate);
  progress.completed[key] = true;
  await saveAllProgress();
  render();
});
on("undo", "click", async () => {
  const key = toISODate(targetDate);
  delete progress.completed[key];
  await saveAllProgress();
  render();
});

on("export", "click", () => {
  if (!el("rawData")) return;
  el("rawData").value = JSON.stringify(progress, null, 2);
  el("rawData").focus();
  el("rawData").select();
});
on("import", "click", async () => {
  if (!el("rawData")) return;
  try {
    const obj = JSON.parse(el("rawData").value);
    if (!obj || typeof obj !== "object") throw new Error("JSON 格式錯誤");
    if (!obj.completed || typeof obj.completed !== "object") obj.completed = {};
    progress = { completed: obj.completed };
    await saveAllProgress();
    render();
    alert("匯入成功");
  } catch (e) {
    alert(`匯入失敗：${e.message || e}`);
  }
});
on("reset", "click", async () => {
  if (!confirm("確定要清空全部打卡紀錄嗎？")) return;
  progress = { completed: {} };
  await saveAllProgress();
  render();
});

// Auth
on("btnSignup", "click", async () => {
  if (!supabaseEnabled) return alert("Supabase 未啟用（請檢查 URL/Key 或 index.html script）");
  const email = (el("email")?.value || "").trim();
  const password = el("password")?.value || "";
  if (!email || !password) return alert("請輸入 Email 與密碼");

  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return alert(error.message);
  alert("註冊成功！若有 Email 驗證，請先驗證後再登入。");
});

on("btnLogin", "click", async () => {
  if (!supabaseEnabled) return alert("Supabase 未啟用（請檢查 URL/Key 或 index.html script）");
  const email = (el("email")?.value || "").trim();
  const password = el("password")?.value || "";
  if (!email || !password) return alert("請輸入 Email 與密碼");

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  currentUser = data.user;
  await refreshAuthUI();

  setAppVisible(true);
  if (!plan) await loadPlan();
  await loadAllProgress();
  render();
});

on("btnLogout", "click", async () => {
  if (!supabaseEnabled) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  await refreshAuthUI();
  setAppVisible(false);
});

// Open all / TTS / Calendar
on("openAll", "click", () => {
  const start = getStartDate();
  if (!start) return;
  const dayIndex = getDayIndexByDate(targetDate);
  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj || !Array.isArray(dayObj.readings)) return;

  for (const r of dayObj.readings) {
    const bookEn = r.book_en || r.bookEn || "";
    const chap = Number(r.chapter);
    const osis = toOsis(bookEn);
    if (!osis || !chap) continue;
    window.open(youVersionUrl(osis, chap), "_blank", "noopener,noreferrer");
  }
});

on("ttsPlay", "click", speakToday);
on("ttsStop", "click", stopSpeak);

on("calPrev", "click", () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
on("calNext", "click", () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

// =====================
// Boot（程式進入點）
// =====================
(async function boot(){
  try {
    // ✅ 永遠先隱藏主內容（避免閃現）
    setAppVisible(false);
    setSupabaseHint("");

    // Supabase 啟用：必須登入才顯示
    if (supabaseEnabled) {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error(error);
        setSupabaseHint("（Supabase 連線失敗：請確認 Project URL/Key）");
        await refreshAuthUI();
        return;
      }

      currentUser = data?.session?.user || null;
      await refreshAuthUI();

      if (!currentUser) {
        setAppVisible(false);
        return;
      }

      setAppVisible(true);
      await loadPlan();
      await loadAllProgress();
      render();
      return;
    }

    // 未啟用 Supabase：本機模式（如果你想完全禁用本機模式，我也可以幫你改）
    setSupabaseHint("（未啟用 Supabase：本機模式 localStorage）");
    setAppVisible(true);
    await loadPlan();
    await loadAllProgress();
    render();

  } catch (e) {
    console.error(e);
    const list = el("readingList");
    if (list) {
      list.innerHTML = `
        <li>
          載入失敗：<br/>
          1) 請確認 reading_plan_365.json 存在<br/>
          2) GitHub Pages 需同層路徑正確<br/>
        </li>
      `;
    }
  }
})();


