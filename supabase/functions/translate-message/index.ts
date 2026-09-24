import { withSupabase } from "npm:@supabase/server@1";
import { corsHeaders } from "../_shared/cors.ts";

export default {
  fetch: withSupabase({auth:"user"}, async (req,ctx)=>{
    if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
    if(req.method!=="POST") return Response.json({error:"POST required"},{status:405,headers:corsHeaders});
    const body=await req.json().catch(()=>({}));
    const text=String(body.text??"").trim();
    const target=body.target_language==="en"?"en":"ja";
    const kind=String(body.message_kind??"direct");
    const messageId=String(body.message_id??"");
    if(!text) return Response.json({error:"text required"},{status:400,headers:corsHeaders});

    // Translation provider is deliberately server-side. No provider key is ever
    // shipped to GitHub Pages. Configure TRANSLATION_API_URL/TRANSLATION_API_KEY
    // as Edge Function secrets when a provider is selected.
    const apiUrl=Deno.env.get("TRANSLATION_API_URL");
    const apiKey=Deno.env.get("TRANSLATION_API_KEY");
    if(!apiUrl){
      return Response.json({error:"Translation provider is not configured"},{status:503,headers:corsHeaders});
    }

    const response=await fetch(apiUrl,{
      method:"POST",
      headers:{"Content-Type":"application/json",...(apiKey?{"Authorization":`Bearer ${apiKey}`}:{})},
      body:JSON.stringify({q:text,target_lang:target})
    });
    if(!response.ok) return Response.json({error:"Translation provider failed"},{status:502,headers:corsHeaders});
    const data=await response.json();
    const translated=String(data.translatedText??data.translation??data.text??"");
    if(!translated) return Response.json({error:"Empty translation"},{status:502,headers:corsHeaders});

    const {supabaseAdmin}=ctx;
    if(messageId){
      await supabaseAdmin.from("message_translations").upsert({
        message_kind:kind,message_id:messageId,target_language:target,
        translated_body:translated,provider:new URL(apiUrl).hostname
      },{onConflict:"message_kind,message_id,target_language"});
    }
    return Response.json({translated_body:translated,target_language:target},{headers:corsHeaders});
  })
};