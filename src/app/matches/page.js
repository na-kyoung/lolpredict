import Link from 'next/link';
import MatchList from '@/components/MatchList';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import { tournamentLabel } from '@/lib/labels';
import styles from './page.module.css';

export const metadata = { title: '일정·결과' };

// /matches?year=2026&t=12  (연도·대회를 고르지 않으면 가장 최근 대회)
export default async function MatchesPage({ searchParams }) {
  const params = await searchParams;

  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('id, name, year, start_date')
    .order('start_date', { ascending: true });
  if (error) throw new Error(error.message);

  const years = [...new Set(tournaments.map((t) => t.year))].sort((a, b) => b - a);
  const year = years.includes(Number(params.year)) ? Number(params.year) : years[0];
  const yearTournaments = tournaments.filter((t) => t.year === year);
  const selected =
    yearTournaments.find((t) => t.id === Number(params.t)) ?? yearTournaments.at(-1);

  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('tournament_id', selected.id)
    .order('start_time', { ascending: true });
  if (matchError) throw new Error(matchError.message);

  return (
    <div className={`container ${styles.page}`}>
      <h1 className={styles.title}>일정·결과</h1>

      <nav className={styles.years} aria-label="연도 선택">
        {years.map((y) => (
          <Link key={y} href={`/matches?year=${y}`} className={y === year ? styles.activeYear : styles.year}>
            {y}
          </Link>
        ))}
      </nav>

      <nav className={styles.tabs} aria-label="대회 선택">
        {yearTournaments.map((t) => (
          <Link
            key={t.id}
            href={`/matches?year=${year}&t=${t.id}`}
            className={t.id === selected.id ? styles.activeTab : styles.tab}
          >
            {tournamentLabel(t.name)}
          </Link>
        ))}
      </nav>

      {matches.length ? (
        <MatchList matches={matches} />
      ) : (
        <p className={styles.empty}>경기가 없어요.</p>
      )}
    </div>
  );
}
