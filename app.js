const KEY="sprite-check-state-v1";
const DATA_KEY="sprite-check-catalog-v1";
const DATA_TIME_KEY="sprite-check-catalog-time-v1";
const SOURCE="https://raw.githubusercontent.com/valincius/fn-sprites/main/src/sprites.json";
const REFRESH_MS=12*60*60*1000;
let state=JSON.parse(localStorage.getItem(KEY)||"{}");
let lang=localStorage.getItem("sprite-lang")||"ja";
let sprites=Array.isArray(window.SPRITES)?window.SPRITES:[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function item(id){return state[id]||(state[id]={owned:false,master:false,level:1,manual:false})}
const variantNames={base:"Normal",normal:"Normal",gold:"Gold",candy:"Gummy",gummy:"Gummy",galaxy:"Galaxy",gem:"Gem",holofoil:"Holofoil",cube:"Cube",quack:"Quack",cheatmaster:"Cheat Master",loothacker:"Loot Hacker",bountyhunter:"Bounty Hunter"};
function parseSource(rows){
  if(!Array.isArray(rows)||!rows.length) throw new Error("catalog empty");
  return rows.filter(x=>x&&x.parent&&x.url).map(x=>({
    id:"fn-"+String(x.spriteId)+"-"+String(x.variant||"base"),
    name:String(x.parent)+" · "+(variantNames[x.variant]||String(x.variant||"Normal")),
    season:x.season||"",
    releaseDate:"",
    status:"released",
    imageUrl:x.url,
    isNew:false,
    rarity:x.rarity||"",
    source:"FN Sprite catalog"
  }));
}
function timeText(t){return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(t))}
async function syncSprites(force=false){
  const now=Date.now(),cached=localStorage.getItem(DATA_KEY),stamp=Number(localStorage.getItem(DATA_TIME_KEY)||0);
  if(!force&&cached&&now-stamp<REFRESH_MS){
    try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みデータ"}}catch{}
  }
  try{
    const res=await fetch(SOURCE,{cache:"no-store"}); if(!res.ok) throw new Error("HTTP "+res.status);
    sprites=parseSource(await res.json());
    localStorage.setItem(DATA_KEY,JSON.stringify(sprites));
    localStorage.setItem(DATA_TIME_KEY,String(now));
    render(); return{ok:true,count:sprites.length,time:now,source:"公開データ"};
  }catch(e){
    if(cached){try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みデータ"}}catch{}}
    render(); return{ok:false,count:0,time:0,source:"取得失敗"};
  }
}
function setSyncStatus(info){
  const el=$("#syncStatus"); if(!el)return;
  if(!info){el.textContent="Spriteデータを確認中…";return}
  if(info.ok) el.innerHTML="✅ Spriteデータ取得成功<br><b>"+info.count+"件</b>を読み込みました<br><small>"+info.source+"・最終更新: "+timeText(info.time)+"</small>";
  else el.innerHTML="⚠️ Spriteデータを取得できませんでした<br><small>保存済みデータがある場合はそれを使用します。</small>";
}
function render(){
  const q=($("#search").value||"").toLowerCase(),f=$("#filter").value;
  const list=sprites.filter(s=>(!q||s.name.toLowerCase().includes(q))&&(f==="all"||f==="owned"&&item(s.id).owned||f==="unowned"&&!item(s.id).owned||f==="master"&&item(s.id).master||f==="upcoming"&&s.status==="upcoming"||f==="new"&&s.isNew));
  $("#grid").innerHTML=list.map(s=>{const x=item(s.id);return '<article class="card"><img class="sprite-img" src="'+esc(s.imageUrl||"")+'" alt="'+esc(s.name)+'" loading="lazy" onerror="this.style.display=\'none\'"><h3>'+esc(s.name)+'</h3><div class="row"><span class="badge">'+esc(s.status)+'</span>'+(s.isNew?'<span class="badge">NEW</span>':'')+'</div><p><label><input type="checkbox" data-id="'+s.id+'" data-k="owned" '+(x.owned?"checked":"")+'> 所持</label> <label><input type="checkbox" data-id="'+s.id+'" data-k="master" '+(x.master?"checked":"")+'> Master</label></p><label>Lv <input style="width:65px" type="number" min="1" max="5" value="'+Math.min(5,x.level||1)+'" data-id="'+s.id+'" data-k="level"></label></article>'}).join("")||'<div class="empty">該当するSpriteがありません</div>';
  const owned=sprites.filter(s=>item(s.id).owned).length,master=sprites.filter(s=>item(s.id).master).length;
  $("#owned").textContent=owned;$("#master").textContent=master;$("#rate").textContent=sprites.length?Math.round(owned/sprites.length*100)+"%":"0%";
}
document.addEventListener("change",e=>{const id=e.target.dataset.id,k=e.target.dataset.k;if(id&&k){const x=item(id);x[k]=k==="level"?Math.max(1,Math.min(5,Number(e.target.value)||1)):e.target.checked;x.manual=true;save()}});
$("#search").addEventListener("input",render);$("#filter").addEventListener("change",render);
$("#theme").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("sprite-theme",document.body.classList.contains("dark")?"dark":"light")};
$("#lang").onclick=()=>{lang=lang==="ja"?"en":"ja";localStorage.setItem("sprite-lang",lang);$("#lang").textContent=lang==="ja"?"EN":"JP"};
$("#import").onchange=e=>{const box=$("#preview");box.innerHTML="";[...e.target.files].forEach(f=>{if(!f.type.startsWith("image/"))return;const img=document.createElement("img");img.src=URL.createObjectURL(f);box.appendChild(img)});$("#review").textContent=e.target.files.length+"枚を読み込みました。認識結果は確認してから反映する構成です。"};
$("#export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="sprite-check-backup.json";a.click()};
$("#restore").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=JSON.parse(r.result);save();alert("復元しました")}catch{alert("バックアップ形式が正しくありません")}};r.readAsText(f)};
$("#reset").onclick=()=>{if(confirm("この端末のSprite Checkデータをリセットしますか？")){state={};save()}};
$("#sync").onclick=async()=>{const b=$("#sync");b.disabled=true;b.textContent="更新中…";setSyncStatus(null);const info=await syncSprites(true);setSyncStatus(info);b.disabled=false;b.textContent="Spriteデータ更新";alert(info.ok?"Spriteデータを更新しました。\n"+info.count+"件を読み込みました。":"更新できませんでした。")};
if(localStorage.getItem("sprite-theme")==="dark")document.body.classList.add("dark");
$("#lang").textContent=lang==="ja"?"EN":"JP";render();setSyncStatus(null);syncSprites(false).then(setSyncStatus);
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});