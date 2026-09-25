// Elo 모델 백테스트: 과거 경기를 "경기 전 정보만으로" 하나씩 예측해 실제 결과와 비교
//
// 사용법: npm run backtest
//   - 2020: 준비 기간 (점수가 자리 잡는 기간, 채점 안 함)
//   - 2021~2023: 튜닝 기간 → 모델 종류마다 가장 좋은 설정 선택
//   - 2024~2026: 검증 기간 → 선택한 설정의 실제 성능 (튜닝에 안 쓴 기간)
import { db } from './lib/db.mjs';
import { loadHistory, createModel, seriesWinProb } from './lib/elo.mjs';

const TUNE = [2021, 2023];
const TEST = [2024, 2026];
const EARLY_MATCHES = 60; // 매년 첫 60매치 = 비시즌 로스터 변경 직후

const GRID = [];
for (const mix of [0, 0.5, 1]) {
  for (const k of [16, 24, 32, 48]) {
    for (const side of [0, 25]) {
      for (const regress of [0.2, 0.4]) {
        for (const rookie of mix ? [1450, 1500] : [1500]) GRID.push({ mix, k, side, regress, rookie });
      }
    }
  }
}

// 채점: 적중률(높게 본 쪽이 이겼나), 로그 손실(확률이 얼마나 정확한가, 낮을수록 좋음)
function score(preds) {
  if (!preds.length) return { n: 0 };
  let hit = 0;
  let logLoss = 0;
  for (const { p, won } of preds) {
    hit += (p >= 0.5) === won ? 1 : 0;
    const q = Math.min(Math.max(won ? p : 1 - p, 1e-6), 1);
    logLoss -= Math.log(q);
  }
  return { n: preds.length, acc: hit / preds.length, logLoss: logLoss / preds.length };
}

function run(history, matchInfo, config) {
  const model = createModel(config);
  const lastLineup = new Map(); // 구단 → 직전 세트 선발 5명
  const games = [];
  const matchesLast = []; // 직전 경기 명단으로 예측 (실제 서비스와 같은 조건)
  const matchesActual = []; // 실제 출전 명단으로 예측 (명단을 안다면 얼마나 맞히나)
  const seen = new Set();
  const matchNo = new Map(); // 연도 → 지금까지 매치 수 (시즌 초반 구분용)

  for (const g of history) {
    model.startSeason(g.year);

    if (!seen.has(g.matchId)) {
      seen.add(g.matchId);
      const m = matchInfo.get(g.matchId);
      if (m?.winner_id) {
        const [t1, t2] = m.team1_id === g.blue.teamId ? [g.blue, g.red] : [g.red, g.blue];
        const won = m.winner_id === m.team1_id;
        const last = (side) => ({ org: side.org, players: lastLineup.get(side.org) ?? [] });
        const bo = m.best_of || 1;
        const no = (matchNo.get(g.year) ?? 0) + 1;
        matchNo.set(g.year, no);
        const early = no <= EARLY_MATCHES;
        matchesLast.push({ year: g.year, early, p: seriesWinProb(model.neutralProb(last(t1), last(t2)), bo), won });
        matchesActual.push({ year: g.year, early, p: seriesWinProb(model.neutralProb(t1, t2), bo), won });
      }
    }

    games.push({ year: g.year, p: model.gameProb(g.blue, g.red), won: g.blueWin });
    model.update(g);
    lastLineup.set(g.blue.org, g.blue.players);
    lastLineup.set(g.red.org, g.red.players);
  }

  const period = (list, [from, to]) => list.filter((x) => x.year >= from && x.year <= to);
  return Object.fromEntries(
    [TUNE, TEST].map((range) => [
      range === TUNE ? 'tune' : 'test',
      {
        game: score(period(games, range)),
        matchLast: score(period(matchesLast, range)),
        matchActual: score(period(matchesActual, range)),
        earlyLast: score(period(matchesLast, range).filter((x) => x.early)),
      },
    ]),
  );
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

async function main() {
  console.log('경기 기록 불러오는 중...');
  const history = await loadHistory();
  const matchRows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('matches').select('id, team1_id, winner_id, best_of').range(from, from + 999);
    if (error) throw new Error(error.message);
    matchRows.push(...data);
    if (data.length < 1000) break;
  }
  const matchInfo = new Map(matchRows.map((m) => [m.id, m]));
  console.log(`세트 ${history.length}개, 설정 조합 ${GRID.length}개 시험\n`);

  const results = GRID.map((config) => ({ config, ...run(history, matchInfo, config) }));

  // 기준선: 항상 블루 승 / 동전 던지기
  const blueRate = (range) => {
    const g = history.filter((x) => x.year >= range[0] && x.year <= range[1]);
    return g.filter((x) => x.blueWin).length / g.length;
  };
  console.log(`기준선 — 세트: 항상 블루 선택 시 적중률 튜닝 ${pct(blueRate(TUNE))} / 검증 ${pct(blueRate(TEST))}, 매치: 동전 50%\n`);

  const names = { 0: '팀 Elo', 0.5: '혼합 (팀 50% + 선수 50%)', 1: '선수 Elo' };
  for (const mix of [0, 0.5, 1]) {
    // 튜닝 기간 세트 로그 손실이 가장 낮은 설정 선택
    const best = results.filter((r) => r.config.mix === mix).sort((a, b) => a.tune.game.logLoss - b.tune.game.logLoss)[0];
    const { tune, test, config } = best;
    console.log(`■ ${names[mix]}  (K=${config.k}, 블루 보정=${config.side}, 시즌 회귀=${config.regress}, 신인=${config.rookie})`);
    console.log(`  세트 예측        튜닝 ${pct(tune.game.acc)} (손실 ${tune.game.logLoss.toFixed(4)})  | 검증 ${pct(test.game.acc)} (손실 ${test.game.logLoss.toFixed(4)})  [${test.game.n}세트]`);
    console.log(`  매치 (직전 명단) 튜닝 ${pct(tune.matchLast.acc)} | 검증 ${pct(test.matchLast.acc)} (손실 ${test.matchLast.logLoss.toFixed(4)})  [${test.matchLast.n}매치]`);
    console.log(`  매치 (실제 명단) 튜닝 ${pct(tune.matchActual.acc)} | 검증 ${pct(test.matchActual.acc)}`);
    console.log(`  시즌 초반 매치   튜닝 ${pct(tune.earlyLast.acc)} | 검증 ${pct(test.earlyLast.acc)} (손실 ${test.earlyLast.logLoss.toFixed(4)})  [${test.earlyLast.n}매치]\n`);
  }
}

main().catch((err) => {
  console.error('백테스트 실패:', err.message);
  process.exit(1);
});
