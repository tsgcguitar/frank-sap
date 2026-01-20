// =====================
// 設定
// =====================
// 讀經計畫檔案（與 index.html 同一層）
// 如果你有放在 data/ 目錄，也可以改回 "data/reading_plan_365.json"。
const PLAN_URL = "reading_plan_365.json";
const STORAGE_KEY = "bible_app_progress_v1";
const START_DATE_KEY = "bible_app_start_date_v1";

// =====================
// Supabase（登入 + 雲端同步）
// =====================
// 1) 到 Supabase 專案 Settings -> API
// 2) 填入 Project URL 與 anon public key
// 沒填也能跑：會自動退回 localStorage 模式（不登入也可打卡）。
const SUPABASE_URL = "https://wqrcszwtakkxtykfzexm.supabase.co";      // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "sb_publishable_p89YaCGUKJJ9WnVenxrbGQ_RrkPYu1s"; // e.g. eyJhbGciOi...

const supabaseEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const supabase = supabaseEnabled ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let currentUser = null; // supabase auth user

// Supabase 啟用時：要求先登入才顯示讀經內容（每個人各自的進度）
function setAppVisible(isAuthed) {
  const app = document.getElementById("appContent");
  const hint = document.getElementById("loginHint");
  if (app) app.style.display = isAuthed ? "block" : "none";
  if (hint) hint.style.display = isAuthed ? "none" : "block";
}

function setSupabaseHint() {
  const hint = document.getElementById("supabaseHint");
  if (!hint) return;
  if (supabaseEnabled) {
    hint.textContent = "";
  } else {
    hint.textContent = "（目前未設定 Supabase，將使用本機模式 localStorage）";
  }
}

async function refreshAuthUI() {
  const who = document.getElementById("whoami");
  const btnLogout = document.getElementById("btnLogout");
  const btnLogin = document.getElementById("btnLogin");
  const btnSignup = document.getElementById("btnSignup");
  if (who) who.textContent = currentUser?.email || "未登入";
  if (btnLogout) btnLogout.disabled = !currentUser;

  // 若未設定 Supabase，登入/註冊按鈕先禁用，避免誤會
  const disableAuth = !supabaseEnabled;
  if (btnLogin) btnLogin.disabled = disableAuth;
  if (btnSignup) btnSignup.disabled = disableAuth;
}

async function dbLoadProgress(userId) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("progress_data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.progress_data || { start_date: "", completed: {} };
}

async function dbSaveProgress(userId, progressData) {
  const { error } = await supabase
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
// 注意：YouVersion 沒有提供給外部任意使用的公開 API，因此這裡採「外連到閱讀/聆聽頁」
const YOUVERSION_BIBLE_ID = 46;          // CUNP-神
const YOUVERSION_VERSION_CODE = "CUNP-神";

// book_en (全名) -> OSIS 書卷縮寫（GEN/EXO/...）
// 直接內建最穩，不依賴 books.json 格式
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
  const v = encodeURIComponent(YOUVERSION_VERSION_CODE); // CUNP-%E7%A5%9E
  return `https://www.bible.com/bible/${YOUVERSION_BIBLE_ID}/${osis}.${chapter}.${v}`;
}

// =====================
// 小工具
// =====================
const el = (id) => document.getElementById(id);

function pad2(n){ return String(n).padStart(2, "0"); }

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function parseISODate(s) {
  // YYYY-MM-DD -> Date (local)
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a, b) {
  // whole days between (b - a)
  const ms = 24*60*60*1000;
  const aa = startOfDay(a).getTime();
  const bb = startOfDay(b).getTime();
  return Math.floor((bb - aa) / ms);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// =====================
// localStorage
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

function saveProgressLocal(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p, null, 2));
}

function getStartDateLocal() { return localStorage.getItem(START_DATE_KEY) || ""; }
function setStartDateLocal(s) { localStorage.setItem(START_DATE_KEY, s); }

// =====================
// Progress（雙模式：未登入=localStorage；登入=Supabase DB）
// =====================
let progress = { completed: {} };
let startDateCache = "";

function getStartDate() { return startDateCache || ""; }
function setStartDate(s) { startDateCache = s || ""; }

