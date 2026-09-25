import { matchPrediction } from '@/lib/supabase';
import styles from './PredictionBar.module.css';

// AI 경기 전 예측 승률 막대: [팀1 64% ■■■■■■□□□□ 36% 팀2]
export default function PredictionBar({ match }) {
  const pred = matchPrediction(match);
  if (!pred) return null;
  const p1 = Math.round(pred.team1Prob * 100);

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span>AI 경기 전 예측</span>
        {pred.hit !== null && (
          <b className={pred.hit ? styles.hit : styles.miss}>{pred.hit ? '적중' : '빗나감'}</b>
        )}
      </div>
      <div className={styles.labels}>
        <span className={p1 >= 50 ? styles.fav : undefined}>
          {match.team1.short || match.team1.name} {p1}%
        </span>
        <span className={p1 < 50 ? styles.fav : undefined}>
          {100 - p1}% {match.team2.short || match.team2.name}
        </span>
      </div>
      <div className={styles.bar}>
        <div className={styles.team1} style={{ width: `${p1}%` }} />
        <div className={styles.team2} />
      </div>
      <p className={styles.note}>선수 Elo 기준 · 각 팀 직전 경기 선발 명단으로 계산</p>
    </div>
  );
}
