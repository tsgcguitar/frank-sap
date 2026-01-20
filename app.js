// =====================
// 設定
// =====================
const PLAN_URL = "data/reading_plan_365.json";

// =====================
// Supabase（Project Settings -> API）
// =====================
const SUPABASE_URL = "https://wqrcszwtakkxtykfzexm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p89YaCGUKJJ9WnVenxrbGQ_RrkPYu1s";

const USERNAME_EMAIL_DOMAIN = "bible.local";

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
// 小工具
// =====================
const el = (id) => document.getElementById(id);

function setAuthMsg(msg) {
  const box = el("authMsg");
  if (box) box.textContent = msg || "";
}

function usernameToEmail(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return null;
  return `${u}@${USERNAME_EMAIL_DOMAIN}`;
}

function pad2(n){ return String(n).padStart(2, "0"); }
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseISODate(s) {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function daysBetween(a, b) {
  const ms = 24*60*60*1000;
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / ms);
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
// Supabase client
// =====================
console.log("app.js loaded");

const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);
if (!supabase) {
  console.warn("Supabase client not initialized. Check supabase-js CDN load order or keys.");
}

// =====================
// DB Progress（Supabase）
// =====================
function normalizeProgress(p) {
  const obj = p && typeof p === "object" ? p : {};
  if (!obj.completed || typeof obj.completed !== "object") obj.completed = {};
  if (!obj.startDate) obj.startDate = "";
  return obj;
}

async function loadProgressFromDB() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw userErr || new Error("Not logged in");

  const { data, error } = await supabase
    .from("user_progress")
    .select("progress_data")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const empty = normalizeProgress({});
    const { error: insErr } = await supabase
      .from("user_progress")
      .insert({ user_id: user.id, progress_data: empty });
    if (insErr) throw insErr;
    return empty;
  }
  return normalizeProgress(data.progress_data);
}

async function saveProgressToDB(p) {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw userErr || new Error("Not logged in");

  const payload = normalizeProgress(p);
  const { error } = await supabase
    .from("user_progress")
    .upsert({ user_id: user.id, progress_data: payload }, { onConflict: "user_id" });

  if (error) throw error;
}

// =====================
// 主流程資料
// =====================
let plan = null;
let targetDate = new Date();
let progress = normalizeProgress({});
let calDate = new Date();

