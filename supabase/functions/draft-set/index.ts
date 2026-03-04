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
  const { joinCode, adminCode, playerId, castMemberId } = body;

  try {
    assertAdmin(adminCode);
  } catch (e: any) {
    return json({ error: e.message }, e.status || 403);
  }

  if (!joinCode || !playerId || !castMemberId) {
    return json({ error: "Missing fields" }, 400);
  }

  const { data: league, error: leagueErr } = await admin
    .from("leagues")
    .select("id")
    .eq("join_code", joinCode)
    .single();

  if (leagueErr || !league) return json({ error: "Invalid join code" }, 401);

  const { count, error: countErr } = await admin
    .from("draft_picks")
    .select("*", { count: "exact", head: true })
    .eq("league_id", league.id)
    .eq("player_id", playerId);

  if (countErr) return json({ error: countErr.message }, 500);

  if ((count || 0) >= 3) {
    return json({ error: "Player already has 3 picks" }, 400);
  }

  const { error: insErr } = await admin.from("draft_picks").insert({
    league_id: league.id,
    player_id: playerId,
    cast_member_id: castMemberId,
  });

  if (insErr) return json({ error: insErr.message }, 400);

  return json({ ok: true });
});
