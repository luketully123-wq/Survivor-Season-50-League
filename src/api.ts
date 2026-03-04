import { supabase } from './supabaseClient'

export type LeaguePayload = {
  league: { id: string; name: string; join_code: string }
  players: Array<{ id: string; name: string; team_name: string }>
  cast: Array<{ id: string; name: string; headshot_url: string | null }>
  draft: Array<{ id: string; player_id: string; cast_member_id: string }>
  scoringRules: Array<{ category_key: string; label: string; points: number }>
  outcomes: Array<{
    week_number: number
    cast_member_id: string
    immunity_wins: number
    reward_wins: number
    idol_found: number
    idol_played: number
    power_found: number
    power_played: number
  }>
}

export async function fetchLeagueByJoinCode(joinCode: string): Promise<LeaguePayload> {
  const { data, error } = await supabase.functions.invoke('league-get', { body: { joinCode } })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as LeaguePayload
}

export async function setDraftPick(params: { joinCode: string; adminCode: string; playerId: string; castMemberId: string }) {
  const { data, error } = await supabase.functions.invoke('draft-set', { body: params })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as { ok: boolean }
}

export async function removeDraftPick(params: { joinCode: string; adminCode: string; playerId: string; castMemberId: string }) {
  const { data, error } = await supabase.functions.invoke('draft-remove', { body: params })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as { ok: boolean }
}

export async function upsertOutcomes(params: {
  joinCode: string; adminCode: string; weekNumber: number; castMemberId: string;
  immunityWins: number; rewardWins: number; idolFound: number; idolPlayed: number; powerFound: number; powerPlayed: number;
}) {
  const { data, error } = await supabase.functions.invoke('outcome-set', { body: params })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as { ok: boolean }
}
