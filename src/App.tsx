import React, { useMemo, useState } from 'react'
import {
  fetchLeagueByJoinCode,
  removeDraftPick,
  setDraftPick,
  upsertOutcomes,
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

    const castById = new Map(data.cast.map((c) => [c.id, c]))

    const draftedByPlayer = new Map<string, string[]>()
    data.players.forEach((p) => draftedByPlayer.set(p.id, []))
    for (const d of data.draft) {
      draftedByPlayer.set(d.player_id, [...(draftedByPlayer.get(d.player_id) || []), d.cast_member_id])
    }

    const draftedSet = new Set<string>(data.draft.map((d) => d.cast_member_id))

    const rulePoints = new Map<string, number>()
    for (const r of data.scoringRules) rulePoints.set(r.category_key, r.points)

    const castTotal = new Map<string, number>()
    data.cast.forEach((c) => castTotal.set(c.id, 0))

    for (const o of data.outcomes) {
      const total =
        (o.immunity_wins || 0) * (rulePoints.get('immunity') || 0) +
        (o.reward_wins || 0) * (rulePoints.get('reward') || 0) +
        (o.idol_found || 0) * (rulePoints.get('idol_found') || 0) +
        (o.idol_played || 0) * (rulePoints.get('idol_played') || 0) +
        (o.power_found || 0) * (rulePoints.get('power_found') || 0) +
        (o.power_played || 0) * (rulePoints.get('power_played') || 0)

      castTotal.set(o.cast_member_id, (castTotal.get(o.cast_member_id) || 0) + total)
    }

    const playerTotal = new Map<string, number>()
    data.players.forEach((p) => playerTotal.set(p.id, 0))
    for (const p of data.players) {
      const ids = draftedByPlayer.get(p.id) || []
      const sum = ids.reduce((acc, cid) => acc + (castTotal.get(cid) || 0), 0)
      playerTotal.set(p.id, sum)
    }

    const leaderboard = [...data.players]
  .map((p) => ({ ...p, total: playerTotal.get(p.id) || 0 }))
  .sort((a, b) => {
    const d = b.total - a.total
    if (d !== 0) return d
    return a.name.localeCompare(b.name) // tie-break
  })

const castScoreboard = [...data.cast]
  .map((c) => ({
    ...c,
    total: castTotal.get(c.id) || 0,
    draftedByPlayerId: data.draft.find((d) => d.cast_member_id === c.id)?.player_id ?? null,
  }))
  .sort((a, b) => {
    const d = b.total - a.total
    if (d !== 0) return d
    return a.name.localeCompare(b.name)
  })

const playerNameById = new Map(data.players.map((p) => [p.id, p.name]))
    
    const outcomeByCast = new Map<string, any>()
    for (const o of data.outcomes.filter((x) => x.week_number === week)) {
      outcomeByCast.set(o.cast_member_id, o)
    }

    return { castById, draftedByPlayer, draftedSet, leaderboard, outcomeByCast, castScoreboard, playerNameById }
  }, [data, week])

  async function doSetDraft(playerId: string, castId: string) {
    setErr(null)
    setMsg(null)
    try {
      await setDraftPick({ joinCode: joinCode.trim(), adminCode: adminCode.trim(), playerId, castMemberId: castId })
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
      await removeDraftPick({ joinCode: joinCode.trim(), adminCode: adminCode.trim(), playerId, castMemberId: castId })
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
              <input className="input" style={{ width: 260 }} placeholder="Join Code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
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
              <div className="title">{data.league.name}</div>
              <div className="hint">
                Join Code: <span className="badge">{data.league.join_code}</span>
              </div>
            </div>

            <div className="row">
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Week
                <input className="input" type="number" min={1} value={week} onChange={(e) => setWeek(Math.max(1, Number(e.target.value) || 1))} style={{ width: 90 }} />
              </label>

              <input className="input" style={{ width: 220 }} placeholder="Admin code (commissioner)" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />
              <button className="btn" onClick={refresh}>Refresh</button>
            </div>
          </div>

          {err && <div className="error">{err}</div>}
          {msg && <div className="success">{msg}</div>}
        </div>
      </div>

      <div className="wood" style={{ marginBottom: 12 }}>
        <div className="sectionTitle">
          <h2>Leaderboard</h2>
          <span>Rank • Player • Total Points</span>
        </div>
        <table>
          <thead>
            <tr>
              <th className="rank">Rank</th>
              <th>Player</th>
              <th className="pts">Total Points</th>
            </tr>
          </thead>
          <tbody>
            {computed.leaderboard.map((p, idx) => (
              <tr key={p.id}>
                <td className="rank">{idx + 1}</td>
                <td className="playerName">{p.name}</td>
                <td className="pts">{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="wood" style={{ marginBottom: 12 }}>
  <div className="sectionTitle">
    <h2>Cast Member Scoreboard</h2>
    <span>Total points by cast member</span>
  </div>

  <div className="tableWrap">
    <table>
      <thead>
        <tr>
          <th className="rank">Rank</th>
          <th>Cast member</th>
          <th>Drafted by</th>
          <th className="pts">Total Points</th>
        </tr>
      </thead>
      <tbody>
        {computed.castScoreboard.map((c, idx) => {
          const draftedBy = c.draftedByPlayerId ? computed.playerNameById.get(c.draftedByPlayerId) : null
          return (
            <tr key={c.id}>
              <td className="rank">{idx + 1}</td>
              <td className="playerName">{c.name}</td>
              <td>{draftedBy ? <span className="badge">{draftedBy}</span> : <span className="small">Undrafted</span>}</td>
              <td className="pts">{c.total}</td>
            </tr>
          )
        })}
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
          {computed.leaderboard.map((p) => (
            <div className="playerRow" key={p.id}>
              <div className="avatarFallback">{initials(p.name) || '?'}</div>

              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>
                    {p.name} <span className="badge" style={{ marginLeft: 8 }}>{p.team_name}</span>
                  </div>
                  <div className="badge">Total: {p.total}</div>
                </div>
                <div className="small">Draft picks: {(computed.draftedByPlayer.get(p.id) || []).length} / 3</div>
              </div>

              <div className="casts">
                {(computed.draftedByPlayer.get(p.id) || []).length === 0 ? (
                  <div className="hint">Draft not entered yet.</div>
                ) : (
                  (computed.draftedByPlayer.get(p.id) || [])
                    .map((id) => computed.castById.get(id))
                    .filter(Boolean)
                    .map((c) => (
                      <div className="tile" key={(c as any).id} title={(c as any).name}>
                        {(c as any).headshot_url ? <img src={(c as any).headshot_url} alt={(c as any).name} /> : <div style={{ height: '100%' }} />}
                        <div className="name">{(c as any).name}</div>
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
          <span>Draft + weekly outcomes entry</span>
        </div>

        <div className="panel" style={{ paddingTop: 12 }}>
          <div className="formGrid">
            <DraftBox
              players={data.players}
              cast={data.cast}
              draftedByPlayer={computed.draftedByPlayer}
              draftedSet={computed.draftedSet}
              onAdd={doSetDraft}
              onRemove={doRemoveDraft}
            />

            <div className="box">
              <h3>Points system</h3>
              <div className="hint">Loaded from <code>scoring_rules</code> table.</div>
              <div className="divider" />
              <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
                {data.scoringRules.map((r) => (
                  <li key={r.category_key}><b>{r.label}:</b> {r.points} pts</li>
                ))}
              </ul>
            </div>

            <div className="box">
              <h3>How totals work</h3>
              <div className="hint">
                Cast members earn points from weekly outcomes. Player total = sum of their 3 cast members’ season totals.
              </div>
            </div>
          </div>

          <div className="divider" />

          <OutcomesTable
            week={week}
            cast={data.cast}
            existingByCast={computed.outcomeByCast}
            onSave={doSaveOutcomes}
          />
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
      <h3>Draft (enter later)</h3>
      <div className="hint">Assign up to <b>3</b> cast per player. Duplicates across players are blocked automatically.</div>
      <div className="divider" />

      <label className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        Player
        <select className="select" value={playerId} onChange={(e) => { setPlayerId(e.target.value); setCastId('') }}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.team_name}</option>
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
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </select>
      </label>

      <div className="divider" />

      <button className="btn" disabled={!playerId || !castId || playerPicks.length >= 3} onClick={() => { onAdd(playerId, castId); setCastId('') }}>
        Add pick
      </button>

      <div className="divider" />

      <div className="hint"><b>Current picks</b> ({playerPicks.length}/3)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {playerPicks.length === 0 ? (
          <div className="hint">None yet.</div>
        ) : (
          playerPicks.map((cid) => {
            const cm = cast.find((c) => c.id === cid)
            return (
              <div key={cid} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="hint">{cm?.name ?? cid}</span>
                <button className="btn" onClick={() => onRemove(playerId, cid)}>Remove</button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function OutcomesTable(props: {
  week: number
  cast: Array<{ id: string; name: string }>
  existingByCast: Map<string, any>
  onSave: (castId: string, values: OutcomeFormState) => void
}) {
  const { week, cast, existingByCast, onSave } = props

  return (
    <div className="box">
      <h3>Week {week} outcomes (per cast member)</h3>
      <div className="hint">Enter counts and click <b>Save</b> on that row.</div>
      <div className="divider" />

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Cast member</th>
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
            {cast.map((c) => (
              <OutcomeRow key={c.id} cast={c} existing={existingByCast.get(c.id)} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OutcomeRow(props: { cast: { id: string; name: string }; existing?: any; onSave: (castId: string, values: OutcomeFormState) => void }) {
  const { cast, existing, onSave } = props
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
  }, [existing?.immunity_wins, existing?.reward_wins, existing?.idol_found, existing?.idol_played, existing?.power_found, existing?.power_played])

  function setNum(key: keyof OutcomeFormState, val: string) {
    const n = Math.max(0, Number(val) || 0)
    setV((p) => ({ ...p, [key]: n }))
  }

  return (
    <tr>
      <td className="playerName">{cast.name}</td>
      <td><input className="input outcomeInput" type="number" min={0} value={v.immunity_wins} onChange={(e) => setNum('immunity_wins', e.target.value)} /></td>
      <td><input className="input outcomeInput" type="number" min={0} value={v.reward_wins} onChange={(e) => setNum('reward_wins', e.target.value)} /></td>
      <td><input className="input outcomeInput" type="number" min={0} value={v.idol_found} onChange={(e) => setNum('idol_found', e.target.value)} /></td>
      <td><input className="input outcomeInput" type="number" min={0} value={v.idol_played} onChange={(e) => setNum('idol_played', e.target.value)} /></td>
      <td><input className="input outcomeInput" type="number" min={0} value={v.power_found} onChange={(e) => setNum('power_found', e.target.value)} /></td>
      <td><input className="input outcomeInput" type="number" min={0} value={v.power_played} onChange={(e) => setNum('power_played', e.target.value)} /></td>
      <td className="pts"><button className="btn" onClick={() => onSave(cast.id, v)}>Save</button></td>
    </tr>
  )
}
