const KEY="sprite-check-state-v2";
const DATA_KEY="sprite-check-catalog-v2";
const DATA_TIME_KEY="sprite-check-catalog-time-v2";
const SUPABASE_URL="https://qhogmxiyghashlxeuikm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_vldk53vSl9j3t5xLaf2_Xg_V1FWB9xY";
const SUPERADMIN_EMAIL="mylife.reading6666@gmail.com";
const ADMIN_NOTIFICATION_EMAIL=SUPERADMIN_EMAIL;
const SOURCE="https://raw.githubusercontent.com/valincius/fn-sprites/main/src/sprites.json";
const TRUSTED_UPDATES_SOURCE="https://spritechecklist.org/whats-new/";
const TRUSTED_SPRITES_SOURCE="https://spritechecklist.org/sprites/";
const REFRESH_MS=30*60*1000;
const UPCOMING_FALLBACK=[
  {parent:"Birthday",variant:"base",releaseDate:"2026-09-26",status:"upcoming",source:"Sprite Checklist / Epic v42.20"},
  {parent:"Morgana",variant:"base",releaseDate:"",status:"upcoming",source:"Sprite Checklist / files; Epic date unannounced"}
];

let state=JSON.parse(localStorage.getItem(KEY)||"{}");
let lang=localStorage.getItem("sprite-lang")||"ja";
let sprites=Array.isArray(window.SPRITES)?window.SPRITES:[];
let selectedFiles=[], recognitionResults=[];
let sb=null, session=null, profile=null, activeChatUser=null;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nowIso=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(36).slice(2);
const t=(ja,en)=>lang==="ja"?ja:en;

function item(id){return state[id]||(state[id]={owned:false,master:false,level:1,manual:false,updated_at:nowIso()})}
let saveTimer=0;
function save(){localStorage.setItem(KEY,JSON.stringify(state));render();clearTimeout(saveTimer);saveTimer=setTimeout(()=>cloudPushState().catch(()=>{}),500)}
function setText(id,ja,en){const e=$(id);if(e)e.textContent=t(ja,en)}
function timeText(v){try{return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(v))}catch{return String(v)}}

const variantNames={base:"Normal",normal:"Normal",gold:"Gold",candy:"Gummy",gummy:"Gummy",galaxy:"Galaxy",gem:"Gem",holofoil:"Holofoil",cube:"Cube",quack:"Quack",cheatmaster:"Cheat Master",loothacker:"Loot Hacker",bountyhunter:"Bounty Hunter"};
function parseSource(rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error("catalog empty");
  return rows.filter(x=>x&&x.parent&&x.url).map(x=>({id:"fn-"+String(x.spriteId)+"-"+String(x.variant||"base"),name:String(x.parent)+" · "+(variantNames[x.variant]||String(x.variant||"Normal")),season:x.season||"",releaseDate:"",status:"released",imageUrl:x.url,isNew:false,rarity:x.rarity||"",source:"FN Sprite catalog"}));
}
const S4_FAMILIES=["8-Bit","Adventure","Birthday","Blinky","Bush","Crash Bandicoot","Crown","Jackrabbit","Jonesy","Killswitch","Klombo","Morgana","Onigiri","Overshield","Pond","Shadow","Sonic","Storm Scout","Tails","X-Ray"];
const S4_VARIANTS=["base","gold","cheatmaster","loothacker","bountyhunter"];
const S4_ALIASES={"8-Bit":["8-Bit","EightBitBlaster","8Bit"],"Crash Bandicoot":["Crash Bandicoot","CrashBandicoot"],"X-Ray":["X-Ray","XRay"]};
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function makeSeason4Catalog(raw){
  const find=(parent,variant)=>{const aliases=S4_ALIASES[parent]||[parent];return raw.find(x=>x.season==="c7s4"&&aliases.includes(x.parent)&&String(x.variant||"base")===variant)};
  const out=[],mega=raw.find(x=>x.season==="c7s4"&&/mega.?man/i.test(x.parent)&&String(x.variant||"base")==="base");
  out.push({id:mega?.id||"s4-mega-man-base",name:"Mega Man · Normal",season:"c7s4",releaseDate:"",status:mega?.status||"released",imageUrl:mega?.imageUrl||"",isNew:false,rarity:mega?.rarity||""});
  for(const parent of S4_FAMILIES)for(const variant of S4_VARIANTS){const x=find(parent,variant);out.push({id:x?.id||"s4-"+slug(parent)+"-"+variant,name:parent+" · "+(variantNames[variant]||variant),season:"c7s4",releaseDate:"",status:x?.status||"released",imageUrl:x?.imageUrl||"",isNew:false,rarity:x?.rarity||""})}
  return out;
}
function mergeCatalog(raw){return [...makeSeason4Catalog(raw),...raw.filter(x=>x.season==="c7s3")]}
function normalizeCatalog(raw){try{return mergeCatalog(parseSource(raw))}catch{return sprites}}
function makeUpcomingCatalog(){const out=[];for(const x of UPCOMING_FALLBACK){for(const v of ["base","gold","cheatmaster","loothacker","bountyhunter"]){const date=x.releaseDate;out.push({id:"upcoming-"+slug(x.parent)+"-"+v,name:x.parent+" · "+(variantNames[v]||v),season:"c7s4",releaseDate:date,status:"upcoming",imageUrl:"",isNew:true,rarity:x.parent==="Birthday"?"rare":x.parent==="Morgana"?"epic":"",source:x.source})}}return out}
async function fetchTrustedUpcoming(){try{const res=await fetch(TRUSTED_UPDATES_SOURCE+"?t="+Date.now(),{cache:"no-store"});if(!res.ok)throw new Error("HTTP "+res.status);const text=await res.text();const lower=text.toLowerCase();const out=makeUpcomingCatalog();if(lower.includes("birthday")&&!lower.includes("2026-09-26")){}return out}catch{return makeUpcomingCatalog()}}

