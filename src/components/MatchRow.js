import Link from 'next/link';
import TeamLogo from './TeamLogo';
import { formatTime } from '@/lib/format';
import { stageLabel, tournamentLabel } from '@/lib/labels';
import { matchPrediction } from '@/lib/supabase';
import styles from './MatchRow.module.css';

function Team({ team, won, lost, align }) {
  const cls = [styles.team, align === 'right' && styles.right, won && styles.won, lost && styles.lost]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <span className={styles.name}>{team.name}</span>
      <span className={styles.short}>{team.short || team.name}</span>
      <TeamLogo team={team} size={28} />
    </div>
  );
}

// 경기 한 줄: 시간 | 팀1 | 점수 | 팀2 | 단계
export default function MatchRow({ match, showTournament = false }) {
  const done = match.state === 'completed';
  const team1Won = done && match.winner_id === match.team1.id;
  const team2Won = done && match.winner_id === match.team2.id;

  return (
    <Link href={`/matches/${match.id}`} className={styles.row}>
      <span className={styles.time}>{formatTime(match.start_time)}</span>
      <Team team={match.team1} won={team1Won} lost={team2Won} align="right" />
      <span className={styles.score}>
        {done ? (
          <>
            <b className={team1Won ? styles.winScore : undefined}>{match.team1_score}</b>
            <i>:</i>
            <b className={team2Won ? styles.winScore : undefined}>{match.team2_score}</b>
          </>
        ) : (
          <span className={styles.vs}>VS</span>
        )}
      </span>
      <Team team={match.team2} won={team2Won} lost={team1Won} />
      <span className={styles.stage}>
        <span>
          {showTournament && match.tournament ? `${tournamentLabel(match.tournament.name)} · ` : ''}
          {stageLabel(match.stage)}
          {match.best_of ? ` · Bo${match.best_of}` : ''}
        </span>
        <Prediction match={match} />
      </span>
    </Link>
  );
}

// "예측 GEN 64% ✓" (지난 경기) / "예측 GEN 64%" (다가오는 경기)
function Prediction({ match }) {
  const pred = matchPrediction(match);
  if (!pred) return null;
  const cls = pred.hit === null ? styles.pred : pred.hit ? `${styles.pred} ${styles.hit}` : `${styles.pred} ${styles.miss}`;
  return (
    <span className={cls} title="AI 경기 전 예측">
      예측 {pred.favorite.short || pred.favorite.name} {Math.round(pred.prob * 100)}%
      {pred.hit !== null && (pred.hit ? ' ✓' : ' ✗')}
    </span>
  );
}
