import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE = "https://raw.githubusercontent.com/valincius/fn-sprites/main/src/sprites.json";
const UPDATES = "https://spritechecklist.org/whats-new/";

const variantNames: Record<string,string> = {
  base:"Normal", normal:"Normal", gold:"Gold", candy:"Gummy", gummy:"Gummy",
  galaxy:"Galaxy", gem:"Gem", holofoil:"Holofoil", cube:"Cube", quack:"Quack",
  cheatmaster:"Cheat Master", loothacker:"Loot Hacker", bountyhunter:"Bounty Hunter"
};

type RemoteRow = Record<string, unknown>;
type Canonical = {
  source_key:string; external_id:string; parent:string; variant:string; name:string;
  season:string; image_url:string; release_date:string|null;
  status:"released"|"upcoming"|"unconfirmed"; rarity:string;
  is_new:boolean; source_url:string; source_name:string; metadata:Record<string,unknown>;
};

function normalizeStatus(v:unknown):"released"|"upcoming"|"unconfirmed" {
  const s=String(v??"").toLowerCase();
  if(s.includes("upcoming")||s.includes("future")||s.includes("soon")) return "upcoming";
  if(s.includes("release")||s==="live"||s==="released") return "released";
  return "released";
}

function parse(rows:RemoteRow[]):Canonical[] {
  const out:Canonical[]=[];
  for(const x of rows){
    if(!x || !x.parent || !x.url) continue;
    const external=String(x.spriteId??x.id??"");
    const variant=String(x.variant??"base");
    if(!external) continue;
    const source_key=`fn:${external}:${variant}`;
    const name=`${String(x.parent)} · ${variantNames[variant]??variant}`;
    const rawDate=String(x.releaseDate??x.release_date??"").trim();
    out.push({
      source_key, external_id:external, parent:String(x.parent), variant, name,
      season:String(x.season??""),
      image_url:String(x.url),
      release_date:/^\d{4}-\d{2}-\d{2}$/.test(rawDate)?rawDate:null,
      status:normalizeStatus(x.status??x.state),
      rarity:String(x.rarity??""),
      is_new:false,
      source_url:SOURCE,
      source_name:"FN Sprite catalog",
      metadata:x
    });
  }
  return out;
}

async function fetchCatalog():Promise<Canonical[]>{
  const res=await fetch(SOURCE+"?t="+Date.now(),{cache:"no-store"});
  if(!res.ok) throw new Error("Sprite source HTTP "+res.status);
  const rows=await res.json();
  if(!Array.isArray(rows)) throw new Error("Sprite source is not an array");
  return parse(rows as RemoteRow[]);
}

export async function runSpriteSync(
  supabaseAdmin:any,
  runType:"scheduled"|"manual",
  actorId:string|null
){
  const started=await supabaseAdmin.from("sprite_sync_runs")
    .insert({run_type:runType,triggered_by:actorId,status:"running"})
    .select("id").single();
  if(started.error) throw started.error;
  const runId=started.data.id;
  try{
    const incoming=await fetchCatalog();
    const {data:existing,error:readError}=await supabaseAdmin
      .from("sprites").select("source_key,updated_at,is_new");
    if(readError) throw readError;

    const existingMap=new Map((existing??[]).map((x:any)=>[x.source_key,x]));
    const newRows:Canonical[]=[];
    const updates:Canonical[]=[];
    let unchanged=0;

    for(const row of incoming){
      const old=existingMap.get(row.source_key);
      if(!old){
        row.is_new=true;
        newRows.push(row);
      }else{
        updates.push(row);
        unchanged++;
      }
    }

    if(newRows.length){
      const ins=await supabaseAdmin.from("sprites").insert(newRows);
      if(ins.error) throw ins.error;
    }

    for(const row of updates){
      const upd=await supabaseAdmin.from("sprites").update({
        external_id:row.external_id,parent:row.parent,variant:row.variant,name:row.name,
        season:row.season,image_url:row.image_url,release_date:row.release_date,
        status:row.status,rarity:row.rarity,source_url:row.source_url,
        source_name:row.source_name,metadata:row.metadata,updated_at:new Date().toISOString()
      }).eq("source_key",row.source_key);
      if(upd.error) throw upd.error;
    }

    if(newRows.length){
      const adminProfile=await supabaseAdmin.from("profiles")
        .select("id").eq("role","superadmin").limit(1).maybeSingle();
      if(adminProfile.data?.id){
        const announcements=newRows.map(x=>({
          author_id:adminProfile.data.id,
          title:"🆕 新しいSpriteが追加されました",
          title_en:"🆕 A new Sprite was added",
          body:`${x.name} がSprite Checkに追加されました。`,
          body_en:`${x.name} has been added to Sprite Check.`,
          image_url:x.image_url,
          source_url:x.source_url,
          source_name:x.source_name,
          kind:"sprite_auto",
          sprite_id:x.source_key
        }));
        const ar=await supabaseAdmin.from("announcements").insert(announcements);
        if(ar.error) throw ar.error;

        const users=await supabaseAdmin.from("profiles").select("id");
        if(!users.error && users.data?.length){
          const ns=users.data.map((u:any)=>({
            user_id:u.id,
            title:"🆕 新しいSpriteが追加されました",
            title_en:"🆕 A new Sprite was added",
            body:`${xNameList(newRows)}`,
            body_en:`${xNameList(newRows)}`
          }));
          await supabaseAdmin.from("notifications").insert(ns);
        }
      }
    }

    await supabaseAdmin.from("sprite_sync_runs").update({
      finished_at:new Date().toISOString(),status:"success",
      new_count:newRows.length,updated_count:updates.length,
      unchanged_count:unchanged,details:{source:SOURCE,updates_source:UPDATES}
    }).eq("id",runId);

    return {ok:true,run_id:runId,new_count:newRows.length,updated_count:updates.length,unchanged_count:unchanged,total:incoming.length};
  }catch(error){
    await supabaseAdmin.from("sprite_sync_runs").update({
      finished_at:new Date().toISOString(),status:"failed",
      error_text:error instanceof Error?error.message:String(error)
    }).eq("id",runId);
    throw error;
  }
}

function xNameList(rows:Canonical[]){
  return rows.map(x=>x.name).join(", ");
}

export function adminClient(){
  const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  const key=keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key) throw new Error("Supabase secret key is not configured");
  return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false}});
}