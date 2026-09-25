/* Sprite Check: realtime chat refresh */
(function(){
  let channels=[];
  function cleanup(){channels.forEach(c=>{try{sb.removeChannel(c)}catch(e){}});channels=[]}
  async function start(){
    if(typeof sb==="undefined"||!sb||typeof session==="undefined"||!session)return;
    cleanup();
    const refreshExchange=()=>{if(typeof renderExchangeChatFinal==="function")renderExchangeChatFinal();else if(typeof renderSocial==="function")renderSocial()};
    const refreshInquiry=()=>{if(typeof renderInquiryChatFinal==="function")renderInquiryChatFinal();else if(typeof renderSocial==="function")renderSocial()};
    const refreshReward=()=>{if(typeof window.loadEventRewardChats==="function")window.loadEventRewardChats()};
    channels.push(sb.channel("sprite-check-realtime-exchange-"+session.user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"exchange_chat_messages"},refreshExchange).subscribe());
    channels.push(sb.channel("sprite-check-realtime-inquiry-"+session.user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"inquiry_messages"},refreshInquiry).subscribe());
    channels.push(sb.channel("sprite-check-realtime-reward-"+session.user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"event_reward_messages"},refreshReward).subscribe());
  }
  function boot(){
    start().catch(()=>{});
    setInterval(()=>{if(typeof session!=="undefined"&&session)start().catch(()=>{})},30000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();