// =====================
// Plan
// =====================
async function loadPlan() {
  const res = await fetch(PLAN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load plan: ${res.status}`);
  plan = await res.json();
}
function getStartDate() {
  return progress?.startDate || "";
}
async function setStartDate(s) {
  progress.startDate = s;
  await saveProgressToDB(progress);
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
function setButtonsDisabled(disabled) {
  const checkin = el("checkin");
  const undo = el("undo");
  const openAll = el("openAll");
  if (checkin) checkin.disabled = !!disabled || checkin.disabled;
  if (undo) undo.disabled = !!disabled || undo.disabled;
  if (openAll) openAll.disabled = !!disabled;
}

function updateStats() {
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

  if (el("completed")) el("completed").textContent = String(completedCount);
  if (el("rate")) el("rate").textContent = `${Math.round(rate * 1000) / 10}%`;
  if (el("streak")) el("streak").textContent = String(streak);
}

function updateRawData() {
  const raw = el("rawData");
  if (raw) raw.value = JSON.stringify(progress, null, 2);
}

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
  for (let i = 0; i < startWeekday; i++) {
    html += "<td></td>";
    cell++;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = toISODate(date);
    const isToday = iso === toISODate(new Date());
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

function render() {
  // 起始日
  const start = getStartDate();
  const startInput = el("startDate");
  if (startInput) startInput.value = start;

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
    if (el("readingList")) el("readingList").innerHTML =
      `<li>第 ${dayIndex} 天超出 ${totalDays} 天計畫範圍（請調整起始日或切換日期）</li>`;
    setButtonsDisabled(true);
    updateStats();
    updateRawData();
    renderCalendar();
    return;
  }

  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj || !Array.isArray(dayObj.readings)) {
    if (el("rangeHint")) el("rangeHint").textContent = "找不到資料";
    if (el("readingList")) el("readingList").innerHTML =
      `<li>找不到第 ${dayIndex} 天的資料（請確認 data/reading_plan_365.json 結構包含 plan[].readings）</li>`;
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

  const checkin = el("checkin");
  const undo = el("undo");
  const openAll = el("openAll");

  if (checkin) {
    checkin.textContent = checked ? "今日已完成 ✅" : "完成今日 ✅";
    checkin.disabled = checked;
  }
  if (undo) undo.disabled = !checked;
  if (openAll) openAll.disabled = false;

  const list = el("readingList");
  if (list) {
    list.innerHTML = grouped.map(g => {
      const titleZh = (g.start === g.end)
        ? `${g.bookZh} 第 ${g.start} 章`
        : `${g.bookZh} 第 ${g.start}–${g.end} 章`;

      const titleEn = (g.start === g.end)
        ? `${g.bookEn} ${g.start}`
        : `${g.bookEn} ${g.start}-${g.end}`;

      const osis = toOsis(g.bookEn);

      const right = osis
        ? `<button class="btn ghost open-yv"
             type="button"
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

    list.querySelectorAll(".open-yv").forEach(btn => {
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

// =====================
// TTS（朗讀）
// =====================
function speakToday() {
  if (!window.speechSynthesis) {
    alert("此瀏覽器不支援語音朗讀");
    return;
  }
  const dayIndex = getDayIndexByDate(targetDate);
  const dayObj = getReadingsForDay(dayIndex);
  if (!dayObj) return;

  const grouped = groupReadings(dayObj.readings);
  const lines = grouped.map(g => {
    const range = (g.start === g.end) ? `第 ${g.start} 章` : `第 ${g.start} 到 ${g.end} 章`;
    return `${g.bookZh} ${range}`;
  });

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`今天是第 ${dayIndex} 天。今日讀經：${lines.join("。")}。`);
  u.lang = "zh-TW";
  u.rate = 1.0;
  window.speechSynthesis.speak(u);
}
function stopSpeak() {
  window.speechSynthesis?.cancel?.();
}

// =====================
// Auth UI
// =====================
function setLoggedOutUI() {
  if (el("authCard")) el("authCard").style.display = "block";
  if (el("appWrap")) el("appWrap").style.display = "none";
  if (el("userBar")) el("userBar").style.display = "none";
  setAuthMsg("");
}

async function setLoggedInUI(session) {
  if (el("authCard")) el("authCard").style.display = "none";
  if (el("appWrap")) el("appWrap").style.display = "block";
  if (el("userBar")) el("userBar").style.display = "flex";

  const user = session?.user;
  const uname = user?.user_metadata?.username || (user?.email ? user.email.split("@")[0] : "");
  if (el("userNameText")) el("userNameText").textContent = uname;

  try {
    progress = await loadProgressFromDB();
  } catch (e) {
    console.error(e);
    alert("讀取進度失敗：請確認 Supabase 資料表 / RLS 設定是否完成");
    progress = normalizeProgress({});
  }

  render();
}

async function refreshAuthState() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) setLoggedOutUI();
  else await setLoggedInUI(session);
}

// =====================
// 綁事件（等 DOM ready 後）
// =====================
function bindEvents() {
  // 主頁按鈕
  el("saveStartDate")?.addEventListener("click", async (e) => {
    e.preventDefault?.();
    const v = el("startDate")?.value;
    if (!v) return;
    try {
      await setStartDate(v);
      render();
    } catch (err) {
      console.error(err);
      alert("儲存起始日失敗，請確認已登入且資料表/RLS 正確");
    }
  });

  el("prevDay")?.addEventListener("click", () => { targetDate = addDays(targetDate, -1); render(); });
  el("nextDay")?.addEventListener("click", () => { targetDate = addDays(targetDate, 1); render(); });
  el("today")?.addEventListener("click", () => { targetDate = new Date(); render(); });

  el("checkin")?.addEventListener("click", async () => {
    const key = toISODate(targetDate);
    progress.completed[key] = true;
    try { await saveProgressToDB(progress); }
    catch (e) { console.error(e); alert("儲存進度失敗，請確認已登入且 Supabase 設定正確"); }
    render();
  });

  el("undo")?.addEventListener("click", async () => {
    const key = toISODate(targetDate);
    delete progress.completed[key];
    try { await saveProgressToDB(progress); }
    catch (e) { console.error(e); alert("儲存進度失敗，請確認已登入且 Supabase 設定正確"); }
    render();
  });

  el("openAll")?.addEventListener("click", () => {
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

  el("ttsPlay")?.addEventListener("click", speakToday);
  el("ttsStop")?.addEventListener("click", stopSpeak);

  el("calPrev")?.addEventListener("click", () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
  el("calNext")?.addEventListener("click", () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

  // Auth：註冊 / 登入 / 登出
  el("btnRegister")?.addEventListener("click", async (e) => {
    e.preventDefault?.();
    if (!supabase) return;
    setAuthMsg("");
    const username = el("username")?.value;
    const password = el("password")?.value;
    const email = usernameToEmail(username);

    if (!email) { setAuthMsg("Username 請用 3-30 碼英數／._- 例如 frank 或 frank.hsieh"); return; }
    if (!password || password.length < 6) { setAuthMsg("Password 至少 6 碼"); return; }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: String(username).trim() } }
    });

    if (error) { console.error(error); setAuthMsg(error.message); return; }
    setAuthMsg("註冊成功！請直接按「登入」。");
  });

  el("btnLogin")?.addEventListener("click", async (e) => {
    e.preventDefault?.();
    if (!supabase) return;
    setAuthMsg("");
    const username = el("username")?.value;
    const password = el("password")?.value;
    const email = usernameToEmail(username);

    if (!email) { setAuthMsg("Username 格式不正確"); return; }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { console.error(error); setAuthMsg("登入失敗：" + error.message); return; }

    await refreshAuthState();
  });

  el("btnLogout")?.addEventListener("click", async (e) => {
    e.preventDefault?.();
    if (!supabase) return;
    await supabase.auth.signOut();
    setLoggedOutUI();
  });
}

// =====================
// Boot
// =====================
async function boot() {
  try {
    await loadPlan();

    // 初始先隱藏讀經畫面
    setLoggedOutUI();

    // 監聽登入狀態
    supabase?.auth?.onAuthStateChange(() => refreshAuthState());

    await refreshAuthState();
  } catch (e) {
    console.error(e);
    const list = el("readingList");
    if (list) {
      list.innerHTML = `
        <li>
          載入讀經計畫失敗：<br/>
          1) 請確認 data/reading_plan_365.json 存在<br/>
          2) GitHub Pages 部署後路徑正確<br/>
          3) JSON 需包含 plan
        </li>
      `;
    }
  }
}

// 等 DOM ready 再開始（避免你遇到「點了沒反應」的根因）
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  boot();
});
