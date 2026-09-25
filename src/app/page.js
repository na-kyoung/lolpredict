import Link from 'next/link';
import MatchList from '@/components/MatchList';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import styles from './page.module.css';

// 데이터는 하루 한 번 수집되므로 1시간마다 새로 만들면 충분
export const revalidate = 3600;

export default async function HomePage() {
  const now = new Date().toISOString();
  const [upcoming, recent] = await Promise.all([
    supabase
      .from('matches')
      .select(MATCH_COLUMNS)
      .eq('state', 'unstarted')
      .gte('start_time', now)
      .order('start_time', { ascending: true })
      .limit(6),
    supabase
      .from('matches')
      .select(MATCH_COLUMNS)
      .eq('state', 'completed')
      .order('start_time', { ascending: false })
      .limit(8),
  ]);
  if (upcoming.error) throw new Error(upcoming.error.message);
  if (recent.error) throw new Error(recent.error.message);

  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero}>
        <h1>
          LCK의 모든 경기를
          <br />
          <em>기록하고 예측합니다</em>
        </h1>
        <p>2020년부터 지금까지의 경기 결과, 팀·선수·챔피언 통계, 그리고 AI 승부예측</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>다가오는 경기</h2>
        </div>
        {upcoming.data.length ? (
          <MatchList matches={upcoming.data} showTournament />
        ) : (
          <p className={styles.empty}>예정된 LCK 경기가 없어요. 다음 시즌 일정이 나오면 여기에 표시돼요.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>최근 결과</h2>
          <Link href="/matches">전체 일정·결과 →</Link>
        </div>
        <MatchList matches={recent.data} showTournament withYear />
      </section>
    </div>
  );
}