async function syncSprites(force=false){
  const now=Date.now();
  const cached=localStorage.getItem(DATA_KEY);
  const stamp=Number(localStorage.getItem(DATA_TIME_KEY)||0);

  // Logged-in users read the canonical server catalog. The browser cache is
  // only an offline fallback; it is never the authoritative source.
  if(sb && session){
    try{
      const q=await sb.from("sprites").select("source_key,external_id,parent,variant,name,season,image_url,release_date,status,rarity,is_new,source_url,source_name,metadata").order("season").order("parent").order("variant");
      if(!q.error && Array.isArray(q.data) && q.data.length){
        sprites=q.data.map(x=>({
          id:x.source_key,
          name:x.name,
          season:x.season||"",
          releaseDate:x.release_date||"",
          status:x.status||"unconfirmed",
          imageUrl:x.image_url||"",
          isNew:!!x.is_new,
          rarity:x.rarity||"",
          source:x.source_name||"",
          sourceUrl:x.source_url||"",
          externalId:x.external_id||"",
          parent:x.parent||"",
          variant:x.variant||"base"
        }));
        localStorage.setItem(DATA_KEY,JSON.stringify(sprites));
        localStorage.setItem(DATA_TIME_KEY,String(now));
        localStorage.setItem("sprite-check-last-source-v2",JSON.stringify({checked_at:now,source:"Supabase canonical sprites",count:sprites.length}));
        render();renderNews();renderUserNotifications();
        return {ok:true,count:sprites.length,time:now,source:"Supabase canonical Sprite catalog"};
      }
    }catch(err){console.warn("canonical catalog unavailable",err)}
  }

  if(!force&&cached&&now-stamp<REFRESH_MS){
    try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みオフラインデータ"}}catch{}
  }

  // Offline/first-install fallback. New canonical records are created by
  // the server-side sprite-sync Edge Function, never by ordinary clients.
  try{
    const res=await fetch(SOURCE+"?t="+now,{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const next=normalizeCatalog(await res.json());
    const trusted=await fetchTrustedUpcoming();
    const byId=new Map(next.map(x=>[x.id,x]));
    const names=new Set(next.map(x=>x.name));
    for(const x of trusted)if(!names.has(x.name)&&!byId.has(x.id))byId.set(x.id,x);
    const final=[...byId.values()];
    const oldIds=new Set(sprites.map(x=>x.id));
    final.forEach(x=>x.isNew=!oldIds.has(x.id));
    sprites=final;
    localStorage.setItem(DATA_KEY,JSON.stringify(sprites));
    localStorage.setItem(DATA_TIME_KEY,String(now));
    render();renderNews();
    return{ok:true,count:sprites.length,time:now,source:"公開データ（オフライン準備用）"};
  }catch(e){
    if(cached)try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みオフラインデータ"}}catch{}
    return{ok:false,count:0,time:0,source:"取得失敗"};
  }
}

function setSyncStatus(info){const el=$("#syncStatus");if(!el)return;if(!info){el.textContent=t("Spriteデータを確認中…","Checking Sprite data…");return}el.innerHTML=info.ok?"✅ "+esc(info.source)+"<br><b>"+info.count+"件</b>を読み込み済み<br><small>最終確認: "+timeText(info.time)+"</small>":"⚠️ "+t("Spriteデータを取得できませんでした","Could not fetch Sprite data")}

async function renderUserNotifications(){
  const box=$("#userNotifications");if(!box)return;
  if(!sb||!session){box.innerHTML="<p>"+t("ログインすると通知を受け取れます。","Sign in to receive notifications.")+"</p>";return}
  const r=await sb.from("notifications").select("*").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(50);
  if(r.error){box.textContent=r.error.message;return}
  box.innerHTML=(r.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.title)+'</b><small>'+esc(x.body)+' · '+timeText(x.created_at)+(x.read?"":" · 未読")+'</small><button data-read="'+x.id+'">'+(x.read?"既読":"既読にする")+'</button></div>').join("")||"<p>通知はありません。</p>";
  $$("[data-read]").forEach(b=>b.onclick=async()=>{await sb.from("notifications").update({read:true}).eq("id",b.dataset.read).eq("user_id",session.user.id);renderUserNotifications()});
}
function renderNews(){const box=$("#newsList");if(!box)return;const upcoming=sprites.filter(s=>s.status==="upcoming").slice(0,30);const released=sprites.filter(s=>s.isNew&&s.status==="released").slice(0,20);const source=localStorage.getItem("sprite-check-last-source-v1");let meta="";try{const m=JSON.parse(source||"{}");if(m.checked_at)meta="<small>最終確認: "+timeText(m.checked_at)+"</small>"}catch{}box.innerHTML=(released.length?'<div class="list-item"><b>🆕 新しく確認されたSprite</b><small>'+released.map(x=>esc(x.name)).join("、")+'</small></div>':"")+(upcoming.length?'<div class="list-item"><b>⏳ 登場予定</b><small>'+upcoming.map(x=>esc(x.name)+(x.releaseDate?" · "+esc(x.releaseDate):"")).join("、")+'</small></div>':"")+'<div class="list-item"><b>自動データ更新</b><small>機械可読カタログと信頼済み更新情報を定期確認します。'+meta+'</small></div>'}
function render(){
  const q=($("#search")?.value||"").toLowerCase(),f=$("#filter")?.value||"all",season=$("#seasonFilter")?.value||"all";
  const filtered=sprites.filter(s=>(!q||s.name.toLowerCase().includes(q))&&(season==="all"||s.season===season)&&(f==="all"||(f==="owned"&&item(s.id).owned)||(f==="unowned"&&!item(s.id).owned)||(f==="master"&&item(s.id).master)||(f==="upcoming"&&s.status==="upcoming")||(f==="new"&&s.isNew)));
  const groups={};filtered.forEach(s=>(groups[s.season||"unknown"]??=[]).push(s));
  const labels={c7s4:"Chapter 7 Season 4 · Override",c7s3:"Chapter 7 Season 3 · Runners",unknown:"その他"};
  const html=Object.entries(groups).map(([sn,list])=>'<section class="season-group"><h2>'+esc(labels[sn]||sn)+'</h2><div class="grid">'+list.map(s=>{const x=item(s.id);return '<article class="card"><img class="sprite-img" src="'+esc(s.imageUrl||"")+'" alt="'+esc(s.name)+'" loading="lazy" onerror="this.style.display=\'none\'"><h3>'+esc(s.name)+'</h3><div class="row"><span class="badge">'+esc(s.status)+'</span>'+(s.isNew?'<span class="badge">NEW</span>':'')+'</div><p><label><input type="checkbox" data-id="'+esc(s.id)+'" data-k="owned" '+(x.owned?"checked":"")+'> 所持</label> <label><input type="checkbox" data-id="'+esc(s.id)+'" data-k="master" '+(x.master?"checked":"")+'> Master</label></p><label>Lv <input class="level-input" type="number" min="1" max="5" value="'+Math.min(5,x.level||1)+'" data-id="'+esc(s.id)+'" data-k="level"></label></article>'}).join("")+'</div></section>').join("")||'<div class="empty">'+t("該当するSpriteがありません","No Sprite found")+'</div>';
  $("#grid").innerHTML=html;
  const owned=sprites.filter(s=>item(s.id).owned).length,master=sprites.filter(s=>item(s.id).master).length;
  $("#owned").textContent=owned;$("#master").textContent=master;$("#rate").textContent=sprites.length?Math.round(owned/sprites.length*100)+"%":"0%";
  renderExchangeSprites();
  renderNews();renderUserNotifications();
}

document.addEventListener("change",e=>{const id=e.target.dataset.id,k=e.target.dataset.k;if(id&&k){const x=item(id);x[k]=k==="level"?Math.max(1,Math.min(5,Number(e.target.value)||1)):e.target.checked;x.manual=true;x.updated_at=nowIso();save()}});
function openPage(name){
  const page=name==="sprites"?"spritesPage":name==="recognition"?"recognitionPage":name==="news"?"newsPage":name==="social"?"socialPage":name==="admin"?"adminPage":name==="account"?"accountPage":"settingsPage";
  $(".page-section").forEach(x=>{if(x.id!=="adminPanel")x.classList.remove("active")});
  const target=$("#"+page);if(target)target.classList.add("active");
  $("#sideMenu").classList.remove("open");$("#menuBackdrop").classList.add("hidden");
  if(name==="admin"&&!profile)openPage("account");
}
$("#menuToggle").onclick=()=>{$("#sideMenu").classList.toggle("open");$("#menuBackdrop").classList.toggle("hidden",!$("#sideMenu").classList.contains("open"))};
$("#menuBackdrop").onclick=()=>{$("#sideMenu").classList.remove("open");$("#menuBackdrop").classList.add("hidden")};
$("[data-page]").forEach(b=>b.onclick=()=>openPage(b.dataset.page));
$("#search").addEventListener("input",render);$("#filter").addEventListener("change",render);$("#seasonFilter").addEventListener("change",render);
$("#theme").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("sprite-theme",document.body.classList.contains("dark")?"dark":"light")};
$("#lang").onclick=()=>{lang=lang==="ja"?"en":"ja";localStorage.setItem("sprite-lang",lang);applyLanguage();render();renderAuth();renderSocial()};
function applyLanguage(){
  document.documentElement.lang=lang;
  setText("#appSubtitle","Spriteコレクション管理","Sprite collection tracker");setText("#ownedLabel","所持","Owned");setText("#masterLabel","Master","Master");setText("#rateLabel","達成率","Completion");
  setText("#recognitionTitle","画像チェック・自動認識","Image check & recognition");setText("#cloudTitle","オンライン連携","Online connection");setText("#socialTitle","交流・問い合わせ","Community & support");setText("#exportTitle","チェックリスト出力","Checklist export");
  $("#lang").textContent=lang==="ja"?"EN":"JP";
}
function renderAuth(){
  const logged=!!session;$("#signUp").classList.toggle("hidden",logged);$("#signIn").classList.toggle("hidden",logged);$("#signOut").classList.toggle("hidden",!logged);
  $("#authStatus").textContent=logged?(profile?.role==="superadmin"?t("👑 最上位管理者としてログイン中: ","👑 Signed in as Super Admin: "):profile?.role==="admin"?t("🛡️ 管理者としてログイン中: ","🛡️ Signed in as Admin: "):t("👤 一般ユーザーとしてログイン中: ","👤 Signed in as User: "))+(profile?.display_name||"ユーザー"):sb?t("Supabase接続済み・未ログイン","Supabase connected · not signed in"):t("端末内モードで利用中です","Using local device mode");
  const isAdmin=!!(profile&&(profile.role==="admin"||profile.role==="superadmin"));
  $("#adminPanel").classList.toggle("hidden",!isAdmin);
  $("#menuAdmin").classList.toggle("hidden",!isAdmin);
}

$("#import").onchange=e=>{selectedFiles=[...e.target.files].filter(f=>f.type.startsWith("image/"));const box=$("#preview");box.innerHTML="";selectedFiles.forEach(f=>{const img=document.createElement("img");img.src=URL.createObjectURL(f);box.appendChild(img)});$("#ocrStatus").textContent=selectedFiles.length+t("枚を選択しました。"," image(s) selected.");$("#reviewResults").innerHTML=""};

function checklistPixelDetect(file){
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const w=1536,h=2048,sx=img.width/w,sy=img.height/h,c=document.createElement("canvas");c.width=img.width;c.height=img.height;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0);const xs=[35,125,215,305,395,785,875,965,1055,1145],ys=[457,627,797,967,1137,1307,1477,1647,1817,1987];
      const redAt=(x,y)=>{const X=Math.round(x*sx),Y=Math.round(y*sy),W=Math.round(62*sx),H=Math.round(62*sy),d=ctx.getImageData(X,Y,W,H).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>170&&d[i+1]<120&&d[i+2]<120)n++;return n};
      const yellowAt=(x,y)=>{const X=Math.round((x-8)*sx),Y=Math.round((y-138)*sy),W=Math.round(73*sx),H=Math.round(55*sy),d=ctx.getImageData(X,Y,W,H).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]>125&&d[i+2]<100)n++;return n};
      const cells=[];for(let r=0;r<10;r++)for(let col=0;col<10;col++){const x=xs[col],y=ys[r];cells.push({owned:redAt(x,y)>120,master:yellowAt(x,y)>184})}
      const tr=ctx.getImageData(Math.round(img.width*.40),Math.round(img.height*.06),Math.round(img.width*.20),Math.round(img.height*.13)).data;let topRed=0,topYellow=0;for(let i=0;i<tr.length;i+=4){if(tr[i]>170&&tr[i+1]<120&&tr[i+2]<120)topRed++;if(tr[i]>180&&tr[i+1]>125&&tr[i+2]<100)topYellow++}cells.unshift({owned:topRed>120,master:topYellow>120});resolve({cells,width:img.width,height:img.height})};img.onerror=reject;img.src=URL.createObjectURL(file)})}
