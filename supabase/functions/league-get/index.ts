import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Handle browser preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const { joinCode } = await req.json().catch(() => ({}));
  if (!joinCode || typeof joinCode !== "string") return json({ error: "joinCode is required" }, 400);

  const { data: league, error: leagueErr } = await admin
    .from("leagues")
    .select("id,name,join_code")
    .eq("join_code", joinCode)
    .single();

  if (leagueErr || !league) return json({ error: "Invalid join code" }, 401);

  const leagueId = league.id;

  const [playersRes, castRes, draftRes, rulesRes, outcomesRes] = await Promise.all([
    admin.from("players").select("id,name,team_name").eq("league_id", leagueId).order("created_at"),
    admin.from("cast_members").select("id,name,headshot_url").eq("league_id", leagueId).order("created_at"),
    admin.from("draft_picks").select("id,player_id,cast_member_id").eq("league_id", leagueId),
    admin.from("scoring_rules").select("category_key,label,points").eq("league_id", leagueId),
    admin.from("cast_weekly_outcomes")
      .select("week_number,cast_member_id,immunity_wins,reward_wins,idol_found,idol_played,power_found,power_played")
      .eq("league_id", leagueId),
  ]);

  for (const r of [playersRes, castRes, draftRes, rulesRes, outcomesRes]) {
    if (r.error) return json({ error: r.error.message }, 500);
  }

  return json({
    league,
    players: playersRes.data,
    cast: castRes.data,
    draft: draftRes.data,
    scoringRules: rulesRes.data,
    outcomes: outcomesRes.data,
  });
});