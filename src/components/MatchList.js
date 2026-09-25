import MatchRow from './MatchRow';
import { formatDate, kstDateKey } from '@/lib/format';
import styles from './MatchList.module.css';

// 경기들을 한국 날짜별로 묶어서 표시
export default function MatchList({ matches, showTournament = false, withYear = false }) {
  const days = [];
  for (const match of matches) {
    const key = kstDateKey(match.start_time);
    if (days.at(-1)?.key !== key) days.push({ key, matches: [] });
    days.at(-1).matches.push(match);
  }

  return (
    <div className={styles.list}>
      {days.map((day) => (
        <section key={day.key} className={styles.day}>
          <h3 className={styles.date}>{formatDate(day.matches[0].start_time, { withYear })}</h3>
          <div className={styles.card}>
            {day.matches.map((m) => (
              <MatchRow key={m.id} match={m} showTournament={showTournament} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
