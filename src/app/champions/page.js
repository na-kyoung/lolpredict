import Link from 'next/link';
import ChampionIcon from '@/components/ChampionIcon';
import YearTabs from '@/components/YearTabs';
import { supabase } from '@/lib/supabase';
import { check, getYears, pickYear } from '@/lib/queries';
import { getChampions } from '@/lib/ddragon';
import { kda, winRate, ROLE_LABELS, ROLE_ORDER } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';

export const metadata = { title: '챔피언 통계' };

const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '-');
// 승률·KDA 정렬 때 이보다 적게 픽된 챔피언은 아래로 (1판 100% 가 1위가 되지 않게)
const MIN_PICKS = 5;
const RATE_SORTS = ['winrate', 'kda'];
const kdaValue = (r) => (Number(r.deaths) ? (Number(r.kills) + Number(r.assists)) / Number(r.deaths) : null);

// 정렬 가능한 열: [키, 제목, 값 꺼내기, 전체 보기에서만 표시]
const SORTS = [
  ['pickban', '픽밴률', (r) => r.picks + r.bans, true],
  ['picks', '픽', (r) => r.picks],
  ['bans', '밴', (r) => r.bans, true],
  ['winrate', '승률', (r) => (r.picks ? r.wins / r.picks : -1)],
  ['kda', 'KDA', (r) => kdaValue(r) ?? (r.picks ? Infinity : -1)],
];

// /champions?year=2026&role=mid&sort=picks
export default async function ChampionsPage({ searchParams }) {
  const params = await searchParams;
  const years = await getYears();
  const year = pickYear(years, params.year);
  const role = ROLE_ORDER.includes(params.role) ? params.role : null;
  const sorts = SORTS.filter(([, , , allOnly]) => !(role && allOnly));
  const [sortKey, , sortValue] = sorts.find(([key]) => key === params.sort) ?? sorts[0];

  const [seasonRows, roleRows, champion] = await Promise.all([
    supabase.from('champion_season_stats').select('*').eq('year', year).then(check),
    role
      ? supabase.from('champion_role_stats').select('*').eq('year', year).eq('role', role).then(check)
      : Promise.resolve(null),
    getChampions(),
  ]);
  const totalGames = seasonRows[0]?.total_games ?? 0;
  // 포지션을 고르면 그 포지션 픽 기준 (밴은 포지션 구분이 없어서 제외)
  const rows = (roleRows ?? seasonRows).map((r) => ({ ...r, bans: r.bans ?? 0 }));
  const rateSort = RATE_SORTS.includes(sortKey);
  const enough = (r) => !rateSort || r.picks >= MIN_PICKS;
  rows.sort((a, b) => enough(b) - enough(a) || sortValue(b) - sortValue(a) || b.picks - a.picks);

  const link = (changes) => {
    const q = new URLSearchParams({ year: String(year), ...(role && { role }), sort: sortKey, ...changes });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/champions?${q}`;
  };

  return (
    <div className={`container ${page.page}`}>
      <h1 className={page.title}>챔피언 통계</h1>
      <p className={page.desc}>
        {year}년 LCK 전체 {totalGames.toLocaleString('ko-KR')}세트 기준 · 픽률·밴률은 전체 세트 대비
        {rateSort && ` · ${MIN_PICKS}픽 미만은 아래에 흐리게 표시`}
      </p>
      <YearTabs basePath="/champions" years={years} year={year} params={{ ...(role && { role }) }} />

      <nav className={page.filters} aria-label="포지션 선택">
        <Link href={link({ role: '', sort: '' })} className={role ? page.chip : page.activeChip}>
          전체
        </Link>
        {ROLE_ORDER.map((r) => (
          <Link key={r} href={link({ role: r, sort: '' })} className={r === role ? page.activeChip : page.chip}>
            {ROLE_LABELS[r]}
          </Link>
        ))}
      </nav>

      <div className={t.wrap}>
        <table className={t.table}>
          <thead>
            <tr>
              <th className={t.left}>#</th>
              <th className={`${t.left} ${t.sticky}`}>챔피언</th>
              {sorts.map(([key, label]) => (
                <th key={key}>
                  <Link href={link({ sort: key })} className={key === sortKey ? t.sorted : t.sortLink}>
                    {label}
                    {key === sortKey && ' ▼'}
                  </Link>
                </th>
              ))}
              <th>픽률</th>
              {!role && <th>밴률</th>}
              {!role && <th className={t.left}>주 포지션</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const champ = champion(r.champion);
              const nameCell = (
                <>
                  <ChampionIcon champ={champ} size={28} />
                  {champ.name}
                </>
              );
              return (
                <tr key={r.champion} className={enough(r) ? undefined : t.muted}>
                  <td className={`${t.left} ${t.rank}`}>{i + 1}</td>
                  <td className={`${t.left} ${t.sticky}`}>
                    {champ.id ? (
                      <Link href={`/champions/${champ.id}?year=${year}`} className={t.name}>
                        {nameCell}
                      </Link>
                    ) : (
                      <span className={t.name}>{nameCell}</span>
                    )}
                  </td>
                  {sorts.map(([key]) => (
                    <td key={key} className={key === sortKey ? t.strong : undefined}>
                      {key === 'pickban' && pct(r.picks + r.bans, totalGames)}
                      {key === 'picks' && r.picks}
                      {key === 'bans' && r.bans}
                      {key === 'winrate' && winRate(r.wins, r.picks)}
                      {key === 'kda' && (r.picks ? kda(kdaValue(r)) : '-')}
                    </td>
                  ))}
                  <td>{pct(r.picks, totalGames)}</td>
                  {!role && <td>{pct(r.bans, totalGames)}</td>}
                  {!role && <td className={t.left}>{r.main_role ? ROLE_LABELS[r.main_role] : '-'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
