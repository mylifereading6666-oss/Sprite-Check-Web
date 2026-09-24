const KEY="sprite-check-state-v2";
const DATA_KEY="sprite-check-catalog-v2";
const DATA_TIME_KEY="sprite-check-catalog-time-v2";
const CONFIG_KEY="sprite-check-supabase-v1";
const SOURCE="https://raw.githubusercontent.com/valincius/fn-sprites/main/src/sprites.json";
const REFRESH_MS=5000;

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

async function syncSprites(force=false){
  const now=Date.now(),cached=localStorage.getItem(DATA_KEY),stamp=Number(localStorage.getItem(DATA_TIME_KEY)||0);
  if(!force&&cached&&now-stamp<REFRESH_MS){try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みデータ"}}catch{}}
  try{const res=await fetch(SOURCE+"?t="+now,{cache:"no-store"});if(!res.ok)throw new Error("HTTP "+res.status);const next=normalizeCatalog(await res.json());const changed=JSON.stringify(next)!==JSON.stringify(sprites);sprites=next;localStorage.setItem(DATA_KEY,JSON.stringify(sprites));localStorage.setItem(DATA_TIME_KEY,String(now));render();if(changed)notifyNewSprites();return{ok:true,count:sprites.length,time:now,source:changed?"公開データ（更新あり）":"公開データ"}}catch(e){if(cached)try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みデータ"}}catch{}return{ok:false,count:0,time:0,source:"取得失敗"}}}
function setSyncStatus(info){const el=$("#syncStatus");if(!el)return;if(!info){el.textContent=t("Spriteデータを確認中…","Checking Sprite data…");return}el.innerHTML=info.ok?"✅ "+esc(info.source)+"<br><b>"+info.count+"件</b>を読み込み済み<br><small>最終確認: "+timeText(info.time)+"</small>":"⚠️ "+t("Spriteデータを取得できませんでした","Could not fetch Sprite data")}

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
}

document.addEventListener("change",e=>{const id=e.target.dataset.id,k=e.target.dataset.k;if(id&&k){const x=item(id);x[k]=k==="level"?Math.max(1,Math.min(5,Number(e.target.value)||1)):e.target.checked;x.manual=true;x.updated_at=nowIso();save()}});
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
  $("#authStatus").textContent=logged?t("ログイン中: "+(profile?.display_name||session.user.email),"Signed in: "+(profile?.display_name||session.user.email)):sb?t("Supabase接続済み・未ログイン","Supabase connected · not signed in"):t("端末内モードで利用中です","Using local device mode");
  $("#adminPanel").classList.toggle("hidden",!(profile&&(profile.role==="admin"||profile.role==="superadmin")));
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

function notifyNewSprites(){const last=Number(localStorage.getItem("sprite-check-notify-count-v1")||0);if(sprites.length>last&&last>0&&Notification?.permission==="granted")new Notification("Sprite Check",{body:t("新しいSpriteデータが追加されました。","New Sprite data is available.")});localStorage.setItem("sprite-check-notify-count-v1",String(sprites.length))}
$("#notifyNew").onclick=async()=>{if(!("Notification"in window))return alert(t("このブラウザは通知に対応していません。","This browser does not support notifications."));const p=await Notification.requestPermission();$("#notificationStatus").textContent=p==="granted"?t("通知を許可しました。","Notifications enabled."):t("通知は許可されませんでした。","Notifications were not enabled.")};
$("#requestNotification").onclick=()=>$("#notifyNew").click();

function loadConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}")}catch{return{}}}
function saveConfig(){localStorage.setItem(CONFIG_KEY,JSON.stringify({url:$("#supabaseUrl").value.trim(),key:$("#supabaseKey").value.trim()}))}
function setApiStatus(s){$("#apiStatus").textContent=s}
async function connectSupabase(){
  const cfg=loadConfig(),url=$("#supabaseUrl").value.trim()||cfg.url,key=$("#supabaseKey").value.trim()||cfg.key;
  if(!url||!key)return setApiStatus(t("Supabase URLとPublishable Keyを入力してください。","Enter the Supabase URL and Publishable Key."));
  try{
    saveConfig();
    sb=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await sb.auth.getSession();if(error)throw error;session=data.session;
    sb.auth.onAuthStateChange(async(_e,s)=>{session=s;await loadProfile();renderAuth();if(session)await cloudPullState();});
    await loadProfile();setApiStatus(t("✅ Supabaseに接続しました。","✅ Connected to Supabase."));renderAuth();if(session)await cloudPullState();
  }catch(e){sb=null;session=null;setApiStatus("⚠️ "+e.message)}
}
async function loadProfile(){profile=null;if(!sb||!session){renderAuth();return}const {data,error}=await sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle();if(error)throw error;if(data)profile=data;else{const name=$("#displayName").value.trim()||session.user.email.split("@")[0];const ins=await sb.from("profiles").insert({id:session.user.id,display_name:name,role:"user"}).select().single();if(!ins.error)profile=ins.data}renderAdmin()}
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
$("#connectSupabase").onclick=connectSupabase;
$("#cloudSync").onclick=async()=>{if(!sb||!session)return setApiStatus(t("先にSupabaseへ接続してログインしてください。","Connect to Supabase and sign in first."));await cloudPullState();await cloudPushState()};
$("#signUp").onclick=async()=>{if(!sb)return alert(t("先にSupabaseを接続してください。","Connect to Supabase first."));const {error}=await sb.auth.signUp({email:$("#email").value.trim(),password:$("#password").value});if(error)alert(error.message);else alert(t("登録処理を開始しました。メール確認が必要な設定では確認メールを確認してください。","Sign-up started. Check your email if confirmation is enabled."))};
$("#signIn").onclick=async()=>{if(!sb)return alert(t("先にSupabaseを接続してください。","Connect to Supabase first."));const {error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)alert(error.message)};
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

async function renderAdmin(){
  const ok=profile&&(profile.role==="admin"||profile.role==="superadmin");$("#adminPanel").classList.toggle("hidden",!ok);if(!ok||!sb)return;
  const u=await sb.from("profiles").select("id,display_name,role,created_at").order("created_at",{ascending:false});$("#userList").innerHTML=(u.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.display_name||x.id)+'</b><small>'+esc(x.role)+' · '+esc(x.id)+'</small><button data-user="'+x.id+'">Sprite編集</button></div>').join("");$$("[data-user]").forEach(b=>b.onclick=()=>openAdminUser(b.dataset.user));
  const a=await sb.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(50);$("#auditList").innerHTML=(a.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.action)+'</b><small>'+esc(x.actor_id||"")+" · "+timeText(x.created_at)+'</small></div>').join("");
  const iq=await sb.from("inquiries").select("*").order("created_at",{ascending:false}).limit(50);$("#adminInquiryList").innerHTML=(iq.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.subject)+'</b><small>'+esc(x.status||"open")+' · '+esc(x.user_id)+'</small></div>').join("");
}
async function openAdminUser(userId){$("#adminEditor").classList.remove("hidden");$("#adminUserId").value=userId;$("#adminEditorTitle").textContent="ユーザーのSprite編集 · "+userId;const {data,error}=await sb.from("sprite_state").select("*").eq("user_id",userId);if(error)return alert(error.message);const map=Object.fromEntries((data||[]).map(x=>[x.sprite_id,x]));const q=$("#adminSearch").value.toLowerCase();$("#adminSpriteList").innerHTML=sprites.filter(s=>!q||s.name.toLowerCase().includes(q)).map(s=>{const x=map[s.id]||{};return '<label class="detect-row"><input type="checkbox" data-admin-id="'+esc(s.id)+'" data-user-id="'+esc(userId)+'" data-admin-k="owned" '+(x.owned?"checked":"")+'> '+esc(s.name)+' <span class="badge">Master '+(x.master?"✓":"—")+'</span><input class="level-input" type="number" min="1" max="5" value="'+(x.level||1)+'" data-admin-id="'+esc(s.id)+'" data-user-id="'+esc(userId)+'" data-admin-k="level"></label>'}).join("")}
$("#adminSearch").addEventListener("input",()=>openAdminUser($("#adminUserId").value));
document.addEventListener("change",async e=>{const id=e.target.dataset.adminId,k=e.target.dataset.adminK,u=e.target.dataset.userId;if(!id||!k||!u||!sb||!profile)return;const current=await sb.from("sprite_state").select("*").eq("user_id",u).eq("sprite_id",id).maybeSingle();const x=current.data||{user_id:u,sprite_id:id,owned:false,master:false,level:1,manual:false};if(k==="owned")x.owned=e.target.checked;else x.level=Math.max(1,Math.min(5,Number(e.target.value)||1));x.manual=true;x.updated_at=nowIso();const r=await sb.from("sprite_state").upsert(x,{onConflict:"user_id,sprite_id"});if(r.error)alert(r.error.message);else await sb.from("audit_logs").insert({actor_id:session.user.id,target_user_id:u,action:"sprite_edit",details:{sprite_id:id,field:k,value:k==="owned"?e.target.checked:x.level}})});