function renderChecklistReview(r){const s4=sprites.filter(s=>s.season==="c7s4");const rows=r.cells.map((c,i)=>{const s=s4[i];if(!s)return "";return '<label class="detect-row"><input type="checkbox" class="detected" data-index="'+i+'" '+(c.owned?"checked":"")+'> '+esc(s.name)+' <span class="badge">'+(c.master?"Master":"所持")+'</span></label>'}).join("");$("#reviewResults").innerHTML='<h3>チェックリスト認識結果</h3><p><b>'+r.cells.filter(x=>x.owned).length+' / '+r.cells.length+'</b> 所持　・　<b>'+r.cells.filter(x=>x.master).length+' / '+r.cells.length+'</b> Master</p><p>Chapter 7 Season 4・101件として解析しています。確認後に反映してください。</p><div class="detect-list">'+rows+'</div><button id="applyChecklist">認識結果を反映</button>';$("#applyChecklist").onclick=()=>{let n=0,m=0;$$(".detected:checked").forEach(el=>{const i=Number(el.dataset.index),sp=s4[i],c=r.cells[i];if(!sp||!c)return;const x=item(sp.id);if(!x.manual){x.owned=true;x.master=!!c.master;x.manual=true;x.updated_at=nowIso();n++;if(c.master)m++}});save();$("#ocrStatus").textContent=n+t("件を反映しました（Master "," item(s) applied (Master ")+m+"件）。";alert(n+"件を反映しました。\nMaster "+m+"件")}}
$("#recognize").onclick=async()=>{if(!selectedFiles.length)return alert(t("先に画像を選択してください。","Select an image first."));const b=$("#recognize");b.disabled=true;try{const r=await checklistPixelDetect(selectedFiles[0]);recognitionResults=[r];renderChecklistReview(r);$("#ocrStatus").textContent=t("チェックリストを解析しました。候補を確認してください。","Checklist analyzed. Review the candidates before applying.")}catch(e){console.error(e);alert(t("画像を解析できませんでした。","Could not analyze the image."))}finally{b.disabled=false}};

function notifyNewSprites(){const last=Number(localStorage.getItem("sprite-check-notify-count-v1")||0);if(sprites.length>last&&last>0&&typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification("Sprite Check",{body:t("新しいSpriteデータが追加されました。","New Sprite data is available.")});localStorage.setItem("sprite-check-notify-count-v1",String(sprites.length))}
$("#notifyNew").onclick=async()=>{if(!("Notification"in window))return alert(t("このブラウザは通知に対応していません。","This browser does not support notifications."));const p=await Notification.requestPermission();$("#notificationStatus").textContent=p==="granted"?t("通知を許可しました。","Notifications enabled."):t("通知は許可されませんでした。","Notifications were not enabled.");};
$("#requestNotification").onclick=()=>$("#notifyNew").click();

function setApiStatus(s){const e=$("#apiStatus");if(e)e.textContent=s}
async function connectSupabase(){
  try{
    if(!window.supabase)throw new Error("Supabase client library is not loaded");
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await sb.auth.getSession();if(error)throw error;session=data.session;
    sb.auth.onAuthStateChange(async(_e,s)=>{session=s;await loadProfile();renderAuth();renderNews();renderUserNotifications();if(session)await cloudPullState();await renderAnnouncements();await autoAnnounceNewSprites();});
    await loadProfile();renderNews();renderUserNotifications();renderAnnouncements();setApiStatus(t("✅ Supabaseに接続しました。","✅ Connected to Supabase."));renderAuth();if(session)await cloudPullState();
  }catch(e){sb=null;session=null;setApiStatus("⚠️ "+e.message)}
}
async function loadProfile(){profile=null;if(!sb||!session){renderAuth();return}const {data,error}=await sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle();if(error)throw error;if(data)profile=data;else{const name=$("#displayName").value.trim()||session.user.email.split("@")[0];const ins=await sb.from("profiles").insert({id:session.user.id,display_name:name,role:"user"}).select().single();if(!ins.error)profile=ins.data}renderAdmin();startAdminHeartbeat()}
async function cloudPullState(){
  if(!sb||!session)return;
  const {data,error}=await sb.from("sprite_state").select("*").eq("user_id",session.user.id);if(error){setApiStatus("⚠️ "+error.message);return}
  for(const row of data||[]){const local=item(row.sprite_id);if(!local.updated_at||new Date(row.updated_at)>new Date(local.updated_at))state[row.sprite_id]={owned:!!row.owned,master:!!row.master,level:row.level||1,manual:!!row.manual,updated_at:row.updated_at}}
  localStorage.setItem(KEY,JSON.stringify(state));render();setApiStatus(t("☁️ サーバーから同期しました。","☁️ Synced from server."));
}
async function cloudPushState(){
  if(!sb||!session)return;
  const rows=Object.entries(state).map(([sprite_id,x])=>({user_id:session.user.id,sprite_id,owned:!!x.owned,master:!!x.master,level:Number(x.level)||1,manual:!!x.manual,updated_at:x.updated_at||nowIso()}));
  if(rows.length)await sb.from("sprite_state").upsert(rows,{onConflict:"user_id,sprite_id"});
}
$("#cloudSync").onclick=async()=>{if(!sb||!session)return setApiStatus(t("ログインすると同期できます。","Sign in to sync."));await cloudPullState();await cloudPushState()};
$("#signUp").onclick=async()=>{if(!sb)return alert(t("サーバーへ接続中です。少し待ってから再試行してください。","Connecting to the server. Please try again shortly."));const {error}=await sb.auth.signUp({email:$("#email").value.trim(),password:$("#password").value});if(error)alert(error.message);else alert(t("登録処理を開始しました。メール確認が必要な設定では確認メールを確認してください。","Sign-up started. Check your email if confirmation is enabled."))};
$("#signIn").onclick=async()=>{if(!sb)return alert(t("サーバーへ接続中です。少し待ってから再試行してください。","Connecting to the server. Please try again shortly."));const {error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)alert(error.message)};
$("#signOut").onclick=async()=>{if(sb)await sb.auth.signOut();session=null;profile=null;renderAuth();renderAdmin()};

function renderExchangeSprites(){const e=$("#exchangeSprite");if(!e)return;const current=e.value;e.innerHTML=sprites.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join("");if(current)e.value=current}
function activateTab(name){$$(".tab-content").forEach(x=>x.classList.add("hidden"));$("#"+name+"Tab").classList.remove("hidden")}
$$("[data-tab]").forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));
async function renderExchange(){const box=$("#exchangeList");if(!sb){box.innerHTML='<p>'+t("Supabase接続後に交換機能を利用できます。","Connect Supabase to use exchange features.")+'</p>';return}const {data,error}=await sb.from("exchange_posts").select("*").order("created_at",{ascending:false}).limit(50);if(error){box.textContent=error.message;return}box.innerHTML=(data||[]).map(p=>'<div class="list-item"><b>'+esc(sprites.find(s=>s.id===p.sprite_id)?.name||p.sprite_id)+'</b> · '+esc(p.type)+'<small>'+timeText(p.created_at)+'</small><button data-exchange="'+p.id+'">応募</button></div>').join("")||"<p>募集なし</p>";$$("[data-exchange]").forEach(b=>b.onclick=()=>applyExchange(b.dataset.exchange))}
async function applyExchange(id){if(!sb||!session)return alert(t("ログインしてください。","Sign in first."));const {error}=await sb.from("exchange_requests").insert({post_id:id,requester_id:session.user.id,message:"交換を希望します"});if(error)alert(error.message);else alert(t("交換申請を送信しました。","Exchange request sent."))}
$("#createExchange").onclick=async()=>{if(!sb||!session)return alert(t("ログインしてください。","Sign in first."));const {error}=await sb.from("exchange_posts").insert({owner_id:session.user.id,sprite_id:$("#exchangeSprite").value,type:$("#exchangeType").value,status:"open"});if(error)alert(error.message);else renderExchange()};
async function renderSocial(){renderExchange();await renderInquiries();await renderChat()}
async function renderInquiries(){const box=$("#inquiryList");if(!sb||!session){box.innerHTML="<p>"+t("ログイン後に利用できます。","Sign in to use support.")+"</p>";return}const {data,error}=await sb.from("inquiries").select("*").eq("user_id",session.user.id).order("created_at",{ascending:false});if(error){box.textContent=error.message;return}box.innerHTML=(data||[]).map(x=>'<div class="list-item"><b>'+esc(x.subject)+'</b><small>'+esc(x.status||"open")+' · '+timeText(x.created_at)+'</small></div>').join("")||"<p>問い合わせはありません。</p>"}
$("#createInquiry").onclick=async()=>{if(!sb||!session)return alert(t("ログインしてください。","Sign in first."));const subject=$("#inquirySubject").value.trim();if(!subject)return;const {error}=await sb.from("inquiries").insert({user_id:session.user.id,subject,status:"open"});if(error)alert(error.message);else{$("#inquirySubject").value="";renderInquiries()}}
async function renderChat(){const box=$("#chatBox");if(!sb||!session){box.innerHTML="<p>"+t("ログイン後に利用できます。","Sign in to use chat.")+"</p>";return}if(!activeChatUser){box.innerHTML="<p>"+t("相手のユーザーIDを入力してください。","Enter a user ID to open a chat.")+"</p>";return}const ids=[session.user.id,activeChatUser].sort();const {data,error}=await sb.from("direct_messages").select("*").in("sender_id",ids).in("recipient_id",ids).order("created_at");if(error){box.textContent=error.message;return}box.innerHTML=(data||[]).map(m=>'<div class="message '+(m.sender_id===session.user.id?"mine":"")+'">'+esc(m.body)+'<small>'+timeText(m.created_at)+'</small></div>').join("")}
$("#openChat").onclick=()=>{activeChatUser=$("#chatUser").value.trim();renderChat()};
$("#sendChat").onclick=async()=>{if(!sb||!session||!activeChatUser)return;const body=$("#chatMessage").value.trim();if(!body)return;const {error}=await sb.from("direct_messages").insert({sender_id:session.user.id,recipient_id:activeChatUser,body});if(error)alert(error.message);else{$("#chatMessage").value="";renderChat()}};

