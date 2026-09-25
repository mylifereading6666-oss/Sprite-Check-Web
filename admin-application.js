/* Sprite Check: admin application page */
(function(){
  const q=s=>document.querySelector(s);
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const tx=(ja,en)=>typeof t==="function"?t(ja,en):ja;

  function ensurePage(){
    const menu=q("#sideMenu"),app=q(".app");if(!app||q("#adminApplicationPage"))return;
    if(menu&&!menu.querySelector('[data-page="adminApplication"]')){
      const b=document.createElement("button");b.dataset.page="adminApplication";b.textContent="📝 管理者申請";menu.appendChild(b);
      b.onclick=()=>openPage("adminApplication");
    }
    const sec=document.createElement("section");sec.className="page-section";sec.id="adminApplicationPage";
    sec.innerHTML='<section class="panel"><h2>📝 一般管理者への申請</h2><p>'+tx("一般ユーザー・VIPユーザーが管理者として活動したい場合に申請できます。申請しただけでは一般管理者にはなりません。最上位管理者が内容を確認し、別途判断します。","Regular and VIP users can apply to become a general admin. Submitting an application does not grant admin privileges. The superadmin reviews each application separately.")+'</p><div class="row"><textarea id="adminApplicationReason" placeholder="申請理由・自己紹介など" style="width:100%;min-height:120px"></textarea></div><div class="row"><button id="submitAdminApplication">申請する</button><span id="adminApplicationStatus"></span></div><div id="myAdminApplications" class="list"></div></section>';
    app.appendChild(sec);
    q("#submitAdminApplication").onclick=submit;
  }

  async function submit(){
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session){alert(tx("先にログインしてください。","Please sign in first."));return}
    const reason=q("#adminApplicationReason").value.trim();
    const r=await sb.rpc("submit_admin_application",{p_reason:reason});
    if(r.error){alert(r.error.message);return}
    q("#adminApplicationReason").value="";
    q("#adminApplicationStatus").textContent=tx("申請を送信しました。審査結果をお待ちください。","Application submitted. Please wait for review.");
    await loadMine();
  }

  async function loadMine(){
    const list=q("#myAdminApplications");if(!list||typeof sb==="undefined"||!sb||!session)return;
    const r=await sb.from("admin_applications").select("id,reason,status,review_note,created_at,reviewed_at").eq("user_id",session.user.id).order("created_at",{ascending:false});
    if(r.error){list.innerHTML="";return}
    list.innerHTML='<h3>'+tx("自分の申請履歴","My applications")+'</h3>'+
      (r.data||[]).map(x=>'<div class="list-item"><b>'+({pending:"審査中",approved:"承認済み",rejected:"不承認",withdrawn:"取り下げ"}[x.status]||x.status)+'</b><small>'+esc(x.reason)+'</small><small>'+new Date(x.created_at).toLocaleString()+(x.review_note?' · '+esc(x.review_note):"")+'</small></div>').join("")||
      '<small>'+tx("申請履歴はありません。","No applications yet.")+'</small>';
  }

  function ensureSuperadminPanel(){
    if(typeof profile==="undefined"||profile?.role!=="superadmin")return;
    const host=q("#adminPanel");if(!host||q("#adminApplicationsAdmin"))return;
    const sec=document.createElement("div");sec.className="panel admin-tools";sec.id="adminApplicationsAdmin";
    sec.innerHTML='<h3>📝 一般管理者申請の審査</h3><div id="adminApplicationsList" class="list"></div>';
    host.appendChild(sec);
    loadAll();
  }

  async function loadAll(){
    const list=q("#adminApplicationsList");if(!list||typeof sb==="undefined"||!sb)return;
    const r=await sb.from("admin_applications").select("id,user_id,reason,status,review_note,created_at,reviewed_at").order("created_at",{ascending:false});
    if(r.error){list.innerHTML='<div class="list-item">'+esc(r.error.message)+'</div>';return}
    list.innerHTML=(r.data||[]).map(x=>'<div class="list-item"><b>'+esc(x.user_id)+'</b><small>'+esc(x.reason)+'</small><small>'+({pending:"審査中",approved:"承認済み",rejected:"不承認",withdrawn:"取り下げ"}[x.status]||x.status)+' · '+new Date(x.created_at).toLocaleString()+'</small>'+(x.status==="pending"?'<div class="row"><button data-app-review="approved" data-app-id="'+esc(x.id)+'">承認</button><button class="danger" data-app-review="rejected" data-app-id="'+esc(x.id)+'">不承認</button></div>':"")+'</div>').join("")||'<small>申請なし</small>';
    list.querySelectorAll("[data-app-review]").forEach(b=>b.onclick=async()=>{
      const note=prompt(tx("審査メモ（任意）","Review note (optional)"),"");if(note===null)return;
      const r=await sb.rpc("admin_review_application",{p_application_id:b.dataset.appId,p_status:b.dataset.appReview,p_note:note});
      if(r.error)alert(r.error.message);else await loadAll();
    });
  }

  function init(){
    ensurePage();
    setTimeout(()=>{ensureSuperadminPanel();loadMine().catch(()=>{})},1200);
    setInterval(()=>{loadMine().catch(()=>{});if(typeof profile!=="undefined"&&profile?.role==="superadmin")loadAll().catch(()=>{})},15000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();