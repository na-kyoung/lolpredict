import { placement } from '@/lib/placement';
import { tournamentLabel } from '@/lib/labels';
import page from './Page.module.css';
import t from './StatTable.module.css';
import styles from './TeamSeasonResults.module.css';

/**
 * 그해 구단이 참가한 대회별 최종 성적 (우승 / 준우승 / N위 / 정규시즌 N위 / 참가)
 * ourMatches: 구단이 뛴 그해 매치 (최신순), allMatches: 그 대회들의 모든 매치, orgIds: 구단의 팀 id 들
 */
export default function TeamSeasonResults({ year, ourMatches, allMatches, orgIds }) {
  const ids = new Set(orgIds);
  const isOurs = (teamId) => ids.has(teamId);

  // 대회 목록: 구단 경기에 나온 순서(최신순) 그대로
  const tournaments = [];
  for (const m of ourMatches) {
    if (!tournaments.some((x) => x.id === m.tournament.id)) tournaments.push(m.tournament);
  }
  if (!tournaments.length) return null;

  const byTournament = (id) => allMatches.filter((m) => m.tournament_id === id);
  // 2025~ 정규시즌: 3라운드 이후 대회는 1-2라운드와 합산 순위
  const firstRounds = tournaments.filter((x) => /Rounds 1-2/.test(x.name)).flatMap((x) => byTournament(x.id));

  const rows = tournaments.map((tour) => {
    const matches = byTournament(tour.id);
    const result = placement(tour, matches, isOurs, /Rounds [3-9]/.test(tour.name) ? firstRounds : []);
    const ours = ourMatches.filter((m) => m.tournament.id === tour.id && m.state === 'completed');
    const wins = ours.filter((m) => isOurs(m.winner_id)).length;
    return { tour, result, wins, losses: ours.length - wins };
  });

  return (
    <section className={page.section}>
      <h2 className={page.sectionTitle}>{year} 대회별 성적</h2>
      <div className={t.wrap}>
        <table className={t.table}>
          <thead>
            <tr>
              <th className={t.left}>대회</th>
              <th className={t.left}>최종 성적</th>
              <th>매치 전적</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ tour, result, wins, losses }) => (
              <tr key={tour.id}>
                <td className={t.left}>{tournamentLabel(tour.name)}</td>
                <td className={t.left}>
                  <span className={styles[result.medal] ?? styles.plain}>{result.label}</span>
                  {result.note && <span className={styles.note}>{result.note}</span>}
                </td>
                <td>
                  {wins}승 {losses}패
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