async function renderAnnouncements(){
  const box=$("#announcementList");if(!box)return;
  if(!sb||!session){box.innerHTML="<p>"+t("ログインするとお知らせを表示できます。","Sign in to view announcements.")+"</p>";return}
  const r=await sb.from("announcements").select("*").order("created_at",{ascending:false}).limit(50);
  if(r.error){box.textContent=r.error.message;return}
  box.innerHTML=(r.data||[]).map(x=>'<article class="list-item"><b>'+esc(x.title)+'</b><small>'+esc(x.body)+'</small>'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="" style="max-width:100%;border-radius:10px;margin-top:8px">':"")+(x.source_url?'<small>出典: <a href="'+esc(x.source_url)+'" target="_blank" rel="noopener">'+esc(x.source_name||"参照元")+'</a></small>':"")+'<small>'+timeText(x.created_at)+(x.kind==="sprite_auto"?" · 自動検知":"")+'</small></article>').join("")||"<p>お知らせはありません。</p>";
}
async function renderAdminAnnouncements(){
  const box=$("#adminAnnouncementList");if(!box||!sb||!profile)return;
  const r=await sb.from("announcements").select("*").order("created_at",{ascending:false}).limit(50);
  box.innerHTML=(r.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.title)+'</b><small>'+esc(x.body)+'</small><button data-ann-delete="'+x.id+'" class="danger">削除</button></div>').join("")||"<p>投稿なし</p>";
  $$("[data-ann-delete]").forEach(b=>b.onclick=async()=>{if(confirm(t("このお知らせを削除しますか？","Delete this announcement?"))){await sb.from("announcements").delete().eq("id",b.dataset.annDelete);renderAnnouncements();renderAdminAnnouncements();}});
}
async function postAnnouncement(){
  if(!sb||!session||!profile||!["admin","superadmin"].includes(profile.role))return;
  const title=$("#adminAnnouncementTitle").value.trim(),body=$("#adminAnnouncementBody").value.trim(),image=$("#adminAnnouncementImage").value.trim(),source=$("#adminAnnouncementSource").value.trim();
  if(!title||!body)return alert(t("タイトルと本文を入力してください。","Enter a title and body."));
  const {error}=await sb.from("announcements").insert({author_id:session.user.id,title,body,image_url:image,source_url:source,source_name:source?"参照元":"",kind:"admin"});
  if(error)return alert(error.message);
  ["adminAnnouncementTitle","adminAnnouncementBody","adminAnnouncementImage","adminAnnouncementSource"].forEach(id=>{const e=$("#"+id);if(e)e.value=""});
  await renderAnnouncements();await renderAdminAnnouncements();
}
async function autoAnnounceNewSprites(){
  if(!sb||!session||!profile||!["admin","superadmin"].includes(profile.role))return;
  const candidates=sprites.filter(x=>x.status==="released"&&x.isNew);
  if(!candidates.length)return;
  for(const x of candidates){
    const sourceKey=x.id+"|"+(x.releaseDate||"");
    const seen=await sb.from("sprite_source_seen").select("source_key").eq("source_key",sourceKey).maybeSingle();
    if(seen.data)continue;
    const {error}=await sb.from("announcements").insert({
      author_id:session.user.id,
      title:"🆕 新しい精霊が登場しました！",
      body:x.name+" がFortniteに登場しました。Sprite Checkにも追加しました。",
      image_url:x.imageUrl||"",
      source_url:"https://spritechecklist.org/whats-new/",
      source_name:"Sprite Checklist",
      kind:"sprite_auto",
      sprite_id:x.id
    });
    if(!error)await sb.from("sprite_source_seen").insert({source_key:sourceKey,sprite_id:x.id,source_url:"https://spritechecklist.org/whats-new/",source_name:"Sprite Checklist"});
  }
  await renderAnnouncements();
}
async function renderAdmin(){
  const ok=profile&&(profile.role==="admin"||profile.role==="superadmin");$("#adminPanel").classList.toggle("hidden",!ok);if(!ok||!sb)return;
  const heading=$("#adminPanel h2");if(heading)heading.textContent=profile.role==="superadmin"?"👑 最上位管理者":"🛡️ 一般管理者";
  const superOnly=["#adminUsersPanel","#adminAuditPanel","#adminAnnouncementsPanel","#adminExchangePanel"];
  superOnly.forEach(sel=>$(sel)?.classList.toggle("hidden",profile.role!=="superadmin"));
  const u=await sb.from("profiles").select("id,display_name,role,created_at").order("created_at",{ascending:false});
  $("#userList").innerHTML=(u.data||[]).map(x=>{
    const roleButtons=profile.role==="superadmin"&&x.id!==session.user.id?'<button data-role-user="'+x.id+'" data-role="admin">管理者</button><button class="secondary" data-role-user="'+x.id+'" data-role="user">一般</button>':"";
    return '<div class="list-item"><b>'+esc(x.display_name||x.id)+'</b><small>'+esc(x.role)+' · '+esc(x.id)+'</small><div class="row"><button data-user="'+x.id+'">Sprite編集</button>'+roleButtons+'</div></div>'
  }).join("")||"<p>ユーザーなし</p>";
  $$("[data-user]").forEach(b=>b.onclick=()=>openAdminUser(b.dataset.user));
  $$("[data-role-user]").forEach(b=>b.onclick=()=>changeUserRole(b.dataset.roleUser,b.dataset.role));
  const a=await sb.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(100);
  $("#auditList").innerHTML=(a.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.action)+'</b><small>'+esc(x.actor_id||"")+" → "+esc(x.target_user_id||"")+" · "+timeText(x.created_at)+'</small></div>').join("")||"<p>ログなし</p>";
  await renderAdminExchanges();
  await renderAdminInquiries();
  await renderAdminAnnouncements();
}
async function changeUserRole(userId,role){
  if(!sb||!session||profile?.role!=="superadmin")return;
  if(userId===session.user.id)return alert(t("自分自身の権限はここから変更できません。","You cannot change your own role here."));
  const {error}=await sb.from("profiles").update({role}).eq("id",userId);
  if(error)alert(error.message);else{await sb.from("audit_logs").insert({actor_id:session.user.id,target_user_id:userId,action:"role_change",details:{role}});await renderAdmin();}
}
async function renderAdminExchanges(){
  const box=$("#adminExchangeList");if(!box||!sb)return;
  const r=await sb.from("exchange_posts").select("*").order("created_at",{ascending:false}).limit(100);
  box.innerHTML=(r.data||[]).map(x=>'<div class="list-item"><b>'+esc(sprites.find(s=>s.id===x.sprite_id)?.name||x.sprite_id)+'</b><small>'+esc(x.type)+' · '+esc(x.status)+' · '+esc(x.owner_id)+'</small><div class="row"><button data-exclose="'+x.id+'">閉じる</button><button data-exdelete="'+x.id+'" class="danger">削除</button></div></div>').join("")||"<p>交換募集なし</p>";
  $$("[data-exclose]").forEach(b=>b.onclick=()=>moderateExchange(b.dataset.exclose,"closed"));
  $$("[data-exdelete]").forEach(b=>b.onclick=()=>deleteExchange(b.dataset.exdelete));
}
async function moderateExchange(id,status){if(!sb||!profile)return;const {error}=await sb.from("exchange_posts").update({status}).eq("id",id);if(error)alert(error.message);else{await sb.from("audit_logs").insert({actor_id:session.user.id,action:"exchange_moderation",details:{post_id:id,status}});renderAdminExchanges();}}
async function deleteExchange(id){if(!sb||!profile)return;if(!confirm(t("この交換募集を削除しますか？","Delete this exchange post?")))return;const {error}=await sb.from("exchange_posts").delete().eq("id",id);if(error)alert(error.message);else{await sb.from("audit_logs").insert({actor_id:session.user.id,action:"exchange_delete",details:{post_id:id}});renderAdminExchanges();}}
async function renderAdminInquiries(){
  const box=$("#adminInquiryList");if(!box||!sb||!profile)return;
  const isSuper=profile.role==="superadmin";
  const query=isSuper
    ? sb.from("inquiries").select("*").order("created_at",{ascending:false}).limit(100)
    : sb.from("inquiries").select("*").eq("inquiry_type","sprite_manual_fix").or("assigned_admin_id.eq."+session.user.id+",support_state.eq.general_queue").order("created_at",{ascending:false}).limit(100);
  const r=await query;
  if(r.error){box.textContent=r.error.message;return}
  const rows=r.data||[];
  const label=x=>({superadmin_queue:"👑 最上位管理者待機",superadmin_handling:"👑 最上位管理者が対応中",general_queue:"🛡️ 一般管理者待機",general_handling:"🛡️ 一般管理者が対応中",answered:"✅ 回答済み",closed:"🔒 閉じた"}[x]||x||"待機中");
  box.innerHTML=rows.map(x=>{
    const active=!["answered","closed"].includes(x.status);
    const assignedMe=x.assigned_admin_id===session.user.id;
    const claimable=active&&((isSuper&&(x.support_state!=="superadmin_handling"||assignedMe))||(!isSuper&&(x.support_state==="general_queue"||assignedMe)));
    const passable=isSuper&&active&&x.inquiry_type==="sprite_manual_fix"&&x.support_state!=="general_queue"&&x.support_state!=="general_handling";
    const controls=[];
    if(claimable)controls.push('<button data-iqclaim="'+x.id+'">対応する</button>');
    if(passable)controls.push('<button class="secondary" data-iqpass="'+x.id+'">一般管理者へパス</button>');
    if(active&&(isSuper||assignedMe)){
      controls.push('<input data-iqmsg="'+x.id+'" placeholder="回答メッセージ">');
      controls.push('<button data-iqsend="'+x.id+'">送信</button>');
      controls.push('<button class="secondary" data-iqstatus="'+x.id+'" data-status="closed">閉じる</button>');
    }
    if(!isSuper&&x.inquiry_type==="sprite_manual_fix"&&assignedMe){
      controls.push('<button data-spritefix="'+x.id+'">精霊を手動修正</button>');
    }
    return '<div class="list-item"><b>'+esc(x.subject)+'</b><small>'+esc(x.inquiry_type==="sprite_manual_fix"?"🧚 精霊の手動修正":"その他")+' · '+esc(label(x.support_state))+' · '+esc(x.status||"open")+' · '+timeText(x.created_at)+'</small><div class="row">'+controls.join("")+'</div></div>';
  }).join("")||"<p>対応可能な問い合わせはありません。</p>";

  $$("[data-iqclaim]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;const r=await sb.rpc("claim_inquiry",{p_inquiry_id:b.dataset.iqclaim});
    if(r.error)alert(r.error.message);else await renderAdminInquiries();
  });
  $$("[data-iqpass]").forEach(b=>b.onclick=async()=>{
    if(!confirm(t("精霊の手動修正問い合わせを一般管理者へパスしますか？","Pass this Sprite manual-correction inquiry to a general administrator?")))return;
    b.disabled=true;const r=await sb.rpc("pass_inquiry_to_admin",{p_inquiry_id:b.dataset.iqpass});
    if(r.error)alert(r.error.message);else{alert(r.data?.assigned_admin_id?t("オンラインの一般管理者へ割り当てました。","Assigned to an online general administrator."):t("一般管理者待機列へ移しました。","Moved to the general-admin queue."));await renderAdminInquiries();}
  });
  $$("[data-iqstatus]").forEach(b=>b.onclick=async()=>{const r=await sb.rpc("set_inquiry_status",{p_inquiry_id:b.dataset.iqstatus,p_status:b.dataset.status});if(r.error)alert(r.error.message);else await renderAdminInquiries()});
  $$("[data-iqsend]").forEach(b=>b.onclick=()=>replyInquiryRouted(b.dataset.iqsend));
  $$("[data-spritefix]").forEach(b=>b.onclick=()=>openSpriteManualFix(b.dataset.spritefix));
}
async function openSpriteManualFix(inquiryId){
  if(!sb||!session||profile?.role!=="admin")return;
  const q=await sb.from("inquiries").select("user_id,subject").eq("id",inquiryId).single();
  if(q.error||!q.data)return alert(q.error?.message||"問い合わせが見つかりません。");
  const spriteId=prompt(t("修正する精霊のIDを入力してください。","Enter the Sprite ID to correct."));
  if(!spriteId)return;
  const owned=confirm(t("この精霊を所持済みにしますか？\nOK=所持 / キャンセル=未所持","Mark this Sprite as owned?"));
  const master=confirm(t("この精霊をマスターにしますか？\nOK=マスター / キャンセル=通常","Mark this Sprite as Master?"));
  const levelText=prompt(t("レベルを1〜5で入力してください。","Enter level 1-5."),"1");
  const level=Number(levelText);if(!Number.isInteger(level)||level<1||level>5)return alert(t("レベルは1〜5です。","Level must be 1-5."));
  const r=await sb.rpc("admin_correct_sprite_state",{p_inquiry_id:inquiryId,p_user_id:q.data.user_id,p_sprite_id:spriteId,p_owned:owned,p_master:master,p_level:level});
  if(r.error)return alert(r.error.message);
  alert(t("精霊の手動修正を適用しました。","Sprite manual correction applied."));
  await renderAdminInquiries();
}
async function replyInquiryRouted(id){
  const input=$('[data-iqmsg="'+id+'"]'),body=input?.value.trim();if(!body||!sb||!session)return;
  const q=await sb.from("inquiries").select("user_id,subject,status,support_state,assigned_admin_id").eq("id",id).single();
  if(q.error||!q.data)return alert(q.error?.message||"問い合わせが見つかりません。");
  if(profile.role==="admin"&&q.data.assigned_admin_id!==session.user.id)return alert(t("この問い合わせはあなたに割り当てられていません。","This inquiry is not assigned to you."));
  if(profile.role==="superadmin"&&q.data.assigned_admin_id!==session.user.id){
    const claim=await sb.rpc("claim_inquiry",{p_inquiry_id:id});if(claim.error)return alert(claim.error.message);
  }
  const {error}=await sb.from("inquiry_messages").insert({inquiry_id:id,sender_id:session.user.id,body,source_language:lang});
  if(error){alert(error.message);return}
  await sb.rpc("set_inquiry_status",{p_inquiry_id:id,p_status:"answered"});
  const n=q.data.user_id?await sb.from("notifications").insert({user_id:q.data.user_id,title:"問い合わせへの回答",body}):null;
  if(n?.error)console.warn(n.error);
  await sb.from("audit_logs").insert({actor_id:session.user.id,target_user_id:q.data.user_id,action:"inquiry_reply",details:{inquiry_id:id}});
  input.value="";
  await renderAdminInquiries();
  await renderInquiriesFinal();
}
$("#adminPostAnnouncement").onclick=postAnnouncement;
$("#adminBroadcast").onclick=async()=>{
  if(!sb||!profile)return;
  const title=$("#adminNoticeTitle").value.trim(),body=$("#adminNoticeBody").value.trim(),image=$("#adminNoticeImage")?.value.trim()||"";if(!title||!body)return;
  const users=await sb.from("profiles").select("id");if(users.error)return alert(users.error.message);
  const rows=(users.data||[]).map(u=>({user_id:u.id,title,body}));
  if(rows.length){const r=await sb.from("notifications").insert(rows);if(r.error)return alert(r.error.message);}
  await sb.from("audit_logs").insert({actor_id:session.user.id,action:"broadcast_notification",details:{title,count:rows.length}});
  $("#adminNoticeTitle").value="";$("#adminNoticeBody").value="";alert(t("全ユーザーへ通知しました。","Broadcast sent to all users."));
};
async function openAdminUser(userId){
  $("#adminEditor").classList.remove("hidden");$("#adminUserId").value=userId;
  $("#adminEditorTitle").textContent=(profile?.role==="superadmin"?"👑 最上位管理者":"🛡️ 管理者")+"：ユーザーのSprite編集 · "+userId;
  const {data,error}=await sb.from("sprite_state").select("*").eq("user_id",userId);if(error)return alert(error.message);
  const map=Object.fromEntries((data||[]).map(x=>[x.sprite_id,x]));
  const q=$("#adminSearch").value.toLowerCase();
  $("#adminSpriteList").innerHTML=sprites.filter(s=>!q||s.name.toLowerCase().includes(q)).map(s=>{
    const x=map[s.id]||{};
    return '<div class="detect-row"><label><input type="checkbox" data-admin-id="'+esc(s.id)+'" data-user-id="'+esc(userId)+'" data-admin-k="owned" '+(x.owned?"checked":"")+'> 所持</label><label><input type="checkbox" data-admin-id="'+esc(s.id)+'" data-user-id="'+esc(userId)+'" data-admin-k="master" '+(x.master?"checked":"")+'> Master</label><span>'+esc(s.name)+'</span><label>Lv <input class="level-input" type="number" min="1" max="5" value="'+(x.level||1)+'" data-admin-id="'+esc(s.id)+'" data-user-id="'+esc(userId)+'" data-admin-k="level"></label></div>'
  }).join("");
}
$("#adminSearch").addEventListener("input",()=>openAdminUser($("#adminUserId").value));
document.addEventListener("change",async e=>{const id=e.target.dataset.adminId,k=e.target.dataset.adminK,u=e.target.dataset.userId;if(!id||!k||!u||!sb||!profile)return;const current=await sb.from("sprite_state").select("*").eq("user_id",u).eq("sprite_id",id).maybeSingle();const x=current.data||{user_id:u,sprite_id:id,owned:false,master:false,level:1,manual:false};if(k==="owned")x.owned=e.target.checked;else if(k==="master")x.master=e.target.checked;else x.level=Math.max(1,Math.min(5,Number(e.target.value)||1));x.manual=true;x.updated_at=nowIso();const r=await sb.from("sprite_state").upsert(x,{onConflict:"user_id,sprite_id"});if(r.error)alert(r.error.message);else await sb.from("audit_logs").insert({actor_id:session.user.id,target_user_id:u,action:"sprite_edit",details:{sprite_id:id,field:k,value:k==="owned"?e.target.checked:x.level}})});

