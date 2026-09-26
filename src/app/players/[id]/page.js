import Link from 'next/link';
import { notFound } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import ChampionIcon from '@/components/ChampionIcon';
import { supabase } from '@/lib/supabase';
import { check, fetchAll, getTeamMap, pickComp } from '@/lib/queries';
import CompTabs from '@/components/CompTabs';
import { getChampions } from '@/lib/ddragon';
import { formatDate } from '@/lib/format';
import { playerLabel } from '@/lib/labels';
import { kda, num, winRate, ROLE_LABELS } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';

async function getPlayer(id) {
  if (!Number(id)) return null;
  return check(await supabase.from('players').select('*').eq('id', id).maybeSingle());
}

export async function generateMetadata({ params }) {
  const player = await getPlayer((await params).id);
  return { title: player ? playerLabel(player.name) : '선수 없음' };
}

// 세트 기록을 챔피언별로 합산
function championPool(rows) {
  const byChamp = new Map();
  for (const r of rows) {
    const c = byChamp.get(r.champion) ?? { champion: r.champion, games: 0, wins: 0, k: 0, d: 0, a: 0 };
    c.games++;
    c.wins += r.win ? 1 : 0;
    c.k += r.kills;
    c.d += r.deaths;
    c.a += r.assists;
    byChamp.set(r.champion, c);
  }
  return [...byChamp.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

// /players/5?comp=intl&year=2026
export default async function PlayerPage({ params, searchParams }) {
  const player = await getPlayer((await params).id);
  if (!player) notFound();

  const [allSeasons, teams, champion, rating] = await Promise.all([
    supabase.from('player_season_stats').select('*').eq('player_id', player.id).order('year', { ascending: false }).then(check),
    getTeamMap(),
    getChampions(),
    supabase.from('player_ratings').select('rating').eq('player_id', player.id).maybeSingle().then(check),
  ]);
  // LCK / 국제대회 중 기록이 있는 것만 선택 가능 (해외 선수는 국제대회만)
  const query = await searchParams;
  const comps = ['lck', 'intl'].filter((c) => allSeasons.some((s) => s.competition === c));
  const comp = comps.includes(pickComp(query.comp)) ? pickComp(query.comp) : (comps[0] ?? 'lck');
  const seasons = allSeasons.filter((s) => s.competition === comp);
  const compParam = comp === 'intl' ? { comp } : {};
  const href = (extra) => `/players/${player.id}?${new URLSearchParams({ ...compParam, ...extra })}`;

  const years = seasons.map((s) => s.year);
  const year = years.includes(Number(query.year)) ? Number(query.year) : years[0];
  const season = seasons.find((s) => s.year === year);
  const latest = allSeasons[0];
  const latestTeam = latest ? teams.get(latest.team_id) : null;

  const games = season
    ? await fetchAll(() =>
        supabase
          .from('player_game_rows')
          .select('match_id, team_id, champion, win, kills, deaths, assists, start_time')
          .eq('player_id', player.id)
          .eq('year', year)
          .eq('competition', comp)
          .order('start_time', { ascending: false }),
      )
    : [];
  const pool = championPool(games);

  return (
    <div className={`container ${page.page}`}>
      <Link href={`/players?${new URLSearchParams({ ...compParam, ...(year && { year }) })}`} className={page.back}>
        ← 선수 통계
      </Link>

      <section className={page.profile}>
        {latestTeam && <TeamLogo team={latestTeam} size={64} />}
        <div>
          <h1>{playerLabel(player.name)}</h1>
          {latest && (
            <p>
              {ROLE_LABELS[latest.role]} ·{' '}
              <Link href={`/teams/${latestTeam.id}?year=${latest.year}`}>{latestTeam.name}</Link>
            </p>
          )}
        </div>
      </section>

      {!season ? (
        <p className={page.empty}>기록이 없어요.</p>
      ) : (
        <>
          <CompTabs comp={comp} available={comps} href={(c) => `/players/${player.id}${c === 'intl' ? '?comp=intl' : ''}`} />
          <nav className={page.filters} aria-label="연도 선택">
            {years.map((y) => (
              <Link key={y} href={href({ year: y })} className={y === year ? page.activeChip : page.chip}>
                {y}
              </Link>
            ))}
          </nav>

          <div className={page.cards}>
            {rating && (
              <div className={page.card}>
                <span>선수 Elo (현재)</span>
                <b>{Math.round(rating.rating)}</b>
                <small>
                  <Link href="/predict">평균 1500</Link>
                </small>
              </div>
            )}
            <div className={page.card}>
              <span>세트 · 승률</span>
              <b>{winRate(season.wins, season.games)}</b>
              <small>{season.games}세트</small>
            </div>
            <div className={page.card}>
              <span>KDA</span>
              <b>{kda(season.kda)}</b>
              <small>
                {num(season.avg_kills, 1)}/{num(season.avg_deaths, 1)}/{num(season.avg_assists, 1)}
              </small>
            </div>
            <div className={page.card}>
              <span>킬관여</span>
              <b>{season.kill_participation == null ? '-' : `${num(season.kill_participation, 1)}%`}</b>
            </div>
            <div className={page.card}>
              <span>분당 CS</span>
              <b>{num(season.cs_per_min, 1)}</b>
            </div>
            <div className={page.card}>
              <span>분당 딜량</span>
              <b>{num(season.damage_per_min)}</b>
            </div>
            <div className={page.card}>
              <span>분당 골드</span>
              <b>{num(season.gold_per_min)}</b>
            </div>
          </div>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>
              {year} 챔피언 <small className={t.muted}>{pool.length}개</small>
            </h2>
            <div className={t.wrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th className={`${t.left} ${t.sticky}`}>챔피언</th>
                    <th>세트</th>
                    <th>승률</th>
                    <th>KDA</th>
                    <th>K / D / A</th>
                  </tr>
                </thead>
                <tbody>
                  {pool.map((c) => {
                    const champ = champion(c.champion);
                    return (
                      <tr key={c.champion}>
                        <td className={`${t.left} ${t.sticky}`}>
                          <span className={t.name}>
                            <ChampionIcon champ={champ} size={28} />
                            {champ.name}
                          </span>
                        </td>
                        <td>{c.games}</td>
                        <td>{winRate(c.wins, c.games)}</td>
                        <td className={t.strong}>{kda(c.d ? (c.k + c.a) / c.d : null)}</td>
                        <td className={t.muted}>
                          {(c.k / c.games).toFixed(1)} / {(c.d / c.games).toFixed(1)} / {(c.a / c.games).toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>최근 경기</h2>
            <div className={t.wrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th className={t.left}>날짜</th>
                    <th className={t.left}>챔피언</th>
                    <th className={t.left}>결과</th>
                    <th>K / D / A</th>
                    <th className={t.left}>팀</th>
                  </tr>
                </thead>
                <tbody>
                  {games.slice(0, 15).map((g, i) => {
                    const champ = champion(g.champion);
                    const team = teams.get(g.team_id);
                    return (
                      <tr key={i}>
                        <td className={t.left}>
                          <Link href={`/matches/${g.match_id}`} className={t.name}>
                            {formatDate(g.start_time)}
                          </Link>
                        </td>
                        <td className={t.left}>
                          <span className={t.name}>
                            <ChampionIcon champ={champ} size={24} />
                            {champ.name}
                          </span>
                        </td>
                        <td className={`${t.left} ${g.win ? t.plus : t.minus}`}>{g.win ? '승' : '패'}</td>
                        <td>
                          {g.kills} / {g.deaths} / {g.assists}
                        </td>
                        <td className={t.left}>{team?.short || team?.name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>연도별 기록</h2>
            <div className={t.wrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th className={t.left}>연도</th>
                    <th className={t.left}>팀</th>
                    <th>세트</th>
                    <th>승률</th>
                    <th>KDA</th>
                    <th>킬관여</th>
                    <th>CS/분</th>
                    <th>딜량/분</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => {
                    const team = teams.get(s.team_id);
                    return (
                      <tr key={s.year}>
                        <td className={t.left}>
                          <Link href={href({ year: s.year })} className={t.name}>
                            {s.year}
                          </Link>
                        </td>
                        <td className={t.left}>{team?.short || team?.name}</td>
                        <td>{s.games}</td>
                        <td>{winRate(s.wins, s.games)}</td>
                        <td className={t.strong}>{kda(s.kda)}</td>
                        <td>{s.kill_participation == null ? '-' : `${num(s.kill_participation, 1)}%`}</td>
                        <td>{num(s.cs_per_min, 1)}</td>
                        <td>{num(s.damage_per_min)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
