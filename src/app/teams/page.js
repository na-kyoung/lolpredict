import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import YearTabs from '@/components/YearTabs';
import { supabase } from '@/lib/supabase';
import { check, getTeamMap, getYears, pickYear } from '@/lib/queries';
import { duration, num, signed, winRate } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';

export const metadata = { title: '팀 통계' };

// /teams?year=2026
export default async function TeamsPage({ searchParams }) {
  const params = await searchParams;
  const years = await getYears();
  const year = pickYear(years, params.year);

  const [rows, teams] = await Promise.all([
    supabase.from('team_season_stats').select('*').eq('year', year).then(check),
    getTeamMap(),
  ]);

  // 매치 승수 → 세트 득실 순
  const sorted = rows.sort(
    (a, b) => b.match_wins - a.match_wins || b.wins * 2 - b.games - (a.wins * 2 - a.games),
  );
  const hasGoldDiff = sorted.some((r) => r.avg_gold_diff_15 != null);

  return (
    <div className={`container ${page.page}`}>
      <h1 className={page.title}>팀 통계</h1>
      <p className={page.desc}>{year}년 LCK 전체 경기(컵·정규시즌·플레이오프 등) 기준</p>
      <YearTabs basePath="/teams" years={years} year={year} />

      <div className={t.wrap}>
        <table className={t.table}>
          <thead>
            <tr>
              <th className={t.left}>#</th>
              <th className={`${t.left} ${t.sticky}`}>팀</th>
              <th>매치</th>
              <th>세트</th>
              <th>세트 승률</th>
              <th>평균 킬</th>
              <th>평균 데스</th>
              <th>평균 시간</th>
              {hasGoldDiff && <th>15분 골드 차</th>}
              <th>드래곤</th>
              <th>바론</th>
              <th>블루 승률</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const team = teams.get(r.team_id);
              return (
                <tr key={r.team_id}>
                  <td className={`${t.left} ${t.rank}`}>{i + 1}</td>
                  <td className={`${t.left} ${t.sticky}`}>
                    <Link href={`/teams/${team.id}?year=${year}`} className={t.name}>
                      <TeamLogo team={team} size={24} />
                      {team.name}
                    </Link>
                  </td>
                  <td className={t.strong}>
                    {r.match_wins}승 {r.matches - r.match_wins}패
                  </td>
                  <td>
                    {r.wins}-{r.games - r.wins}
                  </td>
                  <td className={t.strong}>{winRate(r.wins, r.games)}</td>
                  <td>{num(r.avg_kills, 1)}</td>
                  <td>{num(r.avg_deaths, 1)}</td>
                  <td>{duration(r.avg_duration_sec)}</td>
                  {hasGoldDiff && (
                    <td className={r.avg_gold_diff_15 > 0 ? t.plus : r.avg_gold_diff_15 < 0 ? t.minus : undefined}>
                      {signed(r.avg_gold_diff_15)}
                    </td>
                  )}
                  <td>{num(r.avg_dragons, 2)}</td>
                  <td>{num(r.avg_barons, 2)}</td>
                  <td>{winRate(r.blue_wins, r.blue_games)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