$("#export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({version:2,exported_at:nowIso(),state},null,2)],{type:"application/json"}));a.download="sprite-check-backup.json";a.click()};
$("#restore").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);state=x.state||x;save();alert(t("復元しました","Restored"))}catch{alert(t("バックアップ形式が正しくありません","Invalid backup format"))}};r.readAsText(f)};
$("#reset").onclick=()=>{if(confirm(t("この端末のSprite Checkデータをリセットしますか？","Reset local Sprite Check data?"))){state={};save()}};

$("#exportChecklist").onclick=()=>{const w=1200,h=800,c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");ctx.fillStyle="#111827";ctx.fillRect(0,0,w,h);ctx.fillStyle="#fff";ctx.font="bold 34px system-ui";ctx.fillText("SPRITE CHECK",40,55);ctx.font="20px system-ui";ctx.fillText("Owned "+sprites.filter(s=>item(s.id).owned).length+" / "+sprites.length+"   Master "+sprites.filter(s=>item(s.id).master).length,40,90);const cols=5,cellW=220,cellH=135;sprites.slice(0,25).forEach((s,i)=>{const x=20+(i%cols)*cellW,y=120+Math.floor(i/cols)*cellH;ctx.fillStyle=item(s.id).owned?"#22c55e":"#334155";ctx.fillRect(x,y,200,110);ctx.fillStyle="#fff";ctx.font="15px system-ui";ctx.fillText((item(s.id).owned?"✓ ":"□ ")+s.name.slice(0,25),x+10,y+30);ctx.fillText("Lv "+(item(s.id).level||1)+(item(s.id).master?"  ★ Master":""),x+10,y+58)});const a=document.createElement("a");a.href=c.toDataURL("image/png");a.download="sprite-checklist.png";a.click()};
$("#sync").onclick=async()=>{const b=$("#sync");b.disabled=true;b.textContent=t("更新中…","Updating…");setSyncStatus(null);const info=await syncSprites(true);setSyncStatus(info);b.disabled=false;b.textContent=t("Spriteデータ更新","Update Sprite data")};
if(localStorage.getItem("sprite-theme")==="dark")document.body.classList.add("dark");

applyLanguage();renderAuth();render();renderExchangeSprites();renderNews();setSyncStatus(null);setApiStatus("☁️ サーバーへ自動接続しています…");
syncSprites(true).then(setSyncStatus);
connectSupabase().catch(e=>setApiStatus("⚠️ "+e.message));
openPage("sprites");
setInterval(()=>syncSprites(true).then(setSyncStatus),REFRESH_MS);
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});


