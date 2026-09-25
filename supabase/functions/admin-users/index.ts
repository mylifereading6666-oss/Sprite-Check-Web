import { withSupabase } from "npm:@supabase/server@1";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const users=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(users.error)return Response.json({error:users.error.message},{status:500,headers:corsHeaders});
    const profiles=await admin.from("profiles").select("id,display_name,role,created_at");
    const susp=await admin.from("account_suspensions").select("user_id,suspended,reason");
    const pmap=new Map((profiles.data||[]).map((x:any)=>[x.id,x]));
    const smap=new Map((susp.data||[]).map((x:any)=>[x.user_id,x]));
    const out=(users.data.users||[]).map((u:any)=>{
      const p=pmap.get(u.id)||{};
      const s=smap.get(u.id)||{};
      return {id:u.id,email:u.email||"",display_name:p.display_name||"",role:p.role||"user",created_at:u.created_at,suspended:!!s.suspended,suspension_reason:s.reason||""};
    });
    return Response.json({users:out},{headers:corsHeaders});
  })
};