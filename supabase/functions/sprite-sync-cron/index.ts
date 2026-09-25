import { withSupabase } from "npm:@supabase/server@1";
import { corsHeaders } from "../_shared/cors.ts";
import { runSpriteSync } from "../_shared/sprite-sync.ts";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export default {
  fetch: withSupabase({auth:"secret"}, async (req,ctx)=>{
    if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
    if(req.method!=="POST") return Response.json({error:"POST required"},{status:405,headers:corsHeaders});
    try{
      const admin=ctx.supabaseAdmin;
      const body=await req.json().catch(()=>({}));
      const result=await runSpriteSync(admin,"scheduled",null);
      return Response.json({...result,slot:body.slot??null},{headers:corsHeaders});
    }catch(e){
      return Response.json({error:errorMessage(e)},{status:500,headers:corsHeaders});
    }
  })
};