async function loadAllProgress() {
  if (!supabaseEnabled || !currentUser) {
    progress = loadProgressLocal();
    startDateCache = getStartDateLocal();
    return;
  }

  const pd = await dbLoadProgress(currentUser.id);
  progress = { completed: pd.completed || {} };
  startDateCache = pd.start_date || "";
}

async function saveAllProgress() {
  if (!supabaseEnabled || !currentUser) {
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
let targetDate = new Date(); // 預設今天
// progress 與起始日由 loadAllProgress() 初始化（依登入狀態從 DB 或 localStorage 載入）

async function loadPlan() {
  const res = await fetch(PLAN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load plan: ${res.status}`);
  plan = await res.json();
}

// 依起始日算第幾天（1..365）
function getDayIndexByDate(date) {
  const start = getStartDate();
  if (!start) return null;
  const startDate = parseISODate(start);
  const diff = daysBetween(startDate, date); // 0-based
  return diff + 1;
}

// reading_plan_365.json 結構：plan.plan = [{day:1, readings:[...]}...]
function getReadingsForDay(dayIndex) {
  const arr = plan?.plan;   // ✅ 你的 JSON 是 plan
  if (!Array.isArray(arr)) return null;
  return arr.find(x => Number(x.day) === Number(dayIndex)) || null;
}

// 把同一本書連續章節合併成「Exodus 27-30」這種顯示（但連結會逐章打開）
function groupReadings(readings) {
  const groups = [];
  for (const r of readings) {
    const bookEn = r.book_en || r.bookEn || "";
    const bookZh = r.book_zh || r.bookZh || r.book || "";
    const chap = Number(r.chapter);

    const last = groups[groups.length - 1];
    if (last && last.bookEn === bookEn && chap === last.end + 1) {
      last.end = chap;
    } else {
      groups.push({ bookEn, bookZh, start: chap, end: chap });
    }
  }
  return groups;
}

// =====================
// UI Render
// =====================
function render() {
  // 起始日
  const start = getStartDate();
  el("startDate").value = start;

  el("targetDateText").textContent = toISODate(targetDate);

  if (!start) {
    el("dayIndex").textContent = "-";
    el("rangeHint").textContent = "先設定起始日";
    el("readingList").innerHTML = `<li>請先設定「讀經計畫起始日」</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  const dayIndex = getDayIndexByDate(targetDate);
  el("dayIndex").textContent = String(dayIndex);

  // 超出範圍
  const totalDays = Number(plan?.days || 365);
  if (dayIndex < 1 || dayIndex > totalDays) {
    el("rangeHint").textContent = `超出 ${totalDays} 天範圍`;
    el("readingList").innerHTML =
      `<li>第 ${dayIndex} 天超出 ${totalDays} 天計畫範圍（請調整起始日或切換日期）</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj || !Array.isArray(dayObj.readings)) {
    el("rangeHint").textContent = "找不到資料";
    el("readingList").innerHTML =
      `<li>找不到第 ${dayIndex} 天的資料（請確認 data/reading_plan_365.json 結構包含 plan[].readings）</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  // 合併後顯示提示
  const grouped = groupReadings(dayObj.readings);
  el("rangeHint").textContent = grouped.length ? `${grouped.length} 段` : "-";

  // 打卡狀態
  const dateKey = toISODate(targetDate);
  const checked = !!progress.completed[dateKey];

  el("checkin").textContent = checked ? "今日已完成 ✅" : "完成今日 ✅";
  el("checkin").disabled = checked;
  el("undo").disabled = !checked;

  el("openAll").disabled = false;

  // Render reading list：顯示合併段落，但點擊時逐章開啟 Bible.com（最穩）
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
        <div class="row right">
          ${right}
        </div>
      </li>
    `;
  }).join("");

  // 綁定按鈕事件：逐章開新分頁（避免範圍格式不支援）
  document.querySelectorAll(".open-yv").forEach(btn => {
    btn.addEventListener("click", () => {
      const osis = btn.dataset.osis;
      const startC = Number(btn.dataset.start);
      const endC = Number(btn.dataset.end);

      // ⚠️ 可能被瀏覽器擋彈出視窗：需要允許 localhost popups
      for (let c = startC; c <= endC; c++) {
        window.open(youVersionUrl(osis, c), "_blank", "noopener,noreferrer");
      }
    });
  });

  updateStats();
  updateRawData();
  renderCalendar();
}

function setButtonsDisabled(disabled) {
  el("checkin").disabled = disabled || el("checkin").disabled;
  el("undo").disabled = disabled || el("undo").disabled;
  el("openAll").disabled = disabled;
}

function updateStats() {
  const completedDates = Object.keys(progress.completed).filter(k => progress.completed[k]);
  const completedCount = completedDates.length;

  const totalDays = plan?.days ? Number(plan.days) : 365;
  const rate = totalDays ? (completedCount / totalDays) : 0;

  // streak：從「今天」往回連續完成
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
  el("rawData").value = JSON.stringify(progress, null, 2);
}

// =====================
// Calendar（月曆）
// =====================
let calDate = new Date(); // 顯示中的月份

function renderCalendar() {
  const cal = el("calendar");
  if (!cal) return;

  const year = calDate.getFullYear();
  const month = calDate.getMonth();

// ✅【加在這裡】年月標題
  const title = el("calTitle");
  if (title) title.textContent = `${year} 年 ${month + 1} 月`;

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = `
    <tr>
      <th>日</th><th>一</th><th>二</th><th>三</th>
      <th>四</th><th>五</th><th>六</th>
    </tr>
    <tr>
  `;

  let cell = 0;
  for (let i = 0; i < startWeekday; i++) {
    html += "<td></td>";
    cell++;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = toISODate(date);

    const isToday = toISODate(date) === toISODate(new Date());
    const isDone = !!progress.completed[iso];

    html += `
      <td
        class="${isToday ? "today" : ""} ${isDone ? "done" : ""}"
        data-date="${iso}"
      >
        ${d}
      </td>
    `;

    cell++;
    if (cell % 7 === 0) html += "</tr><tr>";
  }

  html += "</tr>";
  cal.innerHTML = html;

  // 點日期 → 跳到那一天
  cal.querySelectorAll("td[data-date]").forEach(td => {
    td.addEventListener("click", () => {
      targetDate = parseISODate(td.dataset.date);
      // 同步月曆顯示月份（點別月日期時更直覺）
      calDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      render();
    });
  });
}

// =====================
// TTS（朗讀）
// =====================
let ttsUtterance = null;

function speakToday() {
  if (!window.speechSynthesis) {
    alert("此瀏覽器不支援語音朗讀");
    return;
  }

  const dayIndex = getDayIndexByDate(targetDate);
  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj) return;

  const grouped = groupReadings(dayObj.readings);

  // 組朗讀文字（不含經文全文，避免授權問題）
  const lines = grouped.map(g => {
    const range = (g.start === g.end)
      ? `第 ${g.start} 章`
      : `第 ${g.start} 到 ${g.end} 章`;
    return `${g.bookZh} ${range}`;
  });

  const text = `今天是第 ${dayIndex} 天。今日讀經：${lines.join("。")}。`;

  window.speechSynthesis.cancel(); // 停掉前一次
  ttsUtterance = new SpeechSynthesisUtterance(text);
  ttsUtterance.lang = "zh-TW";
  ttsUtterance.rate = 1.0;
  window.speechSynthesis.speak(ttsUtterance);
}

function stopSpeak() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// =====================
// Events
// =====================
el("saveStartDate").addEventListener("click", async () => {
  const v = el("startDate").value;
  if (!v) return;
  setStartDate(v);
  await saveAllProgress();
  render();
});

el("prevDay").addEventListener("click", () => {
  targetDate = addDays(targetDate, -1);
  render();
});

el("nextDay").addEventListener("click", () => {
  targetDate = addDays(targetDate, 1);
  render();
});

el("today").addEventListener("click", () => {
  targetDate = new Date();
  render();
});

el("checkin").addEventListener("click", async () => {
  const key = toISODate(targetDate);
  progress.completed[key] = true;
  await saveAllProgress();
  render();
});

el("undo").addEventListener("click", async () => {
  const key = toISODate(targetDate);
  delete progress.completed[key];
  await saveAllProgress();
  render();
});

// 匯出 / 匯入 / 全部清空
el("export").addEventListener("click", () => {
  el("rawData").value = JSON.stringify(progress, null, 2);
  el("rawData").focus();
  el("rawData").select();
});

el("import").addEventListener("click", async () => {
  const raw = el("rawData").value;
  try {
    const obj = JSON.parse(raw);
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

el("reset").addEventListener("click", async () => {
  if (!confirm("確定要清空全部打卡紀錄嗎？")) return;
  progress = { completed: {} };
  await saveAllProgress();
  render();
});

// 登入 / 註冊 / 登出（Supabase）
if (document.getElementById("btnSignup")) {
  document.getElementById("btnSignup").addEventListener("click", async () => {
    if (!supabaseEnabled) {
      alert("尚未設定 Supabase（請在 app.js 填入 SUPABASE_URL 與 SUPABASE_ANON_KEY）");
      return;
    }
    const email = (document.getElementById("email")?.value || "").trim();
    const password = document.getElementById("password")?.value || "";
    if (!email || !password) return alert("請輸入 Email 與密碼");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(error.message);
    alert("註冊成功！若有開 Email 驗證，請先到信箱驗證後再登入。\n（Supabase Auth 設定完成即可使用）");
  });
}

if (document.getElementById("btnLogin")) {
  document.getElementById("btnLogin").addEventListener("click", async () => {
    if (!supabaseEnabled) {
      alert("尚未設定 Supabase（請在 app.js 填入 SUPABASE_URL 與 SUPABASE_ANON_KEY）");
      return;
    }
    const email = (document.getElementById("email")?.value || "").trim();
    const password = document.getElementById("password")?.value || "";
    if (!email || !password) return alert("請輸入 Email 與密碼");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);

    currentUser = data.user;
    await refreshAuthUI();

    // 登入後才載入讀經計畫 + 進度
    setAppVisible(true);
    if (!plan) await loadPlan();
    await loadAllProgress();
    render();
  });
}

if (document.getElementById("btnLogout")) {
  document.getElementById("btnLogout").addEventListener("click", async () => {
    if (!supabaseEnabled) return;
    await supabase.auth.signOut();
    currentUser = null;
    await refreshAuthUI();

    // Supabase 啟用時：登出後隱藏主內容
    setAppVisible(false);
  });
}

// 一鍵開啟今日全部章節（逐章開 Bible.com）
el("openAll").addEventListener("click", () => {
  const start = getStartDate();
  if (!start) return;

  const dayIndex = getDayIndexByDate(targetDate);
  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj || !Array.isArray(dayObj.readings)) return;

  // ⚠️ 可能被瀏覽器擋彈出視窗：需要允許 localhost popups
  for (const r of dayObj.readings) {
    const bookEn = r.book_en || r.bookEn || "";
    const chap = Number(r.chapter);
    const osis = toOsis(bookEn);
    if (!osis || !chap) continue;
    window.open(youVersionUrl(osis, chap), "_blank", "noopener,noreferrer");
  }
});

el("ttsPlay").addEventListener("click", speakToday);
el("ttsStop").addEventListener("click", stopSpeak);

el("calPrev").addEventListener("click", () => {
  calDate.setMonth(calDate.getMonth() - 1);
  renderCalendar();
});

el("calNext").addEventListener("click", () => {
  calDate.setMonth(calDate.getMonth() + 1);
  renderCalendar();
});

// =====================
// Boot（程式進入點）
// =====================
(async function boot(){
  try {
    setSupabaseHint();

    // 取回既有登入狀態
    if (supabaseEnabled) {
      const { data } = await supabase.auth.getSession();
      currentUser = data?.session?.user || null;
    }
    await refreshAuthUI();

    // ✅ Supabase 啟用：要求先登入
    if (supabaseEnabled) {
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

    // 未設定 Supabase：維持本機模式（不登入也能使用）
    setAppVisible(true);
    await loadPlan();
    await loadAllProgress();
    render();
  } catch (e) {
    console.error(e);
    const list = document.getElementById("readingList");
    if (list) {
      list.innerHTML = `
        <li>
          載入讀經計畫失敗：<br/>
          1) 請確認 reading_plan_365.json 存在（或把 app.js 的 PLAN_URL 改對）<br/>
          2) 請用 http://localhost:8000/index.html 開啟<br/>
          3) JSON 需包含 plan
        </li>
      `;
    }
  }
})();
