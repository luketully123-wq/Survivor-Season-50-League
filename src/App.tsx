import React, { useMemo, useState } from 'react'
import {
  fetchLeagueByJoinCode,
  removeDraftPick,
  setDraftPick,
  upsertOutcomes,
  eliminateCastMember,
  type LeaguePayload,
} from './api'
import logoUrl from './assets/survivor50_logo.png'

const LS_JOIN = 's50_join'
const LS_ADMIN = 's50_admin'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}

type OutcomeFormState = {
  immunity_wins: number
  reward_wins: number
  idol_found: number
  idol_played: number
  power_found: number
  power_played: number
}

type CastMember = { id: string; name: string; headshot_url?: string | null }
type Player = { id: string; name: string; team_name: string }
type ScoringRule = { category_key: string; label: string; points: number }

function trendBadge(prevRank?: number | null, currRank?: number | null) {
  if (!prevRank || !currRank) return <span className="hint">—</span>
  const delta = prevRank - currRank // positive = improved
  if (delta > 0) return <span className="success">▲ {delta}</span>
  if (delta < 0) return <span className="error">▼ {Math.abs(delta)}</span>
  return <span className="hint">•</span>
}

function rankMapFromSorted<T extends { id: string }>(sorted: T[]) {
  const m = new Map<string, number>()
  sorted.forEach((x, idx) => m.set(x.id, idx + 1))
  return m
}