$("#export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({version:2,exported_at:nowIso(),state},null,2)],{type:"application/json"}));a.download="sprite-check-backup.json";a.click()};
$("#restore").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);state=x.state||x;save();alert(t("復元しました","Restored"))}catch{alert(t("バックアップ形式が正しくありません","Invalid backup format"))}};r.readAsText(f)};
$("#reset").onclick=()=>{if(confirm(t("この端末のSprite Checkデータをリセットしますか？","Reset local Sprite Check data?"))){state={};save()}};

$("#exportChecklist").onclick=()=>{const w=1200,h=800,c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");ctx.fillStyle="#111827";ctx.fillRect(0,0,w,h);ctx.fillStyle="#fff";ctx.font="bold 34px system-ui";ctx.fillText("SPRITE CHECK",40,55);ctx.font="20px system-ui";ctx.fillText("Owned "+sprites.filter(s=>item(s.id).owned).length+" / "+sprites.length+"   Master "+sprites.filter(s=>item(s.id).master).length,40,90);const cols=5,cellW=220,cellH=135;sprites.slice(0,25).forEach((s,i)=>{const x=20+(i%cols)*cellW,y=120+Math.floor(i/cols)*cellH;ctx.fillStyle=item(s.id).owned?"#22c55e":"#334155";ctx.fillRect(x,y,200,110);ctx.fillStyle="#fff";ctx.font="15px system-ui";ctx.fillText((item(s.id).owned?"✓ ":"□ ")+s.name.slice(0,25),x+10,y+30);ctx.fillText("Lv "+(item(s.id).level||1)+(item(s.id).master?"  ★ Master":""),x+10,y+58)});const a=document.createElement("a");a.href=c.toDataURL("image/png");a.download="sprite-checklist.png";a.click()};
$("#sync").onclick=async()=>{const b=$("#sync");b.disabled=true;b.textContent=t("更新中…","Updating…");setSyncStatus(null);const info=await syncSprites(true);setSyncStatus(info);b.disabled=false;b.textContent=t("Spriteデータ更新","Update Sprite data")};
if(localStorage.getItem("sprite-theme")==="dark")document.body.classList.add("dark");

const cfg=loadConfig();$("#supabaseUrl").value=cfg.url||"";$("#supabaseKey").value=cfg.key||"";
$("#supabaseUrl").addEventListener("change",saveConfig);$("#supabaseKey").addEventListener("change",saveConfig);
applyLanguage();renderAuth();render();renderExchangeSprites();setSyncStatus(null);syncSprites(true).then(setSyncStatus);
setInterval(()=>syncSprites(true).then(setSyncStatus),REFRESH_MS);
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
