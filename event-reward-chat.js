/* Sprite Check: event reward chat */
(function(){
  const q=s=>document.querySelector(s);
  const tx=(ja,en)=>typeof t==="function"?t(ja,en):ja;
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let currentChat=null;

  function ensurePanel(){
    const social=q("#socialPage");if(!social||q("#eventRewardChatPanel"))return;
    const sec=document.createElement("section");sec.className="panel";sec.id="eventRewardChatPanel";
    sec.innerHTML='<h2>🏆 イベント景品チャット</h2><p>'+tx("イベントで景品を獲得したユーザーと最上位管理者が、この専用チャットで連絡できます。","Winners and the superadmin can communicate in this private event reward chat.")+'</p><select id="eventRewardChatSelect"></select><div id="eventRewardChatBox" class="chat-box"></div><div class="row"><input id="eventRewardChatMessage" placeholder="メッセージ"><button id="sendEventRewardChat">'+tx("送信","Send")+'</button></div>';
    social.appendChild(sec);
    q("#sendEventRewardChat").onclick=sendMessage;
    q("#eventRewardChatSelect").onchange=()=>openChat(q("#eventRewardChatSelect").value);
  }

  async function loadChats(){
    ensurePanel();
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session)return;
    const sel=q("#eventRewardChatSelect");if(!sel)return;
    const r=await sb.from("event_reward_chats").select("id,event_id,winner_user_id,created_at,closed_at,events(name)").order("created_at",{ascending:false});
    if(r.error){sel.innerHTML="";return}
    const rows=r.data||[];
    const mine=rows.filter(x=>x.winner_user_id===session.user.id);
    const usable=profile?.role==="superadmin"?rows:mine;
    sel.innerHTML='<option value="">'+tx("チャットを選択","Select chat")+'</option>'+usable.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.events?.name||"Event")+" · "+(c.winner_user_id===session.user.id?tx("自分","You"):tx("当選者","Winner"))+'</option>').join("");
    if(currentChat&&usable.some(x=>x.id===currentChat))openChat(currentChat);
  }

  async function openChat(id){
    currentChat=id||null;const box=q("#eventRewardChatBox");if(!box)return;
    if(!id){box.innerHTML="";return}
    const r=await sb.from("event_reward_messages").select("id,sender_user_id,body,created_at").eq("chat_id",id).order("created_at",{ascending:true});
    if(r.error){box.innerHTML='<div class="list-item">'+esc(r.error.message)+'</div>';return}
    box.innerHTML=(r.data||[]).map(m=>'<div class="list-item"><b>'+(m.sender_user_id===session.user.id?tx("あなた","You"):tx("管理者","Superadmin"))+'</b><small>'+esc(m.body)+'</small><small>'+new Date(m.created_at).toLocaleString()+'</small></div>').join("")||'<small>'+tx("まだメッセージはありません。","No messages yet.")+'</small>';
    box.scrollTop=box.scrollHeight;
  }

  async function sendMessage(){
    if(!currentChat)return;
    const input=q("#eventRewardChatMessage"),body=input?.value.trim();if(!body)return;
    const r=await sb.from("event_reward_messages").insert({chat_id:currentChat,sender_user_id:session.user.id,body});
    if(r.error){alert(r.error.message);return}
    input.value="";await openChat(currentChat);
  }

  function ensureAdminPanel(){
    if(typeof profile==="undefined"||profile?.role!=="superadmin")return;
    const admin=q("#adminPanel");if(!admin||q("#eventWinnerChatAdmin"))return;
    const sec=document.createElement("div");sec.className="panel admin-tools";sec.id="eventWinnerChatAdmin";
    sec.innerHTML='<h3>🏆 イベント当選者チャット管理</h3><div class="row"><input id="winnerEventId" placeholder="イベントID"><input id="winnerUserId" placeholder="当選者ユーザーID"><button id="createWinnerChat">当選者チャットを作成</button></div><div id="winnerChatHint"></div>';
    admin.appendChild(sec);
    q("#createWinnerChat").onclick=async()=>{
      const eventId=q("#winnerEventId").value.trim(),userId=q("#winnerUserId").value.trim();
      if(!eventId||!userId)return;
      const r=await sb.rpc("create_event_reward_chat",{p_event_id:eventId,p_winner_user_id:userId});
      if(r.error){alert(r.error.message);return}
      alert(tx("当選者チャットを作成しました。","Winner chat created."));
      await loadChats();
    };
  }

  window.loadEventRewardChats=loadChats;

  function init(){
    ensurePanel();
    ensureAdminPanel();
    setTimeout(()=>{ensureAdminPanel();loadChats().catch(()=>{})},1200);
    setInterval(()=>loadChats().catch(()=>{}),10000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();