/* ============================================================
   FINAL SPEC INTEGRATION
   ============================================================ */
const FINAL_SITE_URL="https://mylifereading6666-oss.github.io/Sprite-Check-Web/";
let autoTranslate=localStorage.getItem("sprite-auto-translate")==="1";
let serverOnline=false;

function updateFinalRoleUi(){
  const isSuper=profile?.role==="superadmin";
  const isAdmin=profile?.role==="admin"||isSuper;
  $("#superadminSpriteSync")?.classList.toggle("hidden",!isSuper);
  $("#superadminTools")?.classList.toggle("hidden",!isSuper);
  $("#menuAdmin")?.classList.toggle("hidden",!isAdmin);
  $("#adminPanel")?.classList.toggle("hidden",!isAdmin);
  if($("#adminRegistrationCode")) $("#adminRegistrationCode").disabled=!session;
  if($("#autoTranslate")) $("#autoTranslate").checked=autoTranslate;
}
function updateFinalStats(){
  if($("#totalSprites"))$("#totalSprites").textContent=sprites.filter(s=>s.status==="released").length;
  if($("#totalLabel"))$("#totalLabel").textContent=t("登場済みSprite","Released Sprites");
}
const originalRender=render;
render=function(){
  originalRender();
  updateFinalStats();
  updateFinalRoleUi();
};

const originalRenderAuth=renderAuth;
renderAuth=function(){
  originalRenderAuth();
  updateFinalRoleUi();
};

async function loadCanonicalAfterAuth(){
  if(!sb||!session)return;
  const info=await syncSprites(true);
  setSyncStatus(info);
  updateFinalRoleUi();
  await renderSocial();
  await renderAnnouncements();
  if(profile?.role==="admin"||profile?.role==="superadmin")await renderAdmin();
}

async function invokeSuperadminSpriteSync(){
  if(!sb||!session||profile?.role!=="superadmin"){
    return alert(t("この操作は最上位管理者だけが実行できます。","Only the Super Admin can run this action."));
  }
  const b=$("#superadminSpriteSync");
  if(b){b.disabled=true;b.textContent=t("👑 更新中…","👑 Updating…")}
  try{
    const {data,error}=await sb.functions.invoke("sprite-sync",{body:{type:"manual"}});
    if(error)throw error;
    alert(t(
      "更新完了：新規 "+(data?.new_count??0)+"件 / 更新 "+(data?.updated_count??0)+"件",
      "Update complete: "+(data?.new_count??0)+" new / "+(data?.updated_count??0)+" updated"
    ));
    await syncSprites(true);
    await renderAnnouncements();
  }catch(err){
    alert(t("Sprite更新に失敗しました。","Sprite update failed.")+"\\n"+(err.message||err));
  }finally{
    if(b){b.disabled=false;b.textContent=t("👑 Spriteを今すぐ更新","👑 Update Sprites now")}
    updateFinalRoleUi();
  }
}
$("#superadminSpriteSync")?.addEventListener("click",invokeSuperadminSpriteSync);

async function uploadAnnouncementImage(file){
  if(!file||!sb||!session)return "";
  if(!file.type.startsWith("image/"))throw new Error(t("画像ファイルを選択してください。","Select an image file."));
  if(file.size>5*1024*1024)throw new Error(t("画像は5MB以下にしてください。","Images must be 5MB or smaller."));
  const path=session.user.id+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const up=await sb.storage.from("announcements").upload(path,file,{contentType:file.type,upsert:false});
  if(up.error)throw up.error;
  const pub=sb.storage.from("announcements").getPublicUrl(path);
  return pub.data.publicUrl;
}

const originalPostAnnouncement=postAnnouncement;
postAnnouncement=async function(){
  if(!sb||!session||!profile||!["admin","superadmin"].includes(profile.role))return;
  const title=$("#adminAnnouncementTitle")?.value.trim();
  const titleEn=$("#adminAnnouncementTitleEn")?.value.trim()||"";
  const body=$("#adminAnnouncementBody")?.value.trim();
  const bodyEn=$("#adminAnnouncementBodyEn")?.value.trim()||"";
  const source=$("#adminAnnouncementSource")?.value.trim()||"";
  const file=$("#adminAnnouncementFile")?.files?.[0];
  if(!title||!body)return alert(t("タイトルと本文を入力してください。","Enter a title and body."));
  try{
    let image=$("#adminAnnouncementImage")?.value.trim()||"";
    if(file)image=await uploadAnnouncementImage(file);
    const {error}=await sb.from("announcements").insert({
      author_id:session.user.id,title,title_en:titleEn,body,body_en:bodyEn,
      image_url:image,source_url:source,source_name:source?"Source":"",
      kind:"admin"
    });
    if(error)throw error;
    ["adminAnnouncementTitle","adminAnnouncementTitleEn","adminAnnouncementBody","adminAnnouncementBodyEn","adminAnnouncementImage","adminAnnouncementSource"].forEach(id=>{if($("#"+id))$("#"+id).value=""});
    if($("#adminAnnouncementFile"))$("#adminAnnouncementFile").value="";
    await renderAnnouncements();await renderAdminAnnouncements();
  }catch(err){alert(err.message||String(err))}
};

$("#registerAdmin")?.addEventListener("click",async()=>{
  if(!sb||!session)return alert(t("ログインしてください。","Sign in first."));
  const code=$("#adminRegistrationCode")?.value.trim();
  if(!code)return;
  const {data,error}=await sb.rpc("register_as_admin",{p_code:code});
  if(error)return alert(error.message);
  if(data){
    $("#adminRegistrationCode").value="";
    await loadProfile();
    renderAuth();
    alert(t("管理者登録が完了しました。","Admin registration completed."));
  }else alert(t("コードが無効、または期限切れです。","The code is invalid or expired."));
});

$("#generateAdminCode")?.addEventListener("click",async()=>{
  if(profile?.role!=="superadmin")return;
  const {data,error}=await sb.functions.invoke("admin-code",{body:{action:"generate-and-send"}});
  if(error)return alert(error.message);
  alert(t("今週の管理者登録コードを生成しました。最上位管理者向けメール送信処理を実行しました。","This week's admin registration code was generated and the delivery process was started."));
});

$("#adminRoleHistory")?.addEventListener("click",async()=>{
  if(profile?.role!=="superadmin")return;
  const r=await sb.from("admin_role_changes").select("*").order("created_at",{ascending:false}).limit(100);
  $("#adminRoleHistoryList").innerHTML=(r.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.old_role)+' → '+esc(x.new_role)+'</b><small>'+esc(x.target_user_id||"")+' · '+timeText(x.created_at)+' · '+esc(x.reason||"")+'</small></div>').join("")||"<p>履歴なし</p>";
});

$("#resetPassword")?.addEventListener("click",async()=>{
  if(!sb)return;
  const email=$("#email")?.value.trim();
  if(!email)return alert(t("メールアドレスを入力してください。","Enter your email address."));
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:FINAL_SITE_URL});
  if(error)alert(error.message);
  else alert(t("パスワード再設定メールを送信しました。","Password reset email requested."));
});

$("#langJa")?.addEventListener("click",()=>setLanguageFinal("ja"));
$("#langEn")?.addEventListener("click",()=>setLanguageFinal("en"));
$("#autoTranslate")?.addEventListener("change",e=>{
  autoTranslate=!!e.target.checked;
  localStorage.setItem("sprite-auto-translate",autoTranslate?"1":"0");
});

function setLanguageFinal(next){
  lang=next==="en"?"en":"ja";
  localStorage.setItem("sprite-lang",lang);
  applyLanguage();
  render();renderAuth();renderSocial();renderNews();
}

