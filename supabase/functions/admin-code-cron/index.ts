import { withSupabase } from "npm:@supabase/server@1";
import { createClient } from "npm:@supabase/supabase-js@2";

async function sha256(value:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function code(){
  const b=new Uint8Array(8);crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function adminClient(){
  const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  const key=keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("Supabase secret key is not configured");
  return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false}});
}
async function run(){
  const admin=adminClient(),plain=code(),hash=await sha256(plain),start=new Date(),end=new Date(start.getTime()+7*86400000);
  await admin.from("admin_registration_codes").update({revoked_at:start.toISOString()}).is("revoked_at",null);
  const ins=await admin.from("admin_registration_codes").insert({code_hash:hash,valid_from:start.toISOString(),valid_until:end.toISOString()});
  if(ins.error)throw ins.error;
  const apiKey=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("EMAIL_FROM");
  if(!apiKey||!from)throw new Error("RESEND_API_KEY/EMAIL_FROM is not configured");
  const mail=await fetch("https://api.resend.com/emails",{method:"POST",
    headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:"mylife.reading6666@gmail.com",
      subject:"Sprite Check — New Weekly Admin Registration Code",
      text:`今週の一般管理者登録コード: ${plain}\n有効期限: ${end.toISOString()}`})});
  if(!mail.ok)throw new Error("Email delivery failed");
  return {ok:true};
}
export default {
  fetch: withSupabase({auth:"secret"}, async (req)=>{
    if(req.method!=="POST")return Response.json({error:"POST required"},{status:405});
    try{return Response.json(await run())}catch(e){return Response.json({error:e instanceof Error?e.message:String(e)},{status:500})}
  })
};