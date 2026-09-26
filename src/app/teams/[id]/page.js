import Link from 'next/link';
import { notFound } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import MatchList from '@/components/MatchList';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import { check, fetchAll, getPlayerMap, getTournamentIds, pickComp } from '@/lib/queries';
import CompTabs from '@/components/CompTabs';
import TeamTrophies from '@/components/TeamTrophies';
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

// /teams/3?comp=intl&year=2026
export default async function TeamPage({ params, searchParams }) {
  const team = await getTeam((await params).id);
  if (!team) notFound();

  // 같은 구단의 모든 팀 이름 (시즌 중 이름이 바뀌어도 기록을 합쳐서 보여줌)
  const orgId = team.org_id ?? team.id;
  const [allSeasons, orgTeams] = await Promise.all([
    supabase.from('team_season_stats').select('*').eq('org_id', orgId).order('year', { ascending: false }).then(check),
    supabase
      .from('teams')
      .select('id, name, short, image_url, image_url_light')
      .or(`org_id.eq.${orgId},id.eq.${orgId},id.eq.${team.id}`)
      .order('id')
      .then(check),
  ]);
  const orgIds = orgTeams.map((t) => t.id).join(',');
  const nameOf = new Map(orgTeams.map((t) => [t.id, t]));

  // 구단 이름 기록은 각 이름의 첫 경기 순서로 (BRION → Fredit BRION → ...)
  const orgMatches = await fetchAll(() =>
    supabase
      .from('matches')
      .select('start_time, team1_id, team2_id')
      .or(`team1_id.in.(${orgIds}),team2_id.in.(${orgIds})`)
      .order('start_time'),
  );
  const firstSeen = new Map();
  for (const m of orgMatches) {
    for (const id of [m.team1_id, m.team2_id]) if (nameOf.has(id) && !firstSeen.has(id)) firstSeen.set(id, m.start_time);
  }
  orgTeams.sort((a, b) => (firstSeen.get(a.id) ?? '9').localeCompare(firstSeen.get(b.id) ?? '9'));

  // LCK / 국제대회 중 기록이 있는 것만 선택 가능 (해외 팀은 국제대회만)
  const query = await searchParams;
  const comps = ['lck', 'intl'].filter((c) => allSeasons.some((s) => s.competition === c));
  const comp = comps.includes(pickComp(query.comp)) ? pickComp(query.comp) : (comps[0] ?? 'lck');
  const seasons = allSeasons.filter((s) => s.competition === comp);
  const compParam = comp === 'intl' ? { comp } : {};
  const href = (extra) => `/teams/${team.id}?${new URLSearchParams({ ...compParam, ...extra })}`;

  const years = seasons.map((s) => s.year);
  const yearParam = query.year;
  const year = years.includes(Number(yearParam)) ? Number(yearParam) : years[0];
  const season = seasons.find((s) => s.year === year);
  // 그해 마지막으로 쓴 이름·로고로 표시
  const shown = (season && nameOf.get(season.team_id)) || team;

  const [rosterRows, players, matches] = year
    ? await Promise.all([
        fetchAll(() =>
          supabase
            .from('player_game_rows')
            .select('player_id, role, win, kills, deaths, assists')
            .in('team_id', orgTeams.map((t) => t.id))
            .eq('year', year)
            .eq('competition', comp),
        ),
        getPlayerMap(),
        getTournamentIds(year, comp).then((ids) =>
          supabase
            .from('matches')
            .select(MATCH_COLUMNS)
            .in('tournament_id', ids)
            .or(`team1_id.in.(${orgIds}),team2_id.in.(${orgIds})`)
            .order('start_time', { ascending: false })
            .then(check),
        ),
      ])
    : [[], new Map(), []];
  const roster = buildRoster(rosterRows, players);

  // 우승·준우승: 구단이 뛴 모든 결승 (LCK + 국제대회). 월즈 선발전 결승은 우승 개념이 아니라서 제외
  const finals = (
    await supabase
      .from('matches')
      .select(MATCH_COLUMNS)
      .eq('stage', 'Finals')
      .eq('state', 'completed')
      .or(`team1_id.in.(${orgIds}),team2_id.in.(${orgIds})`)
      .order('start_time', { ascending: false })
      .then(check)
  ).filter((m) => !m.tournament.name.includes('Regional Finals'));

  return (
    <div className={`container ${page.page}`}>
      <Link href={`/teams?${new URLSearchParams({ ...compParam, ...(year && { year }) })}`} className={page.back}>
        ← 팀 통계
      </Link>

      <section className={page.profile}>
        <TeamLogo team={shown} size={72} />
        <div>
          <h1>{shown.name}</h1>
          {orgTeams.length > 1 && (
            <p>
              구단 이름 기록:{' '}
              {orgTeams.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ' → '}
                  {t.id === shown.id ? <b>{t.name}</b> : <Link href={`/teams/${t.id}`}>{t.name}</Link>}
                </span>
              ))}
            </p>
          )}
        </div>
      </section>

      <TeamTrophies finals={finals} teamIds={orgTeams.map((t) => t.id)} />

      {!season ? (
        <p className={page.empty}>2020년 이후 경기 기록이 없어요.</p>
      ) : (
        <>
          <CompTabs comp={comp} available={comps} href={(c) => `/teams/${team.id}${c === 'intl' ? '?comp=intl' : ''}`} />
          <nav className={page.filters} aria-label="연도 선택">
            {years.map((y) => (
              <Link key={y} href={href({ year: y })} className={y === year ? page.activeChip : page.chip}>
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
                        <Link href={`/players/${p.player.id}?${new URLSearchParams({ ...compParam, year })}`} className={t.name}>
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
                    <th className={t.left}>팀명</th>
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
                        <Link href={href({ year: s.year })} className={t.name}>
                          {s.year}
                        </Link>
                      </td>
                      <td className={`${t.left} ${t.muted}`}>{nameOf.get(s.team_id)?.name}</td>
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