async function translateMessage(messageId,text,kind="direct"){
  if(!sb||!session||!text)return null;
  const target=lang==="ja"?"ja":"en";
  const cached=await sb.from("message_translations").select("translated_body")
    .eq("message_id",messageId).eq("message_kind",kind).eq("target_language",target).maybeSingle();
  if(cached.data?.translated_body)return cached.data.translated_body;
  const {data,error}=await sb.functions.invoke("translate-message",{
    body:{message_id:messageId,message_kind:kind,text,target_language:target}
  });
  if(error)return null;
  return data?.translated_body||null;
}

async function renderChatFinal(){
  const box=$("#chatBox");if(!box||!sb||!session||!activeChatUser)return;
  const ids=[session.user.id,activeChatUser].sort();
  const {data,error}=await sb.from("direct_messages").select("*")
    .in("sender_id",ids).in("recipient_id",ids).order("created_at");
  if(error){box.textContent=error.message;return}
  box.innerHTML="";
  for(const m of data||[]){
    const wrap=document.createElement("div");
    wrap.className="message "+(m.sender_id===session.user.id?"mine":"");
    const body=document.createElement("div");body.textContent=m.body;
    const meta=document.createElement("small");meta.textContent=timeText(m.created_at);
    const tr=document.createElement("button");tr.className="secondary";tr.textContent=t("翻訳","Translate");
    tr.onclick=async()=>{
      tr.disabled=true;
      const translated=await translateMessage(m.id,m.body,"direct");
      if(translated){body.textContent=translated;tr.textContent=t("原文","Original");tr.onclick=()=>{body.textContent=m.body;tr.textContent=t("翻訳","Translate")}}
      tr.disabled=false;
    };
    wrap.append(body,meta,tr);box.appendChild(wrap);
    if(autoTranslate && m.sender_id!==session.user.id){
      const translated=await translateMessage(m.id,m.body,"direct");
      if(translated)body.textContent=translated;
    }
  }
}
$("#openChat")?.addEventListener("click",()=>{activeChatUser=$("#chatUser").value.trim();renderChatFinal()});
$("#sendChat")?.addEventListener("click",async()=>{
  if(!sb||!session||!activeChatUser)return;
  const body=$("#chatMessage").value.trim();if(!body)return;
  const {error}=await sb.from("direct_messages").insert({sender_id:session.user.id,recipient_id:activeChatUser,body,source_language:lang});
  if(error)alert(error.message);else{$("#chatMessage").value="";renderChatFinal()}
});

async function loadFinalCanonical(){
  if(!sb||!session)return;
  await loadCanonicalAfterAuth();
}
window.addEventListener("online",()=>{serverOnline=true;syncOfflineChanges().catch(()=>{})});
window.addEventListener("offline",()=>{serverOnline=false});

async function syncOfflineChanges(){
  if(!sb||!session)return;
  const pending=JSON.parse(localStorage.getItem("sprite-check-pending-v1")||"[]");
  if(!pending.length)return;
  const remaining=[];
  for(const row of pending){
    const {error}=await sb.from("sprite_state").upsert(row,{onConflict:"user_id,sprite_id"});
    if(error)remaining.push(row);
  }
  localStorage.setItem("sprite-check-pending-v1",JSON.stringify(remaining));
  if(!remaining.length) setApiStatus(t("☁️ オフライン変更を同期しました。","☁️ Offline changes synchronized."));
}

const originalSave=save;
save=function(){
  originalSave();
  if(!sb||!session||!navigator.onLine){
    const rows=JSON.parse(localStorage.getItem("sprite-check-pending-v1")||"[]");
    const map=new Map(rows.map(x=>[x.sprite_id,x]));
    for(const [sprite_id,x] of Object.entries(state)){
      map.set(sprite_id,{user_id:session?.user?.id||"offline",sprite_id,owned:!!x.owned,master:!!x.master,level:Number(x.level)||1,manual:!!x.manual,updated_at:x.updated_at||nowIso()});
    }
    localStorage.setItem("sprite-check-pending-v1",JSON.stringify([...map.values()]));
  }
};

async function setupRealtimeFinal(){
  if(!sb||!session)return;
  sb.channel("sprite-check-live-"+session.user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:"user_id=eq."+session.user.id},()=>renderUserNotifications())
    .on("postgres_changes",{event:"*",schema:"public",table:"exchange_chat_messages"},()=>renderSocial())
    .subscribe();
}
setTimeout(()=>setupRealtimeFinal(),1200);
setTimeout(()=>loadFinalCanonical(),1500);


/* ============================================================
   EXCHANGE / INQUIRY CHAT LIFECYCLE
   ============================================================ */
let activeExchangeChat=null;
let activeInquiry=null;

async function renderExchangeFinal(){
  const box=$("#exchangeList"), select=$("#exchangeChatSelect");
  if(!box||!sb||!session){
    if(box)box.innerHTML="<p>"+t("ログイン後に利用できます。","Sign in to use exchanges.")+"</p>";
    return;
  }
  const posts=await sb.from("exchange_posts").select("*").order("created_at",{ascending:false}).limit(100);
  if(posts.error){box.textContent=posts.error.message;return}
  let html="";
  for(const p of posts.data||[]){
    const name=sprites.find(s=>s.id===p.sprite_id)?.name||p.sprite_id;
    let actions="";
    if(p.owner_id===session.user.id){
      const rr=await sb.from("exchange_requests").select("*").eq("post_id",p.id).order("created_at",{ascending:false});
      actions=(rr.data||[]).map(q=>{
        const st=q.status;
        if(st==="pending")return '<div class="row"><span>申請 '+esc(q.requester_id)+'</span><button data-accept="'+q.id+'">承認</button><button data-reject="'+q.id+'" class="secondary">拒否</button></div>';
        return '<small>申請者 '+esc(q.requester_id)+' · '+esc(st)+'</small>';
      }).join("");
    }else if(p.status==="open"){
      actions='<button data-exchange="'+p.id+'">応募</button>';
    }
    html+='<div class="list-item"><b>'+esc(name)+'</b><small>'+esc(p.type)+' · '+esc(p.status)+' · '+timeText(p.created_at)+'</small>'+actions+'</div>';
  }
  box.innerHTML=html||"<p>"+t("交換募集はありません。","No exchange posts.")+"</p>";
  $$("[data-exchange]").forEach(b=>b.onclick=async()=>{
    const {error}=await sb.from("exchange_requests").insert({post_id:b.dataset.exchange,requester_id:session.user.id,message:"交換を希望します"});
    if(error)alert(error.message);else renderExchangeFinal();
  });
  $$("[data-accept]").forEach(b=>b.onclick=async()=>{
    const {error}=await sb.from("exchange_requests").update({status:"accepted"}).eq("id",b.dataset.accept).eq("status","pending");
    if(error)alert(error.message);else{await sb.from("audit_logs").insert({actor_id:session.user.id,action:"exchange_accept",details:{request_id:b.dataset.accept}});await renderExchangeFinal();await renderExchangeChatsFinal()}
  });
  $$("[data-reject]").forEach(b=>b.onclick=async()=>{
    const {error}=await sb.from("exchange_requests").update({status:"rejected"}).eq("id",b.dataset.reject).eq("status","pending");
    if(error)alert(error.message);else renderExchangeFinal();
  });
  await renderExchangeChatsFinal();
}

async function renderExchangeChatsFinal(){
  const select=$("#exchangeChatSelect");if(!select||!sb||!session)return;
  const r=await sb.from("exchange_chats").select("*").order("created_at",{ascending:false});
  if(r.error)return;
  const chats=[];
  for(const ch of r.data||[]){
    const mem=await sb.from("exchange_chat_members").select("user_id,member_role").eq("chat_id",ch.id);
    if((mem.data||[]).some(m=>m.user_id===session.user.id)||profile?.role==="admin"||profile?.role==="superadmin")chats.push(ch);
  }
  select.innerHTML=chats.map(ch=>'<option value="'+ch.id+'">'+ch.id.slice(0,8)+' · '+esc(ch.status)+'</option>').join("");
  if(activeExchangeChat&&!chats.some(x=>x.id===activeExchangeChat))activeExchangeChat=null;
  if(!activeExchangeChat)activeExchangeChat=chats[0]?.id||null;
  if(activeExchangeChat)select.value=activeExchangeChat;
  $("#joinExchangeAsAdmin")?.classList.toggle("hidden",!(profile?.role==="admin"||profile?.role==="superadmin"));
  await renderExchangeChatFinal();
}
$("#exchangeChatSelect")?.addEventListener("change",e=>{activeExchangeChat=e.target.value;renderExchangeChatFinal()});

