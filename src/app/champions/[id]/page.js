import Link from 'next/link';
import { notFound } from 'next/navigation';
import ChampionIcon from '@/components/ChampionIcon';
import TeamLogo from '@/components/TeamLogo';
import { supabase } from '@/lib/supabase';
import { check, fetchAll, getPlayerMap, getTeamMap } from '@/lib/queries';
import { getChampionById, getChampions } from '@/lib/ddragon';
import { playerLabel } from '@/lib/labels';
import { kda, winRate, ROLE_LABELS, ROLE_ORDER } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';

const MIN_SAMPLE = 3; // 상성 승률 색 표시는 이 판수 이상만

export async function generateMetadata({ params }) {
  const champ = await getChampionById((await params).id);
  return { title: champ ? `${champ.name} 통계` : '챔피언 없음' };
}

// 여러 행의 숫자 열을 합산
function sum(rows, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) for (const k of keys) out[k] += Number(r[k] ?? 0);
  return out;
}

const kdaOf = (s) => (s.deaths ? (s.kills + s.assists) / s.deaths : null);

// /champions/Azir?year=2026&role=mid   (year=all 이면 전체 기간)
export default async function ChampionPage({ params, searchParams }) {
  const champ = await getChampionById((await params).id);
  if (!champ) notFound();
  const query = await searchParams;

  const [seasons, roleRows, matchupRows, playerRows, teams, players, champion] = await Promise.all([
    supabase.from('champion_season_stats').select('*').eq('champion', champ.en).order('year', { ascending: false }).then(check),
    supabase.from('champion_role_stats').select('*').eq('champion', champ.en).then(check),
    fetchAll(() => supabase.from('champion_matchups').select('*').eq('champion', champ.en)),
    fetchAll(() =>
      supabase
        .from('player_game_rows')
        .select('player_id, team_id, year, win, kills, deaths, assists, start_time')
        .eq('champion', champ.en)
        .order('start_time', { ascending: false }),
    ),
    getTeamMap(),
    getPlayerMap(),
    getChampions(),
  ]);

  const years = seasons.map((s) => s.year);
  const year = query.year === 'all' ? 'all' : years.includes(Number(query.year)) ? Number(query.year) : years[0];
  const inYear = (r) => year === 'all' || r.year === year;

  // 요약
  const season = sum(seasons.filter(inYear), ['picks', 'wins', 'bans', 'kills', 'deaths', 'assists', 'total_games']);

  // 포지션별
  const byRole = ROLE_ORDER.map((role) => ({
    role,
    ...sum(roleRows.filter((r) => r.role === role && inYear(r)), ['picks', 'wins', 'kills', 'deaths', 'assists']),
  })).filter((r) => r.picks > 0);
  const role = byRole.some((r) => r.role === query.role) ? query.role : [...byRole].sort((a, b) => b.picks - a.picks)[0]?.role;

  // 라인 상성 (선택한 포지션)
  const matchups = new Map();
  for (const m of matchupRows.filter((r) => r.role === role && inYear(r))) {
    const cur = matchups.get(m.opponent) ?? { opponent: m.opponent, games: 0, wins: 0 };
    cur.games += m.games;
    cur.wins += m.wins;
    matchups.set(m.opponent, cur);
  }
  const matchupList = [...matchups.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);

  // 많이 쓴 선수
  const byPlayer = new Map();
  for (const r of playerRows.filter(inYear)) {
    const p = byPlayer.get(r.player_id) ?? { id: r.player_id, team: teams.get(r.team_id), games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    p.games++;
    p.wins += r.win ? 1 : 0;
    p.kills += r.kills;
    p.deaths += r.deaths;
    p.assists += r.assists;
    byPlayer.set(r.player_id, p);
  }
  const topPlayers = [...byPlayer.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 10);

  const yearHref = (y) => `/champions/${champ.id}?year=${y}${role ? `&role=${role}` : ''}`;

  return (
    <div className={`container ${page.page}`}>
      <Link href={`/champions${typeof year === 'number' ? `?year=${year}` : ''}`} className={page.back}>
        ← 챔피언 통계
      </Link>

      <section className={page.profile}>
        <ChampionIcon champ={champ} size={72} />
        <div>
          <h1>{champ.name}</h1>
          <p>{champ.en}</p>
        </div>
      </section>

      {!seasons.length ? (
        <p className={page.empty}>2020년 이후 LCK에서 픽·밴된 기록이 없어요.</p>
      ) : (
        <>
          <nav className={page.filters} aria-label="기간 선택">
            <Link href={yearHref('all')} className={year === 'all' ? page.activeChip : page.chip}>
              전체 기간
            </Link>
            {years.map((y) => (
              <Link key={y} href={yearHref(y)} className={y === year ? page.activeChip : page.chip}>
                {y}
              </Link>
            ))}
          </nav>

          <div className={page.cards}>
            <div className={page.card}>
              <span>픽</span>
              <b>{season.picks}</b>
              <small>{year !== 'all' && season.total_games ? `${((season.picks / season.total_games) * 100).toFixed(1)}%` : ''}</small>
            </div>
            <div className={page.card}>
              <span>밴</span>
              <b>{season.bans}</b>
              <small>{year !== 'all' && season.total_games ? `${((season.bans / season.total_games) * 100).toFixed(1)}%` : ''}</small>
            </div>
            <div className={page.card}>
              <span>승률</span>
              <b>{winRate(season.wins, season.picks)}</b>
              <small>
                {season.wins}승 {season.picks - season.wins}패
              </small>
            </div>
            <div className={page.card}>
              <span>KDA</span>
              <b>{season.picks ? kda(kdaOf(season)) : '-'}</b>
            </div>
          </div>

          {byRole.length > 0 && (
            <section className={page.section}>
              <h2 className={page.sectionTitle}>포지션별</h2>
              <div className={t.wrap}>
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th className={t.left}>포지션</th>
                      <th>픽</th>
                      <th>승률</th>
                      <th>KDA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRole.map((r) => (
                      <tr key={r.role}>
                        <td className={t.left}>{ROLE_LABELS[r.role]}</td>
                        <td>{r.picks}</td>
                        <td>{winRate(r.wins, r.picks)}</td>
                        <td className={t.strong}>{kda(kdaOf(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {role && (
            <section className={page.section}>
              <h2 className={page.sectionTitle}>라인 상성 · {ROLE_LABELS[role]}</h2>
              <p className={page.desc} style={{ marginTop: -4 }}>
                같은 포지션 상대 챔피언별 {champ.name}의 전적 · 판수가 적으면 승률이 크게 흔들려서 {MIN_SAMPLE}판
                이상만 색으로 표시해요
              </p>
              {byRole.length > 1 && (
                <nav className={page.filters} aria-label="상성 포지션 선택">
                  {byRole.map((r) => (
                    <Link
                      key={r.role}
                      href={`/champions/${champ.id}?year=${year}&role=${r.role}`}
                      className={r.role === role ? page.activeChip : page.chip}
                    >
                      {ROLE_LABELS[r.role]}
                    </Link>
                  ))}
                </nav>
              )}
              {matchupList.length ? (
                <div className={t.wrap}>
                  <table className={t.table}>
                    <thead>
                      <tr>
                        <th className={`${t.left} ${t.sticky}`}>상대 챔피언</th>
                        <th>판수</th>
                        <th>전적</th>
                        <th>{champ.name} 승률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchupList.map((m) => {
                        const opp = champion(m.opponent);
                        const rate = m.wins / m.games;
                        const tone =
                          m.games < MIN_SAMPLE ? t.muted : rate >= 0.6 ? t.plus : rate <= 0.4 ? t.minus : undefined;
                        return (
                          <tr key={m.opponent}>
                            <td className={`${t.left} ${t.sticky}`}>
                              {opp.id ? (
                                <Link href={`/champions/${opp.id}?year=${year}&role=${role}`} className={t.name}>
                                  <ChampionIcon champ={opp} size={24} />
                                  {opp.name}
                                </Link>
                              ) : (
                                <span className={t.name}>{opp.name}</span>
                              )}
                            </td>
                            <td>{m.games}</td>
                            <td>
                              {m.wins}승 {m.games - m.wins}패
                            </td>
                            <td className={tone}>{winRate(m.wins, m.games)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={page.empty}>상대 기록이 없어요.</p>
              )}
            </section>
          )}

          {topPlayers.length > 0 && (
            <section className={page.section}>
              <h2 className={page.sectionTitle}>많이 사용한 선수</h2>
              <div className={t.wrap}>
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th className={`${t.left} ${t.sticky}`}>선수</th>
                      <th className={t.left}>팀</th>
                      <th>판수</th>
                      <th>승률</th>
                      <th>KDA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPlayers.map((p) => (
                      <tr key={p.id}>
                        <td className={`${t.left} ${t.sticky}`}>
                          <Link href={`/players/${p.id}`} className={t.name}>
                            {playerLabel(players.get(p.id).name)}
                          </Link>
                        </td>
                        <td className={t.left}>
                          {p.team && (
                            <span className={t.name}>
                              <TeamLogo team={p.team} size={20} />
                              <small>{p.team.short || p.team.name}</small>
                            </span>
                          )}
                        </td>
                        <td>{p.games}</td>
                        <td>{winRate(p.wins, p.games)}</td>
                        <td className={t.strong}>{kda(kdaOf(p))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
