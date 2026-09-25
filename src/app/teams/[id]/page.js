import Link from 'next/link';
import { notFound } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import MatchList from '@/components/MatchList';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import { check, fetchAll, getPlayerMap, getTournamentIds } from '@/lib/queries';
import { playerLabel } from '@/lib/labels';
import { duration, kda, num, signed, winRate, ROLE_LABELS, ROLE_ORDER } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';

async function getTeam(id) {
  if (!Number(id)) return null;
  return check(await supabase.from('teams').select('*').eq('id', id).maybeSingle());
}

export async function generateMetadata({ params }) {
  const team = await getTeam((await params).id);
  return { title: team ? team.name : '팀 없음' };
}

// 그해 이 팀 소속으로 뛴 선수별 기록 (세트 단위 기록을 합산)
function buildRoster(rows, players) {
  const byPlayer = new Map();
  for (const r of rows) {
    const p = byPlayer.get(r.player_id) ?? { player: players.get(r.player_id), roles: {}, games: 0, wins: 0, k: 0, d: 0, a: 0 };
    p.games++;
    p.wins += r.win ? 1 : 0;
    p.k += r.kills;
    p.d += r.deaths;
    p.a += r.assists;
    p.roles[r.role] = (p.roles[r.role] ?? 0) + 1;
    byPlayer.set(r.player_id, p);
  }
  return [...byPlayer.values()]
    .map((p) => ({
      ...p,
      role: Object.entries(p.roles).sort((a, b) => b[1] - a[1])[0][0],
      kda: p.d ? (p.k + p.a) / p.d : null,
    }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.games - a.games);
}

// /teams/3?year=2026
export default async function TeamPage({ params, searchParams }) {
  const team = await getTeam((await params).id);
  if (!team) notFound();

  const [seasons, previousNames] = await Promise.all([
    supabase.from('team_season_stats').select('*').eq('team_id', team.id).order('year', { ascending: false }).then(check),
    supabase.from('teams').select('id, name').eq('renamed_to', team.name).then(check),
  ]);
  const nextTeam = team.renamed_to
    ? check(await supabase.from('teams').select('id, name').eq('name', team.renamed_to).maybeSingle())
    : null;

  const years = seasons.map((s) => s.year);
  const { year: yearParam } = await searchParams;
  const year = years.includes(Number(yearParam)) ? Number(yearParam) : years[0];
  const season = seasons.find((s) => s.year === year);

  const [rosterRows, players, matches] = year
    ? await Promise.all([
        fetchAll(() =>
          supabase
            .from('player_game_rows')
            .select('player_id, role, win, kills, deaths, assists')
            .eq('team_id', team.id)
            .eq('year', year),
        ),
        getPlayerMap(),
        getTournamentIds(year).then((ids) =>
          supabase
            .from('matches')
            .select(MATCH_COLUMNS)
            .in('tournament_id', ids)
            .or(`team1_id.eq.${team.id},team2_id.eq.${team.id}`)
            .order('start_time', { ascending: false })
            .then(check),
        ),
      ])
    : [[], new Map(), []];
  const roster = buildRoster(rosterRows, players);

  return (
    <div className={`container ${page.page}`}>
      <Link href={`/teams?year=${year ?? ''}`} className={page.back}>
        ← 팀 통계
      </Link>

      <section className={page.profile}>
        <TeamLogo team={team} size={72} />
        <div>
          <h1>{team.name}</h1>
          {(previousNames.length > 0 || nextTeam) && (
            <p>
              {previousNames.length > 0 && (
                <>
                  이전 이름:{' '}
                  {previousNames.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ', '}
                      <Link href={`/teams/${p.id}`}>{p.name}</Link>
                    </span>
                  ))}
                </>
              )}
              {previousNames.length > 0 && nextTeam && ' · '}
              {nextTeam && (
                <>
                  현재 이름: <Link href={`/teams/${nextTeam.id}`}>{nextTeam.name}</Link>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {!season ? (
        <p className={page.empty}>2020년 이후 LCK 경기 기록이 없어요.</p>
      ) : (
        <>
          <nav className={page.filters} aria-label="연도 선택">
            {years.map((y) => (
              <Link key={y} href={`/teams/${team.id}?year=${y}`} className={y === year ? page.activeChip : page.chip}>
                {y}
              </Link>
            ))}
          </nav>

          <div className={page.cards}>
            <div className={page.card}>
              <span>매치</span>
              <b>
                {season.match_wins}승 {season.matches - season.match_wins}패
              </b>
            </div>
            <div className={page.card}>
              <span>세트 승률</span>
              <b>{winRate(season.wins, season.games)}</b>
              <small>
                {season.wins}-{season.games - season.wins}
              </small>
            </div>
            <div className={page.card}>
              <span>평균 킬 / 데스</span>
              <b>
                {num(season.avg_kills, 1)} / {num(season.avg_deaths, 1)}
              </b>
            </div>
            <div className={page.card}>
              <span>평균 경기 시간</span>
              <b>{duration(season.avg_duration_sec)}</b>
            </div>
            {season.avg_gold_diff_15 != null && (
              <div className={page.card}>
                <span>15분 골드 차</span>
                <b>{signed(season.avg_gold_diff_15)}</b>
              </div>
            )}
            <div className={page.card}>
              <span>블루 / 레드 승률</span>
              <b>{winRate(season.blue_wins, season.blue_games)}</b>
              <small>/ {winRate(season.wins - season.blue_wins, season.games - season.blue_games)}</small>
            </div>
          </div>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>{year} 로스터</h2>
            <div className={t.wrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th className={`${t.left} ${t.sticky}`}>선수</th>
                    <th className={t.left}>포지션</th>
                    <th>세트</th>
                    <th>승률</th>
                    <th>KDA</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p) => (
                    <tr key={p.player.id}>
                      <td className={`${t.left} ${t.sticky}`}>
                        <Link href={`/players/${p.player.id}?year=${year}`} className={t.name}>
                          {playerLabel(p.player.name)}
                        </Link>
                      </td>
                      <td className={t.left}>{ROLE_LABELS[p.role]}</td>
                      <td>{p.games}</td>
                      <td>{winRate(p.wins, p.games)}</td>
                      <td className={t.strong}>{kda(p.kda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>{year} 경기</h2>
            <MatchList matches={matches} showTournament />
          </section>

          <section className={page.section}>
            <h2 className={page.sectionTitle}>연도별 성적</h2>
            <div className={t.wrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th className={t.left}>연도</th>
                    <th>매치</th>
                    <th>세트</th>
                    <th>세트 승률</th>
                    <th>평균 킬</th>
                    <th>평균 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => (
                    <tr key={s.year}>
                      <td className={t.left}>
                        <Link href={`/teams/${team.id}?year=${s.year}`} className={t.name}>
                          {s.year}
                        </Link>
                      </td>
                      <td>
                        {s.match_wins}승 {s.matches - s.match_wins}패
                      </td>
                      <td>
                        {s.wins}-{s.games - s.wins}
                      </td>
                      <td className={t.strong}>{winRate(s.wins, s.games)}</td>
                      <td>{num(s.avg_kills, 1)}</td>
                      <td>{duration(s.avg_duration_sec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
