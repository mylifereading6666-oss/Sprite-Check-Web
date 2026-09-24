const KEY="sprite-check-state-v1";
const DATA_KEY="sprite-check-catalog-v1";
const DATA_TIME_KEY="sprite-check-catalog-time-v1";
const SOURCE="https://raw.githubusercontent.com/valincius/fn-sprites/main/src/sprites.json";
const REFRESH_MS=5000;
let state=JSON.parse(localStorage.getItem(KEY)||"{}");
let lang=localStorage.getItem("sprite-lang")||"ja";
let sprites=Array.isArray(window.SPRITES)?window.SPRITES:[];
let selectedFiles=[];let recognitionResults=[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function item(id){return state[id]||(state[id]={owned:false,master:false,level:1,manual:false})}
const variantNames={base:"Normal",normal:"Normal",gold:"Gold",candy:"Gummy",gummy:"Gummy",galaxy:"Galaxy",gem:"Gem",holofoil:"Holofoil",cube:"Cube",quack:"Quack",cheatmaster:"Cheat Master",loothacker:"Loot Hacker",bountyhunter:"Bounty Hunter"};
function parseSource(rows){
  if(!Array.isArray(rows)||!rows.length) throw new Error("catalog empty");
  return rows.filter(x=>x&&x.parent&&x.url).map(x=>({id:"fn-"+String(x.spriteId)+"-"+String(x.variant||"base"),name:String(x.parent)+" · "+(variantNames[x.variant]||String(x.variant||"Normal")),season:x.season||"",releaseDate:"",status:"released",imageUrl:x.url,isNew:false,rarity:x.rarity||"",source:"FN Sprite catalog"}));
}
function timeText(t){return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(t))}
async function syncSprites(force=false){
  const now=Date.now(),cached=localStorage.getItem(DATA_KEY),stamp=Number(localStorage.getItem(DATA_TIME_KEY)||0);
  if(!force&&cached&&now-stamp<REFRESH_MS){try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みデータ"}}catch{}}
  try{
    const res=await fetch(SOURCE+"?t="+now,{cache:"no-store"}); if(!res.ok) throw new Error("HTTP "+res.status);
    const next=parseSource(await res.json());
    const changed=JSON.stringify(next)!==JSON.stringify(sprites);
    sprites=next; localStorage.setItem(DATA_KEY,JSON.stringify(sprites)); localStorage.setItem(DATA_TIME_KEY,String(now));
    render(); return{ok:true,count:sprites.length,time:now,source:changed?"公開データ（更新あり）":"公開データ"};
  }catch(e){
    if(cached){try{sprites=JSON.parse(cached);render();return{ok:true,count:sprites.length,time:stamp,source:"保存済みデータ"}}catch{}}
    render(); return{ok:false,count:0,time:0,source:"取得失敗"};
  }
}
function setSyncStatus(info){
  const el=$("#syncStatus"); if(!el)return;
  if(!info){el.textContent="Spriteデータを確認中…";return}
  if(info.ok) el.innerHTML="✅ "+info.source+"<br><b>"+info.count+"件</b>を読み込み済み<br><small>最終確認: "+timeText(info.time)+"</small>";
  else el.innerHTML="⚠️ Spriteデータを取得できませんでした";
}
function render(){
  const q=($("#search").value||"").toLowerCase(),f=$("#filter").value,season=$("#seasonFilter").value;
  const filtered=sprites.filter(s=>(!q||s.name.toLowerCase().includes(q))&&(season==="all"||s.season===season)&&(f==="all"||f==="owned"&&item(s.id).owned||f==="unowned"&&!item(s.id).owned||f==="master"&&item(s.id).master||f==="upcoming"&&s.status==="upcoming"||f==="new"&&s.isNew));
  const groups={};
  filtered.forEach(s=>(groups[s.season||"unknown"]??=[]).push(s));
  const labels={c7s4:"Chapter 7 Season 4 · Override",c7s3:"Chapter 7 Season 3 · Runners",unknown:"その他"};
  const html=Object.entries(groups).map(([season,list])=>'<section class="season-group"><h2>'+esc(labels[season]||season)+'</h2><div class="grid">'+list.map(s=>{const x=item(s.id);return '<article class="card"><img class="sprite-img" src="'+esc(s.imageUrl||"")+'" alt="'+esc(s.name)+'" loading="lazy" onerror="this.style.display=\\'none\\'"><h3>'+esc(s.name)+'</h3><div class="row"><span class="badge">'+esc(s.status)+'</span>'+(s.isNew?'<span class="badge">NEW</span>':'')+'</div><p><label><input type="checkbox" data-id="'+s.id+'" data-k="owned" '+(x.owned?"checked":"")+'> 所持</label> <label><input type="checkbox" data-id="'+s.id+'" data-k="master" '+(x.master?"checked":"")+'> Master</label></p><label>Lv <input style="width:65px" type="number" min="1" max="5" value="'+Math.min(5,x.level||1)+'" data-id="'+s.id+'" data-k="level"></label></article>'}).join("")+'</div></section>').join("")||'<div class="empty">該当するSpriteがありません</div>';
  $("#grid").innerHTML=html;
  const owned=sprites.filter(s=>item(s.id).owned).length,master=sprites.filter(s=>item(s.id).master).length;
  $("#owned").textContent=owned;$("#master").textContent=master;$("#rate").textContent=sprites.length?Math.round(owned/sprites.length*100)+"%":"0%";
}
document.addEventListener("change",e=>{const id=e.target.dataset.id,k=e.target.dataset.k;if(id&&k){const x=item(id);x[k]=k==="level"?Math.max(1,Math.min(5,Number(e.target.value)||1)):e.target.checked;x.manual=true;save()}});
$("#search").addEventListener("input",render);$("#filter").addEventListener("change",render);$("#seasonFilter").addEventListener("change",render);
$("#theme").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("sprite-theme",document.body.classList.contains("dark")?"dark":"light")};
$("#lang").onclick=()=>{lang=lang==="ja"?"en":"ja";localStorage.setItem("sprite-lang",lang);$("#lang").textContent=lang==="ja"?"EN":"JP"};
$("#import").onchange=e=>{selectedFiles=[...e.target.files].filter(f=>f.type.startsWith("image/"));const box=$("#preview");box.innerHTML="";selectedFiles.forEach(f=>{const img=document.createElement("img");img.src=URL.createObjectURL(f);box.appendChild(img)});$("#ocrStatus").textContent=selectedFiles.length+"枚を選択しました。";$("#reviewResults").innerHTML=""};

