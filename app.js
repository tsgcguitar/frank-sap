/* =========================================================
   Bible Reading App – FINAL STABLE VERSION
   ========================================================= */

console.log("app.js loaded");

// =========================================================
// 基本設定
// =========================================================
const PLAN_URL = "data/reading_plan_365.json";

const SUPABASE_URL = "https://wqrcszwtakkxtykfzexm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p89YaCGUKJJ9WnVenxrbGQ_RrkPYu1s";

const USERNAME_EMAIL_DOMAIN = "bible.local";

// =========================================================
// Supabase client（只建立一次，避免重複宣告炸掉）
// =========================================================
window._sb = window._sb || window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
const supabase = window._sb;

// =========================================================
// 小工具
// =========================================================
const el = (id) => document.getElementById(id);

function setAuthMsg(msg = "") {
  const box = el("authMsg");
  if (box) box.textContent = msg;
}

function usernameToEmail(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return null;
  return `${u}@${USERNAME_EMAIL_DOMAIN}`;
}

function pad2(n){ return String(n).padStart(2,"0"); }
function toISODate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseISODate(s){
  const [y,m,d]=s.split("-").map(Number);
  return new Date(y,m-1,d);
}
function addDays(d,n){
  const x=new Date(d); x.setDate(x.getDate()+n); return x;
}

// =========================================================
// Progress（DB）
// =========================================================
let progress = { startDate:"", completed:{} };

function normalizeProgress(p){
  return {
    startDate: p?.startDate || "",
    completed: p?.completed || {}
  };
}

async function loadProgress(){
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) throw new Error("not login");

  const { data } = await supabase
    .from("user_progress")
    .select("progress_data")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data){
    const empty = normalizeProgress({});
    await supabase.from("user_progress")
      .insert({ user_id:user.id, progress_data: empty });
    return empty;
  }
  return normalizeProgress(data.progress_data);
}

async function saveProgress(){
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) throw new Error("not login");

  await supabase.from("user_progress")
    .upsert(
      { user_id:user.id, progress_data: progress },
      { onConflict:"user_id" }
    );
}

// =========================================================
// UI 狀態
// =========================================================
function showLoggedOut(){
  el("authCard").style.display="block";
  el("appWrap").style.display="none";
  el("userBar").style.display="none";
}

async function showLoggedIn(session){
  el("authCard").style.display="none";
  el("appWrap").style.display="block";
  el("userBar").style.display="flex";

  const user = session.user;
  el("userNameText").textContent =
    user.user_metadata?.username || user.email.split("@")[0];

  progress = await loadProgress();
  render();
}

async function refreshAuth(){
  const { data:{session} } = await supabase.auth.getSession();
  if (!session) showLoggedOut();
  else await showLoggedIn(session);
}

// =========================================================
// Render（簡化，只留必要）
// =========================================================
function render(){
  el("targetDateText").textContent = toISODate(new Date());
  el("rawData").value = JSON.stringify(progress,null,2);
}

// =========================================================
// 綁事件（唯一入口）
// =========================================================
function bindEvents(){

  el("btnRegister").addEventListener("click", async ()=>{
    setAuthMsg("");
    const username = el("username").value;
    const password = el("password").value;
    const email = usernameToEmail(username);

    if (!email){ setAuthMsg("Username 格式錯誤"); return; }
    if (!password || password.length<6){
      setAuthMsg("密碼至少 6 碼"); return;
    }

    const { error } = await supabase.auth.signUp({
      email, password,
      options:{ data:{ username } }
    });

    if (error){ setAuthMsg(error.message); return; }
    setAuthMsg("註冊成功，請直接登入");
  });

  el("btnLogin").addEventListener("click", async ()=>{
    setAuthMsg("");
    const username = el("username").value;
    const password = el("password").value;
    const email = usernameToEmail(username);

    const { error } = await supabase.auth.signInWithPassword({
      email, password
    });

    if (error){ setAuthMsg(error.message); return; }
    await refreshAuth();
  });

  el("btnLogout").addEventListener("click", async ()=>{
    await supabase.auth.signOut();
    showLoggedOut();
  });
}

// =========================================================
// Boot
// =========================================================
document.addEventListener("DOMContentLoaded", async ()=>{
  bindEvents();
  supabase.auth.onAuthStateChange(()=>refreshAuth());
  await refreshAuth();
});
