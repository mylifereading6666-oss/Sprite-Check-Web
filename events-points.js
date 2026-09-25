/* Sprite Check: point-entry events */
(function(){
  const q=s=>document.querySelector(s);
  const tx=(ja,en)=>typeof t==="function"?t(ja,en):ja;
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const iso=v=>v?new Date(v).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"-";

  function ensureUserEvents(){
    const social=q("#socialPage");
    if(!social||q("#eventsPanel"))return;
    const sec=document.createElement("section");sec.className="panel";sec.id="eventsPanel";
    sec.innerHTML='<h2>🎟️ ポイントイベント</h2><p>最上位管理者が開催するイベントです。参加申請時に必要ポイントが消費されます。</p><div id="eventList" class="list"></div>';
    social.appendChild(sec);
  }

  function eventState(e){
    const now=Date.now(),a=new Date(e.application_start_at).getTime(),b=new Date(e.application_end_at).getTime(),s=new Date(e.event_start_at).getTime();
    if(now<a)return tx("申請開始前","Applications not open");
    if(now<=b)return tx("申請受付中","Applications open");
    if(now<s)return tx("申請終了・開催待ち","Waiting for event");
    if(e.event_end_at&&now<=new Date(e.event_end_at).getTime())return tx("開催中","Event live");
    return tx("終了","Ended");
  }

  async function loadEvents(){
    ensureUserEvents();
    const list=q("#eventList");if(!list||typeof sb==="undefined"||!sb)return;
    const r=await sb.from("events").select("id,name,description,application_start_at,application_end_at,event_start_at,event_end_at,required_points,created_at").order("event_start_at",{ascending:true});
    if(r.error){list.innerHTML='<div class="list-item">'+esc(r.error.message)+'</div>';return}
    const rows=r.data||[];
    if(!rows.length){list.innerHTML='<div class="list-item"><small>'+tx("現在イベントはありません。","No events currently.")+'</small></div>';return}
    const parts=rows.map(e=>{
      const open=Date.now()>=new Date(e.application_start_at).getTime()&&Date.now()<=new Date(e.application_end_at).getTime();
      return '<div class="list-item"><b>🎟️ '+esc(e.name)+'</b><small>'+esc(e.description||"")+'</small><small>'+tx("申請期間: ","Application: ")+iso(e.application_start_at)+' ～ '+iso(e.application_end_at)+'</small><small>'+tx("開催: ","Event: ")+iso(e.event_start_at)+(e.event_end_at?' ～ '+iso(e.event_end_at):"")+' · '+tx("必要ポイント: ","Entry: ")+e.required_points+'pt · '+eventState(e)+'</small><div class="row"><button data-event-apply="'+esc(e.id)+'" '+(open?"":"disabled")+'>'+tx("参加申請","Apply")+'</button></div></div>';
    });
    list.innerHTML=parts.join("");
    list.querySelectorAll("[data-event-apply]").forEach(b=>b.onclick=()=>applyEvent(b.dataset.eventApply,b));
  }

  async function applyEvent(id,b){
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session){alert(tx("先にログインしてください。","Please sign in first."));return}
    b.disabled=true;
    try{
      const r=await sb.rpc("apply_event",{p_event_id:id});
      if(r.error)throw r.error;
      const d=r.data||{};
      if(!d.ok){
        if(d.reason==="already_applied")alert(tx("このイベントにはすでに参加申請済みです。","You already applied."));
        else if(d.reason==="insufficient_points")alert(tx("ポイントが足りません。必要: ","Not enough points. Required: ")+(d.required_points||0)+"pt");
        else if(d.reason==="application_closed")alert(tx("現在は参加申請期間外です。","Applications are closed."));
        else alert(tx("参加申請できませんでした。","Could not apply."));
      }else alert(tx("参加申請しました。"+d.required_points+"ptを消費しました。","Application submitted. "+d.required_points+"pt spent."));
      await loadEvents();
    }catch(e){alert(e.message||String(e));b.disabled=false}
  }

  function ensureAdminEvents(){
    const admin=q("#adminPage");if(!admin||q("#adminEventsPanel"))return;
    const host=q("#adminPanel");if(!host)return;
    const sec=document.createElement("div");sec.className="panel admin-tools";sec.id="adminEventsPanel";
    sec.innerHTML='<h3>🎟️ イベント管理（最上位管理者のみ）</h3><div class="row"><input id="eventName" placeholder="イベント名"><input id="eventPoints" type="number" min="0" placeholder="必要ポイント"></div><div class="row"><input id="eventApplyStart" type="datetime-local"><input id="eventApplyEnd" type="datetime-local"><input id="eventStart" type="datetime-local"><input id="eventEnd" type="datetime-local"></div><textarea id="eventDescription" placeholder="イベント内容" style="width:100%;min-height:90px"></textarea><div class="row"><button id="createPointEvent">イベントを作成</button><span id="eventAdminStatus"></span></div><div id="adminEventList" class="list"></div>';
    host.appendChild(sec);
    q("#createPointEvent").onclick=createEvent;
  }

  async function createEvent(){
    if(typeof profile==="undefined"||profile?.role!=="superadmin")return;
    const name=q("#eventName").value.trim(),description=q("#eventDescription").value.trim();
    const points=Math.max(0,Math.trunc(Number(q("#eventPoints").value||0)));
    const a=q("#eventApplyStart").value,b=q("#eventApplyEnd").value,s=q("#eventStart").value,end=q("#eventEnd").value;
    if(!name||!a||!b||!s){alert(tx("イベント名、申請期間、開催開始日時は必須です。","Name, application period and event start are required."));return}
    const r=await sb.rpc("admin_create_event",{p_name:name,p_description:description,p_application_start_at:new Date(a).toISOString(),p_application_end_at:new Date(b).toISOString(),p_event_start_at:new Date(s).toISOString(),p_event_end_at:end?new Date(end).toISOString():null,p_required_points:points});
    if(r.error){alert(r.error.message);return}
    q("#eventName").value="";q("#eventPoints").value="";q("#eventDescription").value="";
    await loadAdminEvents();await loadEvents();
    alert(tx("イベントを作成しました。","Event created."));
  }

  async function loadAdminEvents(){
    ensureAdminEvents();
    const list=q("#adminEventList");if(!list||typeof profile==="undefined"||profile?.role!=="superadmin")return;
    const r=await sb.from("events").select("id,name,description,application_start_at,application_end_at,event_start_at,event_end_at,required_points").order("event_start_at",{ascending:true});
    if(r.error){list.innerHTML='<div class="list-item">'+esc(r.error.message)+'</div>';return}
    list.innerHTML=(r.data||[]).map(e=>'<div class="list-item"><b>'+esc(e.name)+'</b><small>'+esc(e.description||"")+'</small><small>'+tx("申請: ","Apply: ")+iso(e.application_start_at)+' ～ '+iso(e.application_end_at)+' · '+tx("開催: ","Event: ")+iso(e.event_start_at)+(e.event_end_at?' ～ '+iso(e.event_end_at):"")+' · '+e.required_points+'pt</small><div class="row"><button class="danger" data-event-delete="'+esc(e.id)+'">削除</button><button class="secondary" data-event-participants="'+esc(e.id)+'">参加者数を確認</button></div></div>').join("")||'<div class="list-item"><small>'+tx("イベントなし","No events")+'</small></div>';
    list.querySelectorAll("[data-event-delete]").forEach(b=>b.onclick=async()=>{if(!confirm(tx("このイベントを削除しますか？参加申請も削除されます。","Delete this event and its applications?")))return;const r=await sb.rpc("admin_delete_event",{p_event_id:b.dataset.eventDelete});if(r.error)alert(r.error.message);await loadAdminEvents();await loadEvents()});
    list.querySelectorAll("[data-event-participants]").forEach(b=>b.onclick=async()=>{const r=await sb.from("event_participants").select("user_id",{count:"exact",head:true}).eq("event_id",b.dataset.eventParticipants);alert(tx("参加申請者数: ","Applicants: ")+(r.count??0))});
  }

  function init(){
    ensureUserEvents();
    if(typeof sb!=="undefined"&&sb)loadEvents().catch(()=>{});
    const originalOpen=window.openPage;
    if(typeof originalOpen==="function"){
      window.openPage=function(page){const r=originalOpen.apply(this,arguments);if(page==="social")loadEvents().catch(()=>{});if(page==="admin")setTimeout(loadAdminEvents,100);return r};
    }
    setTimeout(()=>{if(typeof profile!=="undefined"&&profile?.role==="superadmin")loadAdminEvents().catch(()=>{})},1500);
    setInterval(()=>{if(typeof sb!=="undefined"&&sb)loadEvents().catch(()=>{})},60000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();