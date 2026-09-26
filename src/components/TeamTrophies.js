import Link from 'next/link';
import { tournamentLabel } from '@/lib/labels';
import styles from './TeamTrophies.module.css';

// 구단의 우승·준우승 기록 (LCK + 국제대회). finals: 이 구단이 뛴 결승 매치 (최신순)
// teamIds: 구단의 모든 팀 id (시즌 중 이름이 바뀐 경우 포함)
export default function TeamTrophies({ finals, teamIds }) {
  const ids = new Set(teamIds);
  const records = finals.map((m) => {
    const ours = ids.has(m.team1.id) ? m.team1 : m.team2;
    const opp = ours === m.team1 ? m.team2 : m.team1;
    const [own, other] = ours === m.team1 ? [m.team1_score, m.team2_score] : [m.team2_score, m.team1_score];
    return {
      match: m,
      won: m.winner_id === ours.id,
      year: m.start_time.slice(0, 4),
      title: tournamentLabel(m.tournament.name),
      score: `${own}:${other}`,
      opp,
    };
  });
  if (!records.length) return null;
  const wins = records.filter((r) => r.won).length;

  // 목록이 길어서 기본은 접어 두고, 버튼(summary)을 누르면 펼침 (<details> 라 JS 불필요)
  return (
    <details className={styles.details}>
      <summary className={styles.toggle}>
        <span className={styles.toggleTitle}>우승 기록</span>
        <span className={styles.summary}>
          <b>우승 {wins}회</b> · 준우승 {records.length - wins}회
        </span>
        <span className={styles.arrow} aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className={styles.list}>
        {records.map((r) => (
          <li key={r.match.id}>
            <Link href={`/matches/${r.match.id}`} className={styles.row}>
              <span className={r.won ? styles.gold : styles.silver}>{r.won ? '우승' : '준우승'}</span>
              <span className={styles.year}>{r.year}</span>
              <span className={styles.title}>{r.title}</span>
              <span className={styles.detail}>
                결승 {r.score} vs {r.opp.short || r.opp.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