async function renderExchangeChatFinal(){
  const box=$("#exchangeChatBox");if(!box||!activeExchangeChat||!sb||!session){if(box)box.innerHTML="<p>"+t("交換チャットを選択してください。","Select an exchange chat.")+"</p>";return}
  const r=await sb.from("exchange_chat_messages").select("*").eq("chat_id",activeExchangeChat).order("created_at");
  if(r.error){box.textContent=r.error.message;return}
  box.innerHTML="";
  for(const m of r.data||[]){
    const wrap=document.createElement("div");wrap.className="message "+(m.sender_id===session.user.id?"mine":"");
    const body=document.createElement("div");body.textContent=m.body;
    const meta=document.createElement("small");meta.textContent=timeText(m.created_at);
    const tr=document.createElement("button");tr.className="secondary";tr.textContent=t("翻訳","Translate");
    tr.onclick=async()=>{tr.disabled=true;const v=await translateMessage(m.id,m.body,"exchange");if(v){body.textContent=v;tr.textContent=t("原文","Original");tr.onclick=()=>{body.textContent=m.body;tr.textContent=t("翻訳","Translate")}}tr.disabled=false};
    wrap.append(body,meta,tr);box.appendChild(wrap);
    if(autoTranslate&&m.sender_id!==session.user.id){const v=await translateMessage(m.id,m.body,"exchange");if(v)body.textContent=v}
  }
}
$("#sendExchangeChat")?.addEventListener("click",async()=>{
  if(!activeExchangeChat||!sb||!session)return;
  const body=$("#exchangeChatMessage").value.trim();if(!body)return;
  const {error}=await sb.from("exchange_chat_messages").insert({chat_id:activeExchangeChat,sender_id:session.user.id,body,source_language:lang});
  if(error)alert(error.message);else{$("#exchangeChatMessage").value="";renderExchangeChatFinal()}
});
$("#joinExchangeAsAdmin")?.addEventListener("click",async()=>{
  if(!activeExchangeChat||!sb||!["admin","superadmin"].includes(profile?.role||""))return;
  const {error}=await sb.from("exchange_chat_members").upsert({chat_id:activeExchangeChat,user_id:session.user.id,member_role:"admin"},{onConflict:"chat_id,user_id"});
  if(error)alert(error.message);else{
    await sb.from("exchange_chat_messages").insert({chat_id:activeExchangeChat,sender_id:session.user.id,body:"🛡️ 管理者がこの交換チャットに参加しました。",source_language:lang});
    await sb.from("audit_logs").insert({actor_id:session.user.id,action:"exchange_admin_join",details:{chat_id:activeExchangeChat}});
    renderExchangeChatFinal();
  }
});
$("#reportExchange")?.addEventListener("click",async()=>{
  if(!activeExchangeChat||!sb||!session)return;
  const details=prompt(t("交換トラブルの詳細を入力してください。","Describe the exchange problem."));
  if(!details)return;
  const {error}=await sb.from("exchange_issues").insert({chat_id:activeExchangeChat,reporter_id:session.user.id,details});
  if(error)alert(error.message);else alert(t("問い合わせを作成しました。","Issue report created."));
});

async function renderInquiriesFinal(){
  const list=$("#inquiryList"),select=$("#inquirySelect");
  if(!list||!sb||!session)return;
  const r=await sb.from("inquiries").select("*").eq("user_id",session.user.id).order("created_at",{ascending:false});
  if(r.error){list.textContent=r.error.message;return}
  list.innerHTML=(r.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.subject)+'</b><small>'+esc(x.status)+' · '+timeText(x.created_at)+'</small></div>').join("")||"<p>"+t("問い合わせはありません。","No inquiries.")+"</p>";
  select.innerHTML=(r.data||[]).map(x=>'<option value="'+x.id+'">'+esc(x.subject)+'</option>').join("");
  if(activeInquiry&&!r.data.some(x=>x.id===activeInquiry))activeInquiry=null;
  if(!activeInquiry)activeInquiry=r.data?.[0]?.id||null;
  if(activeInquiry)select.value=activeInquiry;
  await renderInquiryChatFinal();
}
$("#inquirySelect")?.addEventListener("change",e=>{activeInquiry=e.target.value;renderInquiryChatFinal()});

async function renderInquiryChatFinal(){
  const box=$("#inquiryChatBox");if(!box||!sb||!session||!activeInquiry)return;
  const r=await sb.from("inquiry_messages").select("*").eq("inquiry_id",activeInquiry).order("created_at");
  if(r.error){box.textContent=r.error.message;return}
  box.innerHTML="";
  for(const m of r.data||[]){
    const wrap=document.createElement("div");wrap.className="message "+(m.sender_id===session.user.id?"mine":"");
    const body=document.createElement("div");body.textContent=m.body;
    const meta=document.createElement("small");meta.textContent=timeText(m.created_at);
    const tr=document.createElement("button");tr.className="secondary";tr.textContent=t("翻訳","Translate");
    tr.onclick=async()=>{tr.disabled=true;const v=await translateMessage(m.id,m.body,"inquiry");if(v){body.textContent=v;tr.textContent=t("原文","Original");tr.onclick=()=>{body.textContent=m.body;tr.textContent=t("翻訳","Translate")}}tr.disabled=false};
    wrap.append(body,meta,tr);box.appendChild(wrap);
    if(autoTranslate&&m.sender_id!==session.user.id){const v=await translateMessage(m.id,m.body,"inquiry");if(v)body.textContent=v}
  }
}
$("#sendInquiryMessage")?.addEventListener("click",async()=>{
  if(!sb||!session||!activeInquiry)return;
  const body=$("#inquiryMessage").value.trim();if(!body)return;
  const {data,error}=await sb.from("inquiry_messages").insert({inquiry_id:activeInquiry,sender_id:session.user.id,body,source_language:lang}).select("id").single();
  if(error){alert(error.message);return}
  const file=$("#inquiryImage")?.files?.[0];
  if(file&&data?.id){
    const path="support/"+session.user.id+"/"+activeInquiry+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const up=await sb.storage.from("support").upload(path,file,{contentType:file.type,upsert:false});
    if(!up.error)await sb.from("inquiry_attachments").insert({inquiry_id:activeInquiry,message_id:data.id,storage_path:path,file_name:file.name,mime_type:file.type});
  }
  $("#inquiryMessage").value="";if($("#inquiryImage"))$("#inquiryImage").value="";renderInquiryChatFinal();
});

const originalRenderSocial=renderSocial;
renderSocial=async function(){
  await renderExchangeFinal();
  await renderInquiriesFinal();
  await renderChatFinal();
};

$("#createInquiry")?.addEventListener("click",async()=>{
  if(!sb||!session)return alert(t("ログインしてください。","Sign in first."));
  const subject=$("#inquirySubject").value.trim();const inquiry_type=$("#inquiryType")?.value||"other";if(!subject)return;
  const {data,error}=await sb.from("inquiries").insert({user_id:session.user.id,subject,inquiry_type,status:"open"}).select("id").single();
  if(error)alert(error.message);else{$("#inquirySubject").value="";activeInquiry=data.id;await renderInquiriesFinal()}
});

/* Superadmin-only role management and user email view. */
async function changeUserRoleFinal(userId,role){
  if(profile?.role!=="superadmin"||userId===session.user.id)return;
  const reason=prompt(t("権限変更の理由を入力してください。","Enter a reason for the role change."));
  if(reason===null)return;
  const {error}=await sb.rpc("set_admin_role",{p_target:userId,p_new_role:role,p_reason:reason});
  if(error)alert(error.message);else await renderAdmin();
}
changeUserRole=changeUserRoleFinal;

async function renderAdminFinal(){
  const ok=profile&&(profile.role==="admin"||profile.role==="superadmin");
  $("#adminPanel")?.classList.toggle("hidden",!ok);
  if(!ok||!sb)return;
  const heading=$("#adminPanel h2");if(heading)heading.textContent=profile.role==="superadmin"?"👑 最上位管理者":"🛡️ 管理者";
  try{
    const ur=await sb.functions.invoke("admin-users",{body:{}});
    if(ur.error)throw ur.error;
    const users=ur.data?.users||[];
    $("#userList").innerHTML=users.map(x=>{
      const roleButtons=profile.role==="superadmin"&&x.id!==session.user.id?
        '<button data-role-user-final="'+x.id+'" data-role-final="admin">管理者</button><button class="secondary" data-role-user-final="'+x.id+'" data-role-final="user">一般</button>':"";
      return '<div class="list-item"><b>'+esc(x.display_name||x.email||x.id)+'</b><small>'+esc(x.email)+' · '+esc(x.role)+' · '+timeText(x.created_at)+(x.suspended?" · 停止中":"")+'</small><div class="row"><button data-user-final="'+x.id+'">Sprite編集</button>'+roleButtons+'</div></div>';
    }).join("")||"<p>ユーザーなし</p>";
    $$("[data-user-final]").forEach(b=>b.onclick=()=>openAdminUser(b.dataset.userFinal));
    $$("[data-role-user-final]").forEach(b=>b.onclick=()=>changeUserRoleFinal(b.dataset.roleUserFinal,b.dataset.roleFinal));
  }catch(e){console.warn(e)}
  const a=await sb.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(100);
  $("#auditList").innerHTML=(a.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.action)+'</b><small>'+esc(x.actor_id||"")+" → "+esc(x.target_user_id||"")+" · "+timeText(x.created_at)+'</small></div>').join("")||"<p>ログなし</p>";
  await renderAdminExchanges();await renderAdminInquiries();await renderAdminAnnouncements();
}
renderAdmin=renderAdminFinal;

setTimeout(()=>{updateFinalRoleUi();renderSocial().catch(()=>{})},1800);


/* Inquiry routing: keep administrator availability current for superadmin-first support handoff. */
let adminHeartbeatTimer=null;
async function heartbeatAdmin(){
  if(!sb||!session||!profile||!['admin','superadmin'].includes(profile.role))return;
  const r=await sb.rpc('admin_heartbeat');
  if(r.error)console.warn('admin heartbeat',r.error.message);
}
function startAdminHeartbeat(){
  if(adminHeartbeatTimer)clearInterval(adminHeartbeatTimer);
  if(!profile||!['admin','superadmin'].includes(profile.role))return;
  heartbeatAdmin();
  adminHeartbeatTimer=setInterval(heartbeatAdmin,45000);
}
startAdminHeartbeat();
