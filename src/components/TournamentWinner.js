import TeamLogo from './TeamLogo';
import { formatDate } from '@/lib/format';
import styles from './TournamentWinner.module.css';

// 정규시즌 대회 이름 (결승이 없어서 1위를 보여줌): "LCK 2021 Spring", "LCK 2026 Rounds 1-2"
const REGULAR_SEASON = /(Spring|Summer)$|Rounds \d/;

// 매치 목록으로 순위 계산: 매치 승수 → 세트 득실 순
function standings(matches) {
  const table = new Map();
  for (const m of matches) {
    if (m.state !== 'completed') continue;
    for (const [team, own, opp] of [
      [m.team1, m.team1_score, m.team2_score],
      [m.team2, m.team2_score, m.team1_score],
    ]) {
      const row = table.get(team.id) ?? { team, wins: 0, losses: 0, setDiff: 0 };
      if (m.winner_id === team.id) row.wins++;
      else row.losses++;
      row.setDiff += (own ?? 0) - (opp ?? 0);
      table.set(team.id, row);
    }
  }
  return [...table.values()].sort((a, b) => b.wins - a.wins || b.setDiff - a.setDiff);
}

// 대회 우승팀(결승 승자) 또는 정규시즌 1위. 둘 다 아니거나 아직 진행 중이면 표시 안 함
// earlierRounds: 2025~ 정규시즌은 "Rounds 1-2" + "Rounds 3-4(3-5)" 합산 순위라서, 3라운드 이후 대회에는 앞 라운드 매치를 함께 받음
export default function TournamentWinner({ tournament, matches, earlierRounds = [] }) {
  const final = matches.find((m) => m.stage === 'Finals' && m.state === 'completed');
  if (final) {
    const winner = final.winner_id === final.team1.id ? final.team1 : final.team2;
    const loser = winner === final.team1 ? final.team2 : final.team1;
    const [ws, ls] = winner === final.team1 ? [final.team1_score, final.team2_score] : [final.team2_score, final.team1_score];
    return (
      <Banner label="우승" team={winner}>
        결승 {ws}:{ls} vs {loser.short || loser.name} · {formatDate(final.start_time)}
      </Banner>
    );
  }

  const finished = matches.length > 0 && matches.every((m) => m.state === 'completed');
  if (finished && REGULAR_SEASON.test(tournament.name)) {
    const [top] = standings([...earlierRounds, ...matches]);
    const label = /Rounds 1-2/.test(tournament.name)
      ? '1-2라운드 1위'
      : earlierRounds.length
        ? '정규시즌 1위 (전체 라운드 합산)'
        : '정규시즌 1위';
    return (
      <Banner label={label} team={top.team}>
        {top.wins}승 {top.losses}패 · 세트 득실 {top.setDiff > 0 ? '+' : ''}
        {top.setDiff}
      </Banner>
    );
  }
  return null;
}

function Banner({ label, team, children }) {
  return (
    <section className={styles.banner}>
      <TeamLogo team={team} size={56} />
      <div className={styles.text}>
        <span className={styles.label}>{label}</span>
        <b className={styles.name}>{team.name}</b>
        <span className={styles.detail}>{children}</span>
      </div>
    </section>
  );
}
