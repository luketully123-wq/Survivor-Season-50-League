import React, { useMemo, useState } from 'react'
import {
  fetchLeagueByJoinCode,
  removeDraftPick,
  setDraftPick,
  upsertOutcomes,
  type LeaguePayload,
} from './api'
import logoUrl from './assets/tribal_background.jpg'

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

export default function App() {
  const [joinCode, setJoinCode] = useState<string>(
    localStorage.getItem(LS_JOIN) || (import.meta.env.VITE_DEFAULT_JOIN_CODE ?? ''),
  )
  const [adminCode, setAdminCode] = useState<string>(localStorage.getItem(LS_ADMIN) || '')
  const [week, setWeek] = useState<number>(1)

  const [data, setData] = useState<LeaguePayload | null>(null)
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

    // Cast totals (season + this week)
    const castSeasonTotal = new Map<string, number>()
    const castWeekTotal = new Map<string, number>()
    cast.forEach((c) => {
      castSeasonTotal.set(c.id, 0)
      castWeekTotal.set(c.id, 0)
    })

    // Outcomes lookup for current week (for inputs)
    const outcomeByCast = new Map<string, any>()
    for (const o of (data.outcomes as any[]).filter((x) => x.week_number === week)) {
      outcomeByCast.set(o.cast_member_id, o)
    }

    // Aggregate totals
    for (const o of data.outcomes as any[]) {
      const pts = pointsForOutcome(o)
      castSeasonTotal.set(o.cast_member_id, (castSeasonTotal.get(o.cast_member_id) || 0) + pts)
      if (o.week_number === week) {
        castWeekTotal.set(o.cast_member_id, (castWeekTotal.get(o.cast_member_id) || 0) + pts)
      }
    }

    // Player totals
    const playerSeasonTotal = new Map<string, number>()
    const playerWeekTotal = new Map<string, number>()
    players.forEach((p) => {
      const ids = draftedByPlayer.get(p.id) || []
      const seasonSum = ids.reduce((acc, cid) => acc + (castSeasonTotal.get(cid) || 0), 0)
      const weekSum = ids.reduce((acc, cid) => acc + (castWeekTotal.get(cid) || 0), 0)
      playerSeasonTotal.set(p.id, seasonSum)
      playerWeekTotal.set(p.id, weekSum)
    })

    const leaderboard = [...players]
      .map((p) => ({
        ...p,
        total: playerSeasonTotal.get(p.id) || 0,
        weekTotal: playerWeekTotal.get(p.id) || 0,
      }))
      .sort((a, b) => (b.total - a.total) || (b.weekTotal - a.weekTotal))

    return {
      castById,
      draftedByPlayer,
      draftedSet,
      leaderboard,
      outcomeByCast,
      castSeasonTotal,
      castWeekTotal,
      rulePoints,
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
                  Commissioner-only: draft + weekly outcomes entered by one person. Everyone can view leaderboard + teams.
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
              <button className="btn" onClick={refresh}>Refresh</button>
            </div>
          </div>

          {err && <div className="error">{err}</div>}
          {msg && <div className="success">{msg}</div>}
        </div>
      </div>

      {/* ✅ Combined Leaderboard + Weekly Outcomes Entry */}
      <div className="wood" style={{ marginBottom: 12 }}>
        <div className="sectionTitle">
          <h2>Leaderboard + Week {week} Outcomes</h2>
          <span>Rank • Player • Week Points • Season Points • Enter outcomes on drafted cast</span>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th className="rank">Rank</th>
                <th>Player</th>
                <th className="pts">Week</th>
                <th className="pts">Season</th>
              </tr>
            </thead>
            <tbody>
              {computed.leaderboard.map((p: any, idx: number) => (
                <React.Fragment key={p.id}>
                  <tr>
                    <td className="rank">{idx + 1}</td>
                    <td className="playerName">
                      {p.name}{' '}
                      <span className="badge" style={{ marginLeft: 8 }}>
                        {p.team_name}
                      </span>
                    </td>
                    <td className="pts">{p.weekTotal}</td>
                    <td className="pts">{p.total}</td>
                  </tr>

                  {/* Drafted cast row with inputs */}
                  <tr>
                    <td colSpan={4} style={{ padding: 0 }}>
                      <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="hint" style={{ marginBottom: 8 }}>
                          Draft picks: {(computed.draftedByPlayer.get(p.id) || []).length} / 3
                          <span style={{ marginLeft: 10, opacity: 0.9 }}>
                            (Enter week {week} outcomes for this player’s cast)
                          </span>
                        </div>

                        {(computed.draftedByPlayer.get(p.id) || []).length === 0 ? (
                          <div className="hint">No draft picks yet.</div>
                        ) : (
                          <div className="tableWrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Cast member</th>
                                  <th className="pts">Week pts</th>
                                  <th className="pts">Season pts</th>
                                  <th>Immunity</th>
                                  <th>Reward</th>
                                  <th>Idol found</th>
                                  <th>Idol played</th>
                                  <th>Power found</th>
                                  <th>Power played</th>
                                  <th className="pts">Save</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(computed.draftedByPlayer.get(p.id) || [])
                                  .map((cid: string) => computed.castById.get(cid))
                                  .filter(Boolean)
                                  .map((c: any) => (
                                    <OutcomeCastRow
                                      key={c.id}
                                      cast={c}
                                      weekPoints={computed.castWeekTotal.get(c.id) || 0}
                                      seasonPoints={computed.castSeasonTotal.get(c.id) || 0}
                                      existing={computed.outcomeByCast.get(c.id)}
                                      onSave={doSaveOutcomes}
                                    />
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="wood" style={{ marginBottom: 12 }}>
        <div className="sectionTitle">
          <h2>Teams</h2>
          <span>Team name + cast headshots</span>
        </div>

        <div className="gridPlayers">
          {computed.leaderboard.map((p: any) => (
            <div className="playerRow" key={p.id}>
              <div className="avatarFallback">{initials(p.name) || '?'}</div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ fontWeight: 950, fontSize: 16 }}>
                    {p.name} <span className="badge" style={{ marginLeft: 8 }}>{p.team_name}</span>
                  </div>
                  <div className="badge">
                    Week: {p.weekTotal} • Total: {p.total}
                  </div>
                </div>
                <div className="small">Draft picks: {(computed.draftedByPlayer.get(p.id) || []).length} / 3</div>
              </div>

              <div className="casts">
                {(computed.draftedByPlayer.get(p.id) || []).length === 0 ? (
                  <div className="hint">Draft not entered yet.</div>
                ) : (
                  (computed.draftedByPlayer.get(p.id) || [])
                    .map((id: string) => computed.castById.get(id))
                    .filter(Boolean)
                    .map((c: any) => (
                      <div className="tile" key={c.id} title={c.name}>
                        {c.headshot_url ? <img src={c.headshot_url} alt={c.name} /> : <div style={{ height: '100%' }} />}
                        <div className="name">{c.name}</div>
                      </div>
                    ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="wood">
        <div className="sectionTitle">
          <h2>Commissioner Tools</h2>
          <span>Draft entry (outcomes are now inside the leaderboard)</span>
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
                Cast members earn points from weekly outcomes. Player totals are the sum of their drafted cast members.
              </div>
            </div>
          </div>
        </div>
      </div>

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
 * Row used inside the combined leaderboard.
 * Shows cast member week/season points + the editable outcome inputs for the selected week.
 */
function OutcomeCastRow(props: {
  cast: { id: string; name: string }
  existing?: any
  weekPoints: number
  seasonPoints: number
  onSave: (castId: string, values: OutcomeFormState) => void
}) {
  const { cast, existing, onSave, weekPoints, seasonPoints } = props
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
      <td className="playerName">{cast.name}</td>
      <td className="pts">{weekPoints}</td>
      <td className="pts">{seasonPoints}</td>

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
    </tr>
  )
}
