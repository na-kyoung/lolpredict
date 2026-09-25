// 선수 Elo 로 승부예측을 계산해 DB 에 저장합니다. (수집 스크립트 다음에 실행)
//
// 사용법: npm run predict
//   - predictions   : 모든 매치의 "경기 전" 예측 (지난 경기 → 적중률 계산, 다가오는 경기 → 예측 표시)
//   - team_ratings  : 매치 직전 두 팀의 전력 점수
//   - player_ratings: 현재 선수 점수
//   - team_power    : 현재 팀 전력 (파워랭킹, 최근 시즌에 뛴 팀만)
//
// 예측 명단: 각 팀의 직전 세트 선발 5명 (실제 서비스에서도 경기 전에는 이것만 알 수 있음)
import { db, upsert } from './lib/db.mjs';
import { MODEL, BASE, createModel, loadHistory, loadOrgs, seriesWinProb } from './lib/elo.mjs';

const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;

async function loadMatches() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('matches')
      .select('id, team1_id, team2_id, winner_id, best_of, state, start_time')
      .order('start_time')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function main() {
  console.log('경기 기록 불러오는 중...');
  const [history, matches, orgs] = await Promise.all([loadHistory(), loadMatches(), loadOrgs()]);
  const matchInfo = new Map(matches.map((m) => [m.id, m]));

  const model = createModel(MODEL);
  const lastLineup = new Map(); // 구단 → 직전 선발 5명
  const lastTeam = new Map(); // 구단 → { teamId, time, year }
  const playerGames = new Map();
  const predictions = [];
  const teamRatings = [];

  // 매치 직전 예측 기록
  const predict = (m, bo) => {
    const side = (teamId) => {
      const org = orgs.get(teamId);
      return { org, players: lastLineup.get(org) ?? [] };
    };
    const [t1, t2] = [side(m.team1_id), side(m.team2_id)];
    const p = seriesWinProb(model.neutralProb(t1, t2), bo);
    predictions.push({ match_id: m.id, model: MODEL.name, team1_win_prob: round(p, 3) });
    teamRatings.push(
      { team_id: m.team1_id, match_id: m.id, rating: round(model.strength(t1), 2) },
      { team_id: m.team2_id, match_id: m.id, rating: round(model.strength(t2), 2) },
    );
  };

  // 1. 지난 경기: 시간순으로 예측 → 결과 반영
  const seen = new Set();
  for (const g of history) {
    model.startSeason(g.year);
    if (!seen.has(g.matchId)) {
      seen.add(g.matchId);
      const m = matchInfo.get(g.matchId);
      if (m) predict(m, m.best_of || 1);
    }
    model.update(g);
    for (const side of [g.blue, g.red]) {
      lastLineup.set(side.org, side.players);
      lastTeam.set(side.org, { teamId: side.teamId, time: g.time, year: g.year });
      for (const id of side.players) playerGames.set(id, (playerGames.get(id) ?? 0) + 1);
    }
  }

  // 2. 다가오는 경기: 현재 점수로 예측
  const upcoming = matches.filter((m) => m.state === 'unstarted' && !seen.has(m.id));
  for (const m of upcoming) {
    model.startSeason(new Date(m.start_time).getUTCFullYear());
    predict(m, m.best_of || 1);
  }
  console.log(`예측: 지난 매치 ${seen.size}개, 다가오는 매치 ${upcoming.length}개`);

  // 3. 저장
  await upsert('predictions', predictions, 'match_id,model');
  await upsert('team_ratings', teamRatings, 'team_id,match_id');
  await upsert(
    'player_ratings',
    [...model.playerR].map(([id, r]) => ({
      player_id: id,
      rating: round(r, 2),
      games: playerGames.get(id) ?? 0,
      updated_at: new Date().toISOString(),
    })),
    'player_id',
  );

  // 파워랭킹: 가장 최근 시즌에 뛴 구단만, 구단의 현재 팀 이름(가장 최근 팀 id)으로
  const latestYear = Math.max(...[...lastTeam.values()].map((t) => t.year));
  const power = [...lastTeam]
    .filter(([, t]) => t.year === latestYear)
    .map(([org, t]) => ({
      team_id: t.teamId,
      rating: round(model.strength({ org, players: lastLineup.get(org) }), 2),
      lineup: lastLineup.get(org),
      last_game_at: t.time,
      updated_at: new Date().toISOString(),
    }));
  const { error } = await db.from('team_power').delete().gte('team_id', 0);
  if (error) throw new Error(error.message);
  await upsert('team_power', power, 'team_id');

  const top = [...power].sort((a, b) => b.rating - a.rating).slice(0, 3);
  console.log(`파워랭킹 ${power.length}팀 (기준 ${BASE}) 상위: ${top.map((t) => `${t.team_id}:${t.rating}`).join(', ')}`);
  console.log('완료');
}

main().catch((err) => {
  console.error('예측 실패:', err.message);
  process.exit(1);
});