export default function App() {
  const [joinCode, setJoinCode] = useState<string>(
    localStorage.getItem(LS_JOIN) || (import.meta.env.VITE_DEFAULT_JOIN_CODE ?? ''),
  )
  const [adminCode, setAdminCode] = useState<string>(localStorage.getItem(LS_ADMIN) || '')
  const [week, setWeek] = useState<number>(1)
  
  const [data, setData] = useState<LeaguePayload | null>(null)
  const [selectedCast, setSelectedCast] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setErr(null)
    setMsg(null)
    setLoading(true)
    try {
      const payload = await fetchLeagueByJoinCode(joinCode.trim())
      setData(payload)
      localStorage.setItem(LS_JOIN, joinCode.trim())
    } catch (e: any) {
      setData(null)
      setErr(e?.message || 'Could not load league. Check join code.')
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    if (!joinCode.trim()) return
    setErr(null)
    setMsg(null)
    try {
      const payload = await fetchLeagueByJoinCode(joinCode.trim())
      setData(payload)
    } catch (e: any) {
      setErr(e?.message || 'Refresh failed.')
    }
  }

  const computed = useMemo(() => {
    if (!data) return null

    const castById = new Map<string, CastMember>(data.cast.map((c: any) => [c.id, c]))
    const players: Player[] = data.players as any
    const cast: CastMember[] = data.cast as any
    const rules: ScoringRule[] = data.scoringRules as any
    const outcomes: any[] = data.outcomes as any[]

    // Draft mappings
    const draftedByPlayer = new Map<string, string[]>()
    players.forEach((p) => draftedByPlayer.set(p.id, []))
    for (const d of data.draft as any[]) {
      draftedByPlayer.set(d.player_id, [...(draftedByPlayer.get(d.player_id) || []), d.cast_member_id])
    }
    const draftedSet = new Set<string>((data.draft as any[]).map((d) => d.cast_member_id))

    // Rule points
    const rulePoints = new Map<string, number>()
    for (const r of rules) rulePoints.set(r.category_key, r.points)

    // Helper: compute points for an outcome row
    function pointsForOutcome(o: any) {
      return (
        (o.immunity_wins || 0) * (rulePoints.get('immunity') || 0) +
        (o.reward_wins || 0) * (rulePoints.get('reward') || 0) +
        (o.idol_found || 0) * (rulePoints.get('idol_found') || 0) +
        (o.idol_played || 0) * (rulePoints.get('idol_played') || 0) +
        (o.power_found || 0) * (rulePoints.get('power_found') || 0) +
        (o.power_played || 0) * (rulePoints.get('power_played') || 0)
      )
    }

    // Outcomes lookup for current week (for inputs)
    const outcomeByCast = new Map<string, any>()
    for (const o of outcomes.filter((x) => x.week_number === week)) {
      outcomeByCast.set(o.cast_member_id, o)
    }

    // Totals helpers: cumulative up to a given week (inclusive)
    function buildCastTotalsUpTo(weekN: number) {
      const castTotals = new Map<string, number>()
      cast.forEach((c) => castTotals.set(c.id, 0))
      for (const o of outcomes) {
        if ((o.week_number || 0) <= weekN) {
          const pts = pointsForOutcome(o)
          castTotals.set(o.cast_member_id, (castTotals.get(o.cast_member_id) || 0) + pts)
        }
      }
      return castTotals
    }

    const castTotalUpToWeek = buildCastTotalsUpTo(week)
    const castTotalUpToPrevWeek = week > 1 ? buildCastTotalsUpTo(week - 1) : new Map<string, number>()

    // Week totals for cast (selected week only)
    const castWeekTotal = new Map<string, number>()
    cast.forEach((c) => castWeekTotal.set(c.id, 0))
    for (const o of outcomes) {
      if (o.week_number === week) {
        const pts = pointsForOutcome(o)
        castWeekTotal.set(o.cast_member_id, (castWeekTotal.get(o.cast_member_id) || 0) + pts)
      }
    }

    // Cast leaderboard (cumulative up to selected week)
    const castScoreboard = [...cast]
      .map((c) => ({
        ...c,
        weekTotal: castWeekTotal.get(c.id) || 0,
        total: castTotalUpToWeek.get(c.id) || 0,
      }))
      .sort((a, b) => (b.total - a.total) || (b.weekTotal - a.weekTotal))

    const castScoreboardPrev = week > 1
      ? [...cast]
          .map((c) => ({
            ...c,
            total: castTotalUpToPrevWeek.get(c.id) || 0,
          }))
          .sort((a, b) => b.total - a.total)
      : []

    const castRankNow = rankMapFromSorted(castScoreboard as any)
    const castRankPrev = week > 1 ? rankMapFromSorted(castScoreboardPrev as any) : new Map<string, number>()

    // Team (player) totals up to week (cumulative), plus rank-change vs previous week
    function playerTotalsFromCastTotals(castTotals: Map<string, number>) {
      const totals = new Map<string, number>()
      players.forEach((p) => {
        const ids = draftedByPlayer.get(p.id) || []
        const sum = ids.reduce((acc, cid) => acc + (castTotals.get(cid) || 0), 0)
        totals.set(p.id, sum)
      })
      return totals
    }

    const playerTotalUpToWeek = playerTotalsFromCastTotals(castTotalUpToWeek)
    const playerTotalUpToPrev = week > 1 ? playerTotalsFromCastTotals(castTotalUpToPrevWeek) : new Map<string, number>()

    const teamsLeaderboard = [...players]
      .map((p) => ({
        ...p,
        total: playerTotalUpToWeek.get(p.id) || 0,
      }))
      .sort((a, b) => b.total - a.total)

    const teamsLeaderboardPrev = week > 1
      ? [...players]
          .map((p) => ({
            ...p,
            total: playerTotalUpToPrev.get(p.id) || 0,
          }))
          .sort((a, b) => b.total - a.total)
      : []

    const teamRankNow = rankMapFromSorted(teamsLeaderboard as any)
    const teamRankPrev = week > 1 ? rankMapFromSorted(teamsLeaderboardPrev as any) : new Map<string, number>()

    return {
      castById,
      draftedByPlayer,
      draftedSet,
      outcomeByCast,
      rulePoints,
      castWeekTotal,
      castTotalUpToWeek,
      castScoreboard,
      castRankNow,
      castRankPrev,
      teamsLeaderboard,
      teamRankNow,
      teamRankPrev,
    }
  }, [data, week])

  async function doSetDraft(playerId: string, castId: string) {
    setErr(null)
    setMsg(null)
    try {
      await setDraftPick({
        joinCode: joinCode.trim(),
        adminCode: adminCode.trim(),
        playerId,
        castMemberId: castId,
      })
      localStorage.setItem(LS_ADMIN, adminCode.trim())
      setMsg('Draft updated.')
      await refresh()
    } catch (e: any) {
      setErr(e?.message || 'Draft update failed.')
    }
  }

  async function doRemoveDraft(playerId: string, castId: string) {
    setErr(null)
    setMsg(null)
    try {
      await removeDraftPick({
        joinCode: joinCode.trim(),
        adminCode: adminCode.trim(),
        playerId,
        castMemberId: castId,
      })
      localStorage.setItem(LS_ADMIN, adminCode.trim())
      setMsg('Draft pick removed.')
      await refresh()
    } catch (e: any) {
      setErr(e?.message || 'Remove failed.')
    }
  }

  async function doSaveOutcomes(castId: string, values: OutcomeFormState) {
    setErr(null)
    setMsg(null)
    try {
      await upsertOutcomes({
        joinCode: joinCode.trim(),
        adminCode: adminCode.trim(),
        weekNumber: week,
        castMemberId: castId,
        immunityWins: values.immunity_wins,
        rewardWins: values.reward_wins,
        idolFound: values.idol_found,
        idolPlayed: values.idol_played,
        powerFound: values.power_found,
        powerPlayed: values.power_played,
      })
      localStorage.setItem(LS_ADMIN, adminCode.trim())
      setMsg('Outcomes saved.')
      await refresh()
    } catch (e: any) {
      setErr(e?.message || 'Outcome save failed.')
    }
  }
  async function doEliminateCast(castId: string) {
  setErr(null)
  setMsg(null)
  try {
    await eliminateCastMember({
      joinCode: joinCode.trim(),
      adminCode: adminCode.trim(),
      castMemberId: castId,
      eliminatedWeek: week,
    })
    setMsg('Cast member eliminated.')
    setSelectedCast(null)
    await refresh()
  } catch (e: any) {
    setErr(e?.message || 'Elimination failed.')
  }
}
  if (!data || !computed) {
    return (
      <div className="wrap">
        <div className="card">
          <img className="logo" src={logoUrl} alt="League logo placeholder" />
          <div className="panel">
            <div className="topbar">
              <div>
                <div className="title">Survivor Season 50 League</div>
                <div className="hint">
                  Commissioner-only: draft + weekly outcomes entered by one person. Everyone can view leaderboards + teams.
                </div>
              </div>
            </div>

            <div className="row">
              <input
                className="input"
                style={{ width: 260 }}
                placeholder="Join Code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button className="btn" onClick={load} disabled={loading || !joinCode.trim()}>
                {loading ? 'Loading…' : 'Enter the Jungle'}
              </button>
            </div>

            {err && <div className="error">{err}</div>}

            <div className="divider" />
            <div className="hint">
              This project ships with an original placeholder logo. Replace it with an image you have rights to use.
            </div>
          </div>
        </div>

        <div className="footer">Hosted on Vercel • Data in Supabase</div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <img className="logo" src={logoUrl} alt="League logo placeholder" />
        <div className="panel">
          <div className="topbar">
            <div>
              <div className="title">{(data.league as any).name}</div>
              <div className="hint">
                Join Code: <span className="badge">{(data.league as any).join_code}</span>
              </div>
            </div>

            <div className="row">
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Week
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={week}
                  onChange={(e) => setWeek(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 90 }}
                />
              </label>

              <input
                className="input"
                style={{ width: 220 }}
                placeholder="Admin code (commissioner)"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
              />
              <button className="btn" onClick={refresh}>
                Refresh
              </button>
            </div>
          </div>

          {err && <div className="error">{err}</div>}
          {msg && <div className="success">{msg}</div>}
        </div>
      </div>

      {/* ✅ Teams Leaderboard (moved ABOVE cast leaderboard) */}
      <div className="wood" style={{ marginBottom: 12 }}>
        <div className="sectionTitle">
          <h2>Teams Leaderboard</h2>
          <span>Rank • movement vs week {Math.max(1, week - 1)} • bigger cast tiles • total cumulative score</span>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th className="rank">Rank</th>
                <th style={{ width: 80 }}>Δ</th>
                <th>Team</th>
                <th>Draft picks</th>
                <th className="pts">Total</th>
              </tr>
            </thead>
            <tbody>
              {computed.teamsLeaderboard.map((p: any) => {
                const currRank = computed.teamRankNow.get(p.id) || null
                const prevRank = week > 1 ? (computed.teamRankPrev.get(p.id) || null) : null
                const picks = (computed.draftedByPlayer.get(p.id) || [])
                  .map((cid: string) => computed.castById.get(cid))
                  .filter(Boolean) as any[]

                return (
                  <tr key={p.id}>
                    <td className="rank">{currRank}</td>
                    <td>{trendBadge(prevRank, currRank)}</td>
                    <td className="playerName">
                      {p.name} <span className="badge" style={{ marginLeft: 8 }}>{p.team_name}</span>
                    </td>

                    <td>
                      {picks.length === 0 ? (
                        <span className="hint">Draft not entered yet.</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {picks.map((c: any) => {
                           const isEliminated = c.eliminated_week && c.eliminated_week <= week

                          return (
                          <div
                          key={c.id}
                          className={"tile" + (isEliminated ? " eliminatedTile" : "")}
                          title={c.name}
                          onClick={() => setSelectedCast(c)}
                          style={{
                            width: 120,
                            height: 160,
                            borderRadius: 14,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                        >
                          {c.headshot_url ? (
                            <img
                              src={c.headshot_url}
                              alt={c.name}
                              style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: 120 }} />
                          )}
                    
                          {isEliminated && (
                            <div className="elimOverlay">☠</div>
                          )}
                    
                          <div className="name" style={{ padding: '8px 10px', fontSize: 14, lineHeight: 1.1 }}>
                            {c.name}
                          </div>
                        </div>
                      )
                    })}
                        </div>
                      )}
                    </td>

                    <td className="pts">
                      <span className="badge">{p.total}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ Cast Member Scoreboard + Weekly Outcomes (INLINE) */}
      <div className="wood" style={{ marginBottom: 12 }}>
        <div className="sectionTitle">
          <h2>Cast Member Scoreboard</h2>
          <span>Rank • movement vs week {Math.max(1, week - 1)} • enter week {week} outcomes inline</span>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th className="rank">Rank</th>
                <th style={{ width: 80 }}>Δ</th>
                <th>Cast member</th>

                {/* Weekly outcomes inputs go here */}
                <th>Immunity</th>
                <th>Reward</th>
                <th>Idol found</th>
                <th>Idol played</th>
                <th>Power found</th>
                <th>Power played</th>
                <th className="pts">Save</th>

                {/* Totals on the right */}
                <th className="pts">Week pts</th>
                <th className="pts">Total</th>
              </tr>
            </thead>

            <tbody>
              {computed.castScoreboard.map((c: any) => {
                const currRank = computed.castRankNow.get(c.id) || null
                const prevRank = week > 1 ? (computed.castRankPrev.get(c.id) || null) : null
                return (
                  <CastOutcomeRow
                    key={c.id}
                    rank={currRank || 0}
                    prevRank={prevRank}
                    cast={c}
                    existing={computed.outcomeByCast.get(c.id)}
                    weekPoints={computed.castWeekTotal.get(c.id) || 0}
                    totalPoints={computed.castTotalUpToWeek.get(c.id) || 0}
                    onSave={doSaveOutcomes}
                  />
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          Tip: Only the commissioner (admin code) can save outcomes. Totals update after refresh.
        </div>
      </div>

      <div className="wood">
        <div className="sectionTitle">
          <h2>Commissioner Tools</h2>
          <span>Draft entry + points system</span>
        </div>

        <div className="panel" style={{ paddingTop: 12 }}>
          <div className="formGrid">
            <DraftBox
              players={data.players as any}
              cast={data.cast as any}
              draftedByPlayer={computed.draftedByPlayer}
              draftedSet={computed.draftedSet}
              onAdd={doSetDraft}
              onRemove={doRemoveDraft}
            />

            <div className="box">
              <h3>Points system</h3>
              <div className="hint">
                Loaded from <code>scoring_rules</code> table.
              </div>
              <div className="divider" />
              <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
                {(data.scoringRules as any[]).map((r: any) => (
                  <li key={r.category_key}>
                    <b>{r.label}:</b> {r.points} pts
                  </li>
                ))}
              </ul>
            </div>

            <div className="box">
              <h3>How totals work</h3>
              <div className="hint">
                Cast members earn points from weekly outcomes. Team total = sum of that player’s drafted cast members (cumulative up to the selected week).
              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedCast && (
        <div className="modalBackdrop" onClick={() => setSelectedCast(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{selectedCast.name}</h3>
            <div className="hint" style={{ marginBottom: 12 }}>
              {selectedCast.eliminated_week
                ? `Already eliminated in week ${selectedCast.eliminated_week}.`
                : 'Mark this cast member as eliminated?'}
            </div>
      
            <div className="row">
              {!selectedCast.eliminated_week && (
                <button className="btn" onClick={() => doEliminateCast(selectedCast.id)}>
                  Eliminate
                </button>
              )}
              <button className="btn" onClick={() => setSelectedCast(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="footer">
        Upload cast headshots to Supabase Storage and paste URLs into <code>cast_members.headshot_url</code>.
      </div>
    </div>
  )
}

function DraftBox(props: {
  players: Array<{ id: string; name: string; team_name: string }>
  cast: Array<{ id: string; name: string }>
  draftedByPlayer: Map<string, string[]>
  draftedSet: Set<string>
  onAdd: (playerId: string, castId: string) => void
  onRemove: (playerId: string, castId: string) => void
}) {
  const { players, cast, draftedByPlayer, draftedSet, onAdd, onRemove } = props
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '')
  const [castId, setCastId] = useState('')

  const playerPicks = draftedByPlayer.get(playerId) || []
  const availableCast = cast.filter((c) => !draftedSet.has(c.id) || playerPicks.includes(c.id))

  return (
    <div className="box">
      <h3>Draft</h3>
      <div className="hint">
        Assign up to <b>3</b> cast per player. Duplicates across players are blocked automatically.
      </div>
      <div className="divider" />

      <label className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        Player
        <select
          className="select"
          value={playerId}
          onChange={(e) => {
            setPlayerId(e.target.value)
            setCastId('')
          }}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.team_name}
            </option>
          ))}
        </select>
      </label>

      <div className="divider" />

      <label className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        Add cast member
        <select className="select" value={castId} onChange={(e) => setCastId(e.target.value)}>
          <option value="">Select…</option>
          {availableCast
            .filter((c) => !playerPicks.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>

      <div className="divider" />

      <button
        className="btn"
        disabled={!playerId || !castId || playerPicks.length >= 3}
        onClick={() => {
          onAdd(playerId, castId)
          setCastId('')
        }}
      >
        Add pick
      </button>

      <div className="divider" />

      <div className="hint">
        <b>Current picks</b> ({playerPicks.length}/3)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {playerPicks.length === 0 ? (
          <div className="hint">None yet.</div>
        ) : (
          playerPicks.map((cid) => {
            const cm = cast.find((c) => c.id === cid)
            return (
              <div key={cid} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="hint">{cm?.name ?? cid}</span>
                <button className="btn" onClick={() => onRemove(playerId, cid)}>
                  Remove
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * ✅ Combined row:
 * Rank + trend + cast member name + weekly outcome inputs + save + totals
 */
function CastOutcomeRow(props: {
  rank: number
  prevRank?: number | null
  cast: { id: string; name: string }
  existing?: any
  weekPoints: number
  totalPoints: number
  onSave: (castId: string, values: OutcomeFormState) => void
}) {
  const { rank, prevRank, cast, existing, weekPoints, totalPoints, onSave } = props

  const [v, setV] = useState<OutcomeFormState>(() => ({
    immunity_wins: existing?.immunity_wins ?? 0,
    reward_wins: existing?.reward_wins ?? 0,
    idol_found: existing?.idol_found ?? 0,
    idol_played: existing?.idol_played ?? 0,
    power_found: existing?.power_found ?? 0,
    power_played: existing?.power_played ?? 0,
  }))

  React.useEffect(() => {
    setV({
      immunity_wins: existing?.immunity_wins ?? 0,
      reward_wins: existing?.reward_wins ?? 0,
      idol_found: existing?.idol_found ?? 0,
      idol_played: existing?.idol_played ?? 0,
      power_found: existing?.power_found ?? 0,
      power_played: existing?.power_played ?? 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    existing?.immunity_wins,
    existing?.reward_wins,
    existing?.idol_found,
    existing?.idol_played,
    existing?.power_found,
    existing?.power_played,
  ])

  function setNum(key: keyof OutcomeFormState, val: string) {
    const n = Math.max(0, Number(val) || 0)
    setV((p) => ({ ...p, [key]: n }))
  }

  return (
    <tr>
      <td className="rank">{rank}</td>
      <td>{trendBadge(prevRank, rank)}</td>
      <td className="playerName">{cast.name}</td>

      <td>
        <input className="input outcomeInput" type="number" min={0} value={v.immunity_wins} onChange={(e) => setNum('immunity_wins', e.target.value)} />
      </td>
      <td>
        <input className="input outcomeInput" type="number" min={0} value={v.reward_wins} onChange={(e) => setNum('reward_wins', e.target.value)} />
      </td>
      <td>
        <input className="input outcomeInput" type="number" min={0} value={v.idol_found} onChange={(e) => setNum('idol_found', e.target.value)} />
      </td>
      <td>
        <input className="input outcomeInput" type="number" min={0} value={v.idol_played} onChange={(e) => setNum('idol_played', e.target.value)} />
      </td>
      <td>
        <input className="input outcomeInput" type="number" min={0} value={v.power_found} onChange={(e) => setNum('power_found', e.target.value)} />
      </td>
      <td>
        <input className="input outcomeInput" type="number" min={0} value={v.power_played} onChange={(e) => setNum('power_played', e.target.value)} />
      </td>

      <td className="pts">
        <button className="btn" onClick={() => onSave(cast.id, v)}>
          Save
        </button>
      </td>

      <td className="pts">{weekPoints}</td>
      <td className="pts">{totalPoints}</td>
    </tr>
  )
}