const S4_FAMILIES=["8-Bit","Adventure","Birthday","Blinky","Bush","Crash Bandicoot","Crown","Jackrabbit","Jonesy","Killswitch","Klombo","Morgana","Onigiri","Overshield","Pond","Shadow","Sonic","Storm Scout","Tails","X-Ray"];
const S4_VARIANTS=["base","gold","cheatmaster","loothacker","bountyhunter"];
const S4_ALIASES={"8-Bit":["8-Bit","EightBitBlaster","8Bit"],"Crash Bandicoot":["Crash Bandicoot","CrashBandicoot"],"X-Ray":["X-Ray","XRay"],"8Bit":["8-Bit","EightBitBlaster"]};
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function makeSeason4Catalog(raw){
  const find=(parent,variant)=>{
    const aliases=S4_ALIASES[parent]||[parent];
    return raw.find(x=>x.season==="c7s4"&&aliases.includes(x.parent)&&String(x.variant||"base")===variant);
  };
  const out=[];
  const mega=find("Mega Man","base")||raw.find(x=>x.season==="c7s4"&&/mega.?man/i.test(x.parent)&&x.variant==="base");
  out.push({id:mega?.id||"s4-mega-man-base",name:"Mega Man · Normal",season:"c7s4",releaseDate:"",status:mega?.status||"released",imageUrl:mega?.imageUrl||"",isNew:false,rarity:mega?.rarity||""});
  for(const parent of S4_FAMILIES)for(const variant of S4_VARIANTS){
    const x=find(parent,variant);
    out.push({id:x?.id||"s4-"+slug(parent)+"-"+variant,name:parent+" · "+(variantNames[variant]||variant),season:"c7s4",releaseDate:"",status:x?.status||"released",imageUrl:x?.imageUrl||"",isNew:false,rarity:x?.rarity||""});
  }
  return out;
}
function mergeCatalog(raw){
  const season4=makeSeason4Catalog(raw);
  const season3=raw.filter(x=>x.season==="c7s3");
  return [...season4,...season3];
}
const oldParseSource=parseSource;
function parseSource(rows){return mergeCatalog(oldParseSource(rows))}

function checklistPixelDetect(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const w=1536,h=2048,sx=img.width/w,sy=img.height/h;
      const c=document.createElement("canvas");c.width=img.width;c.height=img.height;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0);
      const xs=[35,125,215,305,395,785,875,965,1055,1145],ys=[457,627,797,967,1137,1307,1477,1647,1817,1987];
      const redAt=(x,y)=>{const X=Math.round(x*sx),Y=Math.round(y*sy),W=Math.round(62*sx),H=Math.round(62*sy);if(X<0||Y<0||X+W>img.width||Y+H>img.height)return 0;const d=ctx.getImageData(X,Y,W,H).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>170&&d[i+1]<120&&d[i+2]<120)n++;return n};
      const yellowAt=(x,y)=>{const X=Math.round((x-8)*sx),Y=Math.round((y-138)*sy),W=Math.round(73*sx),H=Math.round(55*sy);if(X<0||Y<0||X+W>img.width||Y+H>img.height)return 0;const d=ctx.getImageData(X,Y,W,H).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]>125&&d[i+2]<100)n++;return n};
      const cells=[];
      for(let r=0;r<10;r++)for(let col=0;col<10;col++){const x=xs[col],y=ys[r];cells.push({owned:redAt(x,y)>120,master:yellowAt(x,y)>184})}
      const topRegion=ctx.getImageData(Math.round(img.width*.40),Math.round(img.height*.06),Math.round(img.width*.20),Math.round(img.height*.13)).data;
      let topRed=0,topYellow=0;for(let i=0;i<topRegion.length;i+=4){if(topRegion[i]>170&&topRegion[i+1]<120&&topRegion[i+2]<120)topRed++;if(topRegion[i]>180&&topRegion[i+1]>125&&topRegion[i+2]<100)topYellow++}
      cells.unshift({owned:topRed>120,master:topYellow>120});
      resolve({cells,width:img.width,height:img.height});
    };
    img.onerror=reject;img.src=URL.createObjectURL(file);
  });
}
function renderChecklistReview(r){
  const season4=sprites.filter(s=>s.season==="c7s4");
  const rows=r.cells.map((c,i)=>{const s=season4[i];if(!s)return "";return '<label class="detect-row"><input type="checkbox" class="detected" data-index="'+i+'" '+(c.owned?"checked":"")+'> '+esc(s.name)+' <span class="badge">'+(c.master?"Master":"所持")+'</span></label>'}).join("");
  $("#reviewResults").innerHTML='<h3>チェックリスト認識結果</h3><p><b>'+r.cells.filter(x=>x.owned).length+' / '+r.cells.length+'</b> 所持　・　<b>'+r.cells.filter(x=>x.master).length+' / '+r.cells.length+'</b> Master</p><p>この画像は「Chapter 7 Season 4・101件」の配置として解析しています。チェックが付いた項目だけ反映します。</p><div class="detect-list">'+rows+'</div><button id="applyChecklist">認識結果を反映</button>';
  $("#applyChecklist").onclick=()=>{let n=0,m=0;document.querySelectorAll(".detected:checked").forEach(el=>{const i=Number(el.dataset.index),s=season4[i],c=r.cells[i];if(!s||!c)return;const x=item(s.id);if(!x.manual){x.owned=true;x.master=!!c.master;x.manual=true;n++;if(c.master)m++}});save();$("#ocrStatus").textContent=n+"件を反映しました（Master "+m+"件）。";alert(n+"件を反映しました。\\nMaster "+m+"件");};
}
$("#recognize").onclick=async()=>{if(!selectedFiles.length)return alert("先に画像を選択してください。");const b=$("#recognize");b.disabled=true;try{const r=await checklistPixelDetect(selectedFiles[0]);recognitionResults=[];renderChecklistReview(r);$("#ocrStatus").textContent="チェックリストを解析しました。候補を確認してください。"}catch(e){console.error(e);alert("画像を解析できませんでした。")}finally{b.disabled=false;b.textContent="画像からSpriteを認識"}};
$("#export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="sprite-check-backup.json";a.click()};
$("#restore").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=JSON.parse(r.result);save();alert("復元しました")}catch{alert("バックアップ形式が正しくありません")}};r.readAsText(f)};
$("#reset").onclick=()=>{if(confirm("この端末のSprite Checkデータをリセットしますか？")){state={};save()}};
$("#sync").onclick=async()=>{const b=$("#sync");b.disabled=true;b.textContent="更新中…";setSyncStatus(null);const info=await syncSprites(true);setSyncStatus(info);b.disabled=false;b.textContent="Spriteデータ更新";alert(info.ok?"Spriteデータを更新しました。\n"+info.count+"件を読み込みました。":"更新できませんでした。")};
if(localStorage.getItem("sprite-theme")==="dark")document.body.classList.add("dark");
$("#lang").textContent=lang==="ja"?"EN":"JP";render();setSyncStatus(null);
syncSprites(true).then(setSyncStatus);
setInterval(()=>syncSprites(true).then(setSyncStatus),REFRESH_MS);
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});