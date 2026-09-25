import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import YearTabs from '@/components/YearTabs';
import { supabase } from '@/lib/supabase';
import { check, getPlayerMap, getTeamMap, getYears, pickYear } from '@/lib/queries';
import { playerLabel } from '@/lib/labels';
import { kda, num, winRate, ROLE_LABELS, ROLE_ORDER } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';

export const metadata = { title: '선수 통계' };

const MIN_GAMES = 5; // 표본이 너무 적은 선수는 제외

// 정렬 가능한 열: [키, 제목, 값 꺼내기]  (Perfect KDA 는 가장 위로)
const SORTS = [
  ['games', '세트', (r) => r.games],
  ['winrate', '승률', (r) => r.wins / r.games],
  ['kda', 'KDA', (r) => (r.kda == null ? Infinity : Number(r.kda))],
  ['kp', '킬관여', (r) => Number(r.kill_participation ?? 0)],
  ['cs', 'CS/분', (r) => Number(r.cs_per_min ?? 0)],
  ['gold', '골드/분', (r) => Number(r.gold_per_min ?? 0)],
  ['damage', '딜량/분', (r) => Number(r.damage_per_min ?? 0)],
];

// /players?year=2026&role=mid&sort=kda
export default async function PlayersPage({ searchParams }) {
  const params = await searchParams;
  const years = await getYears();
  const year = pickYear(years, params.year);
  const role = ROLE_ORDER.includes(params.role) ? params.role : null;
  const [sortKey, , sortValue] = SORTS.find(([key]) => key === params.sort) ?? SORTS[2];

  let query = supabase.from('player_season_stats').select('*').eq('year', year).gte('games', MIN_GAMES);
  if (role) query = query.eq('role', role);
  const [rows, teams, players] = await Promise.all([query.then(check), getTeamMap(), getPlayerMap()]);
  rows.sort((a, b) => sortValue(b) - sortValue(a));

  const link = (changes) => {
    const q = new URLSearchParams({ year: String(year), ...(role && { role }), sort: sortKey, ...changes });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/players?${q}`;
  };

  return (
    <div className={`container ${page.page}`}>
      <h1 className={page.title}>선수 통계</h1>
      <p className={page.desc}>
        {year}년 LCK 전체 경기 기준 · {MIN_GAMES}세트 이상 출전
        {year === 2020 && ' · 2020년은 딜량 기록이 일부만 있어요'}
      </p>
      <YearTabs basePath="/players" years={years} year={year} params={{ ...(role && { role }), sort: sortKey }} />

      <nav className={page.filters} aria-label="포지션 선택">
        <Link href={link({ role: '' })} className={role ? page.chip : page.activeChip}>
          전체
        </Link>
        {ROLE_ORDER.map((r) => (
          <Link key={r} href={link({ role: r })} className={r === role ? page.activeChip : page.chip}>
            {ROLE_LABELS[r]}
          </Link>
        ))}
      </nav>

      {rows.length ? (
        <div className={t.wrap}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.left}>#</th>
                <th className={`${t.left} ${t.sticky}`}>선수</th>
                <th className={t.left}>팀</th>
                <th className={t.left}>포지션</th>
                {SORTS.map(([key, label]) => (
                  <th key={key}>
                    <Link href={link({ sort: key })} className={key === sortKey ? t.sorted : t.sortLink}>
                      {label}
                      {key === sortKey && ' ▼'}
                    </Link>
                  </th>
                ))}
                <th>K / D / A</th>
                <th>챔피언 수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const team = teams.get(r.team_id);
                return (
                  <tr key={r.player_id}>
                    <td className={`${t.left} ${t.rank}`}>{i + 1}</td>
                    <td className={`${t.left} ${t.sticky}`}>
                      <Link href={`/players/${r.player_id}?year=${year}`} className={t.name}>
                        {playerLabel(players.get(r.player_id).name)}
                      </Link>
                    </td>
                    <td className={t.left}>
                      <Link href={`/teams/${team.id}?year=${year}`} className={t.name}>
                        <TeamLogo team={team} size={20} />
                        <small>{team.short || team.name}</small>
                      </Link>
                    </td>
                    <td className={t.left}>{ROLE_LABELS[r.role]}</td>
                    <td>{r.games}</td>
                    <td>{winRate(r.wins, r.games)}</td>
                    <td className={t.strong}>{kda(r.kda)}</td>
                    <td>{r.kill_participation == null ? '-' : `${num(r.kill_participation, 1)}%`}</td>
                    <td>{num(r.cs_per_min, 1)}</td>
                    <td>{num(r.gold_per_min)}</td>
                    <td>{num(r.damage_per_min)}</td>
                    <td className={t.muted}>
                      {num(r.avg_kills, 1)} / {num(r.avg_deaths, 1)} / {num(r.avg_assists, 1)}
                    </td>
                    <td>{r.champion_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={page.empty}>조건에 맞는 선수가 없어요.</p>
      )}
    </div>
  );
}
