import Link from 'next/link';
import MatchList from '@/components/MatchList';
import CompTabs from '@/components/CompTabs';
import NoData from '@/components/NoData';
import TournamentWinner from '@/components/TournamentWinner';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import { pickComp } from '@/lib/queries';
import { tournamentLabel } from '@/lib/labels';
import styles from './page.module.css';

export const metadata = { title: '일정·결과' };

// /matches?comp=intl&year=2026&t=12
// 대회를 고르지 않으면 이미 시작한 대회 중 가장 최근 대회 (없으면 다음 대회)
export default async function MatchesPage({ searchParams }) {
  const params = await searchParams;
  const comp = pickComp(params.comp);

  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('id, name, year, start_date')
    .eq('competition', comp)
    .order('start_date', { ascending: true });
  if (error) throw new Error(error.message);

  if (!tournaments.length) return <NoData title="일정·결과" comp={comp} basePath="/matches" />;

  const years = [...new Set(tournaments.map((t) => t.year))].sort((a, b) => b - a);
  const year = years.includes(Number(params.year)) ? Number(params.year) : years[0];
  const yearTournaments = tournaments.filter((t) => t.year === year);
  const today = new Date().toISOString().slice(0, 10);
  const started = yearTournaments.filter((t) => !t.start_date || t.start_date <= today);
  const selected =
    yearTournaments.find((t) => t.id === Number(params.t)) ?? started.at(-1) ?? yearTournaments[0];

  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('tournament_id', selected.id)
    .order('start_time', { ascending: false }); // 최신순 (결승이 맨 위)
  if (matchError) throw new Error(matchError.message);

  // 2025~ 정규시즌 3라운드 이후 대회면, 순위 합산용으로 같은 해 1-2라운드 매치도 조회
  let earlierRounds = [];
  const earlierIds = /Rounds [3-9]/.test(selected.name)
    ? yearTournaments.filter((t) => /Rounds 1-2/.test(t.name)).map((t) => t.id)
    : [];
  if (earlierIds.length) {
    const { data, error: roundsError } = await supabase
      .from('matches')
      .select(MATCH_COLUMNS)
      .in('tournament_id', earlierIds);
    if (roundsError) throw new Error(roundsError.message);
    earlierRounds = data;
  }

  const q = (extra) => `/matches?${new URLSearchParams({ ...(comp === 'intl' && { comp }), ...extra })}`;

  return (
    <div className={`container ${styles.page}`}>
      <h1 className={styles.title}>일정·결과</h1>

      <div className={styles.comp}>
        <CompTabs comp={comp} href={(c) => `/matches${c === 'intl' ? '?comp=intl' : ''}`} />
      </div>

      <nav className={styles.years} aria-label="연도 선택">
        {years.map((y) => (
          <Link key={y} href={q({ year: y })} className={y === year ? styles.activeYear : styles.year}>
            {y}
          </Link>
        ))}
      </nav>

      <nav className={styles.tabs} aria-label="대회 선택">
        {yearTournaments.map((t) => (
          <Link key={t.id} href={q({ year, t: t.id })} className={t.id === selected.id ? styles.activeTab : styles.tab}>
            {tournamentLabel(t.name)}
          </Link>
        ))}
      </nav>

      <TournamentWinner tournament={selected} matches={matches} earlierRounds={earlierRounds} />

      {matches.length ? (
        <MatchList matches={matches} />
      ) : (
        <p className={styles.empty}>경기가 없어요. 대진이 확정되면 표시돼요.</p>
      )}
    </div>
  );
}
