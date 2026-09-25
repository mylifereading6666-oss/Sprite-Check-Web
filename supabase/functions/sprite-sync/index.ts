import { withSupabase } from "npm:@supabase/server@1";
import { corsHeaders } from "../_shared/cors.ts";
import { runSpriteSync } from "../_shared/sprite-sync.ts";

export default {
  fetch: withSupabase({auth:"user"}, async (req,ctx)=>{
    if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
    if(req.method!=="POST") return Response.json({error:"POST required"},{status:405,headers:corsHeaders});
    if(!ctx.userClaims?.sub) return Response.json({error:"Authentication required"},{status:401,headers:corsHeaders});

    const admin=ctx.supabaseAdmin;
    const {data:profile,error}=await admin.from("profiles").select("id,role")
      .eq("id",ctx.userClaims.sub).maybeSingle();
    if(error) return Response.json({error:error.message},{status:500,headers:corsHeaders});
    if(profile?.role!=="superadmin"){
      return Response.json({error:"Superadmin only"},{status:403,headers:corsHeaders});
    }

    try{
      const result=await runSpriteSync(admin,"manual",ctx.userClaims.sub);
      return Response.json(result,{headers:corsHeaders});
    }catch(e){
      return Response.json({error:e instanceof Error?e.message:String(e)},{status:500,headers:corsHeaders});
    }
  })
};