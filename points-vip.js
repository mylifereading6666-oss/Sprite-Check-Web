/* Sprite Check free points + VIP module */
(function(){
  const escP=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const tx=(ja,en)=>typeof t==="function"?t(ja,en):(lang==="ja"?ja:en);
  const q=s=>document.querySelector(s);

  function ensurePointsPanel(){
    const settings=q("#settingsPage");
    if(!settings||q("#pointsPanel"))return;
    const sec=document.createElement("section");
    sec.className="panel";
    sec.id="pointsPanel";
    sec.innerHTML=
      '<h2>🎟️ ポイント・VIP</h2>'+
      '<div class="stats">'+
      '<div class="stat"><span>ポイント</span><b id="pointsBalance">0</b></div>'+
      '<div class="stat"><span>累計獲得</span><b id="pointsEarned">0</b></div>'+
      '<div class="stat"><span>VIP</span><b id="vipState">-</b></div>'+
      '</div>'+
      '<div class="row" style="margin-top:12px"><button id="claimDailyPoints">🎁 今日の無料ポイントを受け取る</button><span id="pointsStatus"></span></div>'+
      '<p>ポイントは失効しません。無料ポイントの獲得履歴とVIP状態はサーバーで管理されます。</p>'+
      '<hr><h3>🎡 ポイントルーレット</h3>'+
      '<p>1回10ポイント。通常は1日1回、VIPは1日3回まで利用できます。景品はSprite Check内のポイント報酬です。</p>'+
      '<div class="row"><button id="spinPointRoulette">🎡 ルーレットを回す</button><span id="rouletteStatus"></span></div>'+
      '<div id="rouletteResult" class="list"></div>';
    settings.appendChild(sec);
  }

  async function loadPoints(){
    ensurePointsPanel();
    if(!q("#pointsPanel"))return;
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session){
      q("#pointsStatus").textContent=tx("ログインすると利用できます。","Sign in to use points.");
      return;
    }
    const [p,v]=await Promise.all([
      sb.from("user_points").select("balance,total_earned,total_spent").eq("user_id",session.user.id).maybeSingle(),
      sb.from("vip_memberships").select("active,starts_at,expires_at").eq("user_id",session.user.id).maybeSingle()
    ]);
    if(p.error){q("#pointsStatus").textContent=p.error.message;return}
    const row=p.data||{balance:0,total_earned:0,total_spent:0};
    q("#pointsBalance").textContent=row.balance||0;
    q("#pointsEarned").textContent=row.total_earned||0;
    const vip=v.data;
    const active=!!(vip?.active&&vip.expires_at&&new Date(vip.expires_at)>new Date());
    q("#vipState").textContent=active
      ? "VIP · "+new Date(vip.expires_at).toLocaleDateString("ja-JP")
      : tx("通常","Standard");
  }

  async function claimDaily(){
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session){
      alert(tx("先にログインしてください。","Please sign in first."));return;
    }
    const b=q("#claimDailyPoints");if(b)b.disabled=true;
    try{
      const r=await sb.rpc("claim_daily_points");
      if(r.error)throw r.error;
      if(r.data?.ok){
        alert(tx("今日の無料ポイント "+r.data.amount+"pt を受け取りました。","You received "+r.data.amount+" free points today."));
      }else if(r.data?.reason==="already_claimed"){
        alert(tx("今日はすでに受け取っています。","You already claimed today's points."));
      }
      await loadPoints();
    }catch(e){alert(e.message||String(e))}
    finally{if(b)b.disabled=false}
  }


  async function spinRoulette(){
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session){
      alert(tx("先にログインしてください。","Please sign in first."));return;
    }
    const b=q("#spinPointRoulette");if(b)b.disabled=true;
    q("#rouletteStatus").textContent=tx("抽選中…","Spinning…");
    try{
      const r=await sb.rpc("spin_point_roulette");
      if(r.error)throw r.error;
      const d=r.data||{};
      if(!d.ok){
        if(d.reason==="daily_limit") alert(tx("今日はこれ以上ルーレットを利用できません。","You have reached today's roulette limit."));
        else if(d.reason==="insufficient_points") alert(tx("ポイントが足りません。10ポイント必要です。","You need 10 points."));
        q("#rouletteStatus").textContent="";
        return;
      }
      q("#rouletteResult").innerHTML='<div class="list-item"><b>🎉 '+escP(d.reward_label)+'</b><small>'+tx("今回の消費: ","Cost: ")+d.cost+'pt · '+tx("現在の残高: ","Balance: ")+d.balance+'pt · '+tx("本日の利用: ","Today: ")+d.used+'/'+d.daily_limit+'</small></div>';
      q("#rouletteStatus").textContent=tx("抽選完了","Spin complete");
      await loadPoints();
    }catch(e){
      q("#rouletteStatus").textContent="";
      alert(e.message||String(e));
    }finally{if(b)b.disabled=false}
  }
  async function addAdminControls(){
    if(typeof profile==="undefined"||profile?.role!=="superadmin")return;
    const list=q("#userList");if(!list)return;
    list.querySelectorAll("[data-user-final]").forEach(button=>{
      const userId=button.dataset.userFinal;
      const parent=button.closest(".list-item");
      if(!parent||parent.querySelector("[data-points-admin]"))return;
      const row=document.createElement("div");row.className="row";
      row.innerHTML=
        '<button data-points-admin="grant" data-target="'+escP(userId)+'">🎟️ ポイント調整</button>'+
        '<button data-points-admin="vip" data-target="'+escP(userId)+'" class="secondary">⭐ VIP設定</button>';
      parent.appendChild(row);
    });
    list.querySelectorAll("[data-points-admin]").forEach(b=>{
      if(b.dataset.bound)return;b.dataset.bound="1";
      b.onclick=async()=>{
        const uid=b.dataset.target;
        if(b.dataset.pointsAdmin==="grant"){
          const amount=Number(prompt(tx("付与は正数、減算は負数で入力してください。","Use a positive number to grant or a negative number to subtract."),"100"));
          if(!Number.isFinite(amount)||amount===0)return;
          const reason=prompt(tx("理由を入力してください。","Enter a reason."),tx("管理者によるポイント調整","Admin point adjustment"));
          if(reason===null)return;
          const r=await sb.rpc("admin_grant_points",{p_user_id:uid,p_amount:Math.trunc(amount),p_reason:reason});
          if(r.error)alert(r.error.message);else{alert(tx("ポイントを更新しました。","Points updated."));loadPoints()}
        }else{
          const days=Number(prompt(tx("VIPを何日間付与しますか？ 0で解除します。","How many days of VIP? Enter 0 to remove."),"30"));
          if(!Number.isInteger(days)||days<0)return;
          const r=await sb.rpc("admin_set_vip",{p_user_id:uid,p_days:days});
          if(r.error)alert(r.error.message);else alert(days?tx("VIPを設定しました。","VIP was set."):tx("VIPを解除しました。","VIP was removed."));
        }
      };
    });
  }

  function init(){
    ensurePointsPanel();
    q("#claimDailyPoints")?.addEventListener("click",claimDaily);
    q("#spinPointRoulette")?.addEventListener("click",spinRoulette);
    loadPoints().catch(()=>{});
    const observer=new MutationObserver(()=>addAdminControls());
    const list=q("#userList");if(list)observer.observe(list,{childList:true,subtree:true});
    setTimeout(addAdminControls,2000);
    setInterval(()=>loadPoints().catch(()=>{}),60000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();