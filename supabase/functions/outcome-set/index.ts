import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertAdmin } from "../_shared/admin.ts";
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

  const body = await req.json().catch(() => ({}));
  const {
    joinCode,
    adminCode,
    weekNumber,
    castMemberId,
    immunityWins,
    rewardWins,
    idolFound,
    idolPlayed,
    powerFound,
    powerPlayed,
  } = body;

  try {
    assertAdmin(adminCode);
  } catch (e: any) {
    return json({ error: e.message }, e.status || 403);
  }

  if (!joinCode || !weekNumber || !castMemberId) return json({ error: "Missing fields" }, 400);

  const { data: league, error: leagueErr } = await admin
    .from("leagues")
    .select("id")
    .eq("join_code", joinCode)
    .single();

  if (leagueErr || !league) return json({ error: "Invalid join code" }, 401);

  const payload = {
    league_id: league.id,
    week_number: Number(weekNumber),
    cast_member_id: String(castMemberId),
    immunity_wins: Math.max(0, Number(immunityWins) || 0),
    reward_wins: Math.max(0, Number(rewardWins) || 0),
    idol_found: Math.max(0, Number(idolFound) || 0),
    idol_played: Math.max(0, Number(idolPlayed) || 0),
    power_found: Math.max(0, Number(powerFound) || 0),
    power_played: Math.max(0, Number(powerPlayed) || 0),
  };

  const { error: upErr } = await admin
    .from("cast_weekly_outcomes")
    .upsert(payload, { onConflict: "league_id,week_number,cast_member_id" });

  if (upErr) return json({ error: upErr.message }, 400);

  return json({ ok: true });
});