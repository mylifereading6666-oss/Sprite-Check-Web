import { withSupabase } from "npm:@supabase/server@1";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randomCode(){
  const bytes=new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function adminClient(){
  const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  const key=keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("Supabase secret key is not configured");
  return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false}});
}

export default {
  fetch: withSupabase({auth:"user"}, async (req,ctx)=>{
    if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
    if(req.method!=="POST")return Response.json({error:"POST required"},{status:405,headers:corsHeaders});
    const admin=adminClient();
    const me=await admin.from("profiles").select("id,role").eq("id",ctx.userClaims?.sub).maybeSingle();
    if(me.data?.role!=="superadmin")return Response.json({error:"Superadmin only"},{status:403,headers:corsHeaders});
    const body=await req.json().catch(()=>({}));
    if(body.action!=="generate-and-send")return Response.json({error:"Unsupported action"},{status:400,headers:corsHeaders});

    const code=randomCode();
    const hash=await sha256(code);
    const start=new Date();
    const end=new Date(start.getTime()+7*24*60*60*1000);
    await admin.from("admin_registration_codes").update({revoked_at:new Date().toISOString()}).is("revoked_at",null).lt("valid_until",end.toISOString());
    const ins=await admin.from("admin_registration_codes").insert({code_hash:hash,valid_from:start.toISOString(),valid_until:end.toISOString()});
    if(ins.error)return Response.json({error:ins.error.message},{status:500,headers:corsHeaders});

    const apiKey=Deno.env.get("RESEND_API_KEY");
    const from=Deno.env.get("EMAIL_FROM");
    const to="mylife.reading6666@gmail.com";
    if(!apiKey||!from){
      return Response.json({error:"Admin code created, but RESEND_API_KEY/EMAIL_FROM is not configured for email delivery."},{status:503,headers:corsHeaders});
    }
    const mail=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        from,to,
        subject:"Sprite Check — Weekly Admin Registration Code",
        text:`今週のSprite Check一般管理者登録コードは: ${code}\n\n有効期限: ${end.toISOString()}\n\nこのコードは既存管理者の権限には影響しません。`
      })
    });
    if(!mail.ok)return Response.json({error:"Code generated but email delivery failed."},{status:502,headers:corsHeaders});
    return Response.json({ok:true},{headers:corsHeaders});
  })
};