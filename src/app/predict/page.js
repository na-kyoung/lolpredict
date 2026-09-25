import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import MatchList from '@/components/MatchList';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import { check, fetchAll, getPlayerMap } from '@/lib/queries';
import { playerLabel } from '@/lib/labels';
import { ROLE_LABELS, ROLE_ORDER } from '@/lib/stats';
import page from '@/components/Page.module.css';
import t from '@/components/StatTable.module.css';
import styles from './page.module.css';

export const metadata = { title: 'AI 승부예측' };

const MODEL = 'player_elo';
const FIRST_SCORED_YEAR = 2021; // 2020년은 점수가 자리 잡는 준비 기간이라 적중률에서 제외
const BUCKETS = [
  [0.5, 0.6, '50~60%'],
  [0.6, 0.7, '60~70%'],
  [0.7, 0.8, '70~80%'],
  [0.8, 1.01, '80% 이상'],
];

const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '-');

export default async function PredictPage() {
  const now = new Date().toISOString();
  const [power, players, upcoming, preds] = await Promise.all([
    supabase
      .from('team_power')
      .select('rating, lineup, last_game_at, team:team_id (id, name, short, image_url)')
      .order('rating', { ascending: false })
      .then(check),
    getPlayerMap(),
    supabase
      .from('matches')
      .select(MATCH_COLUMNS)
      .eq('state', 'unstarted')
      .gte('start_time', now)
      .order('start_time')
      .limit(20)
      .then(check),
    fetchAll(() =>
      supabase
        .from('predictions')
        .select('team1_win_prob, match:match_id (team1_id, winner_id, state, tournament:tournament_id (year))')
        .eq('model', MODEL)
        .order('match_id'),
    ),
  ]);

  // 지난 경기 예측 채점
  const scored = preds
    .filter((p) => p.match.state === 'completed' && p.match.tournament.year >= FIRST_SCORED_YEAR)
    .map((p) => {
      const p1 = Number(p.team1_win_prob);
      const prob = Math.max(p1, 1 - p1);
      const team1Won = p.match.winner_id === p.match.team1_id;
      return { year: p.match.tournament.year, prob, hit: p1 >= 0.5 === team1Won };
    });
  const hits = scored.filter((s) => s.hit).length;
  const years = [...new Set(scored.map((s) => s.year))].sort((a, b) => b - a);
  const topRating = Number(power[0]?.rating ?? 0);

  return (
    <div className={`container ${page.page}`}>
      <h1 className={page.title}>AI 승부예측</h1>
      <p className={page.desc}>
        선수 개인 Elo 점수로 팀 전력을 계산해요. 이적·로스터 변경이 바로 반영돼요.
      </p>

      <div className={page.cards}>
        <div className={page.card}>
          <span>전체 적중률 ({FIRST_SCORED_YEAR}~)</span>
          <b>{pct(hits, scored.length)}</b>
          <small>{scored.length}매치</small>
        </div>
        <div className={page.card}>
          <span>올해 적중률</span>
          <b>{pct(scored.filter((s) => s.year === years[0] && s.hit).length, scored.filter((s) => s.year === years[0]).length)}</b>
          <small>{years[0]}</small>
        </div>
      </div>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>다가오는 경기 예측</h2>
        {upcoming.length ? (
          <MatchList matches={upcoming} showTournament />
        ) : (
          <p className={page.empty}>예정된 LCK 경기가 없어요. 다음 시즌 일정이 나오면 여기에 예측이 표시돼요.</p>
        )}
      </section>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>파워랭킹</h2>
        <p className={page.desc} style={{ marginTop: -4 }}>
          각 팀의 가장 최근 선발 5명의 선수 Elo 평균 (평균 1500)
        </p>
        <div className={t.wrap}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.left}>#</th>
                <th className={`${t.left} ${t.sticky}`}>팀</th>
                <th>전력</th>
                <th className={styles.barCol} aria-label="전력 막대" />
                {ROLE_ORDER.map((r) => (
                  <th key={r} className={t.left}>
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {power.map((row, i) => (
                <tr key={row.team.id}>
                  <td className={`${t.left} ${t.rank}`}>{i + 1}</td>
                  <td className={`${t.left} ${t.sticky}`}>
                    <Link href={`/teams/${row.team.id}`} className={t.name}>
                      <TeamLogo team={row.team} size={24} />
                      {row.team.name}
                    </Link>
                  </td>
                  <td className={t.strong}>{Math.round(row.rating)}</td>
                  <td className={styles.barCol}>
                    <div className={styles.bar}>
                      {/* 1300 을 바닥으로 두고 1위 대비 길이 */}
                      <div style={{ width: `${((row.rating - 1300) / (topRating - 1300)) * 100}%` }} />
                    </div>
                  </td>
                  {row.lineup.map((id) => (
                    <td key={id} className={t.left}>
                      <Link href={`/players/${id}`} className={styles.player}>
                        {playerLabel(players.get(id)?.name ?? '')}
                      </Link>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>예측 성적</h2>
        <p className={page.desc} style={{ marginTop: -4 }}>
          모든 예측은 경기 전 정보만으로 계산했어요 · 확신도가 높을수록 실제로 더 잘 맞아야 믿을 만한 모델이에요
        </p>
        <div className={styles.twoCol}>
          <div className={t.wrap}>
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.left}>연도</th>
                  <th>매치</th>
                  <th>적중</th>
                  <th>적중률</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => {
                  const list = scored.filter((s) => s.year === y);
                  const h = list.filter((s) => s.hit).length;
                  return (
                    <tr key={y}>
                      <td className={t.left}>{y}</td>
                      <td>{list.length}</td>
                      <td>{h}</td>
                      <td className={t.strong}>{pct(h, list.length)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={t.wrap}>
            <table className={t.table}>
              <thead>
                <tr>
                  <th className={t.left}>예측 확신도</th>
                  <th>매치</th>
                  <th>평균 예측</th>
                  <th>실제 적중률</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map(([lo, hi, label]) => {
                  const list = scored.filter((s) => s.prob >= lo && s.prob < hi);
                  const avg = list.reduce((sum, s) => sum + s.prob, 0) / (list.length || 1);
                  return (
                    <tr key={label}>
                      <td className={t.left}>{label}</td>
                      <td>{list.length}</td>
                      <td>{list.length ? `${(avg * 100).toFixed(1)}%` : '-'}</td>
                      <td className={t.strong}>{pct(list.filter((s) => s.hit).length, list.length)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={`${page.section} ${styles.about}`}>
        <h2 className={page.sectionTitle}>예측 방식</h2>
        <ul>
          <li>
            <b>선수 Elo:</b> 세트가 끝날 때마다 이긴 팀 선수 5명의 점수가 오르고 진 팀 선수 5명의 점수가 내려가요. 예상을
            뒤집은 결과일수록 많이 움직여요.
          </li>
          <li>
            <b>팀 전력:</b> 출전하는 선수 5명의 점수 평균이에요. 선수가 이적하면 점수를 가지고 새 팀으로 가요.
          </li>
          <li>
            <b>매치 승률:</b> 세트 승률을 Bo3·Bo5 시리즈 승률로 바꿔서 보여줘요.
          </li>
          <li>
            <b>새 시즌:</b> 비시즌 동안의 변화를 반영하려고 모든 점수를 평균 쪽으로 20% 되돌려요. LCK 신인은 1450점에서
            시작해요.
          </li>
          <li>
            <b>모델 선택:</b> 팀 Elo · 선수 Elo · 혼합 방식을 2021~2023년 경기로 조정하고, 조정에 쓰지 않은 2024~2026년
            경기로 검증했어요. 선수 Elo가 확률이 가장 정확했고, 특히 로스터가 바뀌는 시즌 초반에 팀 Elo보다 잘 맞혔어요.
          </li>
          <li>
            <b>한계:</b> 경기 전에는 출전 명단을 모르므로 각 팀의 직전 경기 선발 명단으로 계산해요. 새 시즌 첫 경기는
            지난 시즌 명단 기준이라 정확도가 떨어질 수 있어요.
          </li>
        </ul>
      </section>
    </div>
  );
}
