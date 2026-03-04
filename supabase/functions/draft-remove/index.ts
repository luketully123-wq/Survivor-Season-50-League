import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertAdmin } from "../_shared/admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const body = await req.json().catch(() => ({}));
  const { joinCode, adminCode, playerId, castMemberId } = body;

  try { assertAdmin(adminCode); } catch (e: any) { return json({ error: e.message }, e.status || 403); }
  if (!joinCode || !playerId || !castMemberId) return json({ error: "Missing fields" }, 400);

  const { data: league, error: leagueErr } = await admin.from("leagues").select("id").eq("join_code", joinCode).single();
  if (leagueErr || !league) return json({ error: "Invalid join code" }, 401);

  const { error: delErr } = await admin
    .from("draft_picks")
    .delete()
    .eq("league_id", league.id)
    .eq("player_id", playerId)
    .eq("cast_member_id", castMemberId);

  if (delErr) return json({ error: delErr.message }, 400);
  return json({ ok: true });
});
