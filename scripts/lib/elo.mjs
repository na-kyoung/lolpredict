// Elo 승부예측 모델 (팀 Elo · 선수 Elo · 혼합)
//
// - 팀 Elo: 구단(팀 계보로 묶은 것)마다 점수
// - 선수 Elo: 선수마다 점수, 팀 전력 = 그 세트에 뛴 선수 5명 평균 → 이적·로스터 변경이 자동 반영
// - 혼합: 두 전력을 mix 비율로 섞음
// 세트 결과마다 점수를 갱신하고, 새 시즌이 시작되면 점수를 평균 쪽으로 조금 되돌림
import { db } from './db.mjs';

export const BASE = 1500;

// 사이트에서 쓰는 모델. npm run backtest 결과로 선택 (2026-09-25)
// 검증 기간(2024~2026) 매치 적중률 75.5%, 시즌 초반 76.1%, 확률 정확도(로그 손실)는 세 방식 중 최고
export const MODEL = { name: 'player_elo', mix: 1, k: 24, side: 25, regress: 0.2, rookie: 1450 };

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bottom', 'support'];

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

async function fetchAll(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const data = check(await makeQuery().range(from, from + 999));
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// 팀 id → 구단 대표 이름 (renamed_to 계보를 따라 최종 이름으로 묶음)
export async function loadOrgs() {
  const teams = check(await db.from('teams').select('id, name, renamed_to'));
  const byName = new Map(teams.map((t) => [t.name, t]));
  const orgOf = (name, seen = new Set()) => {
    const t = byName.get(name);
    if (!t?.renamed_to || !byName.has(t.renamed_to) || seen.has(name)) return name;
    seen.add(name);
    return orgOf(t.renamed_to, seen);
  };
  return new Map(teams.map((t) => [t.id, orgOf(t.name)]));
}

// 모든 완료된 LCK 세트를 시간순으로: { matchId, time, year, game, blue: {teamId, org, players}, red, blueWin }
// 국제대회는 제외: 해외 선수는 기록이 적어 점수가 부정확하고, 그 상대로 LCK 선수 점수가 왜곡됨
export async function loadHistory() {
  const [orgs, games, rows] = await Promise.all([
    loadOrgs(),
    fetchAll(() =>
      db
        .from('games')
        .select('id, match_id, game_number, start_time, blue_team_id, red_team_id, winner_id')
        .not('winner_id', 'is', null)
        .order('id'),
    ),
    fetchAll(() =>
      db
        .from('player_game_rows')
        .select('game_id, player_id, side, role, year')
        .eq('competition', 'lck')
        .order('game_id')
        .order('player_id'),
    ),
  ]);

  // 세트별 양 팀 선발 명단 (포지션 순)
  const byRole = (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  const raw = new Map();
  for (const r of rows) {
    const g = raw.get(r.game_id) ?? { year: r.year, blue: [], red: [] };
    g[r.side].push(r);
    raw.set(r.game_id, g);
  }
  const lineups = new Map(
    [...raw].map(([id, g]) => [
      id,
      { year: g.year, blue: g.blue.sort(byRole).map((r) => r.player_id), red: g.red.sort(byRole).map((r) => r.player_id) },
    ]),
  );

  return games
    .filter((g) => lineups.has(g.id))
    .map((g) => {
      const l = lineups.get(g.id);
      return {
        gameId: g.id,
        matchId: g.match_id,
        game: g.game_number,
        time: g.start_time,
        year: l.year,
        blue: { teamId: g.blue_team_id, org: orgs.get(g.blue_team_id), players: l.blue },
        red: { teamId: g.red_team_id, org: orgs.get(g.red_team_id), players: l.red },
        blueWin: g.winner_id === g.blue_team_id,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time) || a.matchId - b.matchId || a.game - b.game);
}

export const winProb = (diff) => 1 / (1 + 10 ** (-diff / 400));

// 세트 승률 p 로 Bo N 시리즈를 이길 확률
export function seriesWinProb(p, bestOf) {
  const need = Math.ceil(bestOf / 2);
  let total = 0;
  let comb = 1; // C(need-1+l, l)
  for (let l = 0; l < need; l++) {
    if (l > 0) comb = (comb * (need - 1 + l)) / l;
    total += comb * p ** need * (1 - p) ** l;
  }
  return total;
}

/**
 * config: {
 *   mix: 0 = 팀 Elo 만, 1 = 선수 Elo 만, 그 사이 = 혼합
 *   k: 세트당 점수 변동폭
 *   side: 블루 진영 보정 (Elo 점수 단위)
 *   regress: 새 시즌 시작 때 평균으로 되돌리는 비율 (0~1)
 *   rookie: 처음 보는 선수의 시작 점수
 * }
 */
export function createModel(config) {
  const teamR = new Map();
  const playerR = new Map();
  let season = null;

  const teamRating = (org) => teamR.get(org) ?? BASE;
  const playerRating = (id) => playerR.get(id) ?? config.rookie;
  const lineupRating = (players) => players.reduce((s, p) => s + playerRating(p), 0) / players.length;

  // 팀 전력 = 팀 Elo 와 선수 평균 Elo 를 섞은 값
  const strength = ({ org, players }) =>
    (1 - config.mix) * teamRating(org) + config.mix * (players.length ? lineupRating(players) : BASE);

  return {
    teamR,
    playerR,
    strength,

    // 연도가 바뀌면 점수를 평균 쪽으로 되돌림 (비시즌 전력 변화 반영)
    startSeason(year) {
      if (season === year) return;
      if (season !== null) {
        for (const map of [teamR, playerR]) {
          for (const [key, r] of map) map.set(key, BASE + (r - BASE) * (1 - config.regress));
        }
      }
      season = year;
    },

    // 블루 팀이 이길 확률 (진영 보정 포함)
    gameProb(blue, red) {
      return winProb(strength(blue) - strength(red) + config.side);
    },

    // 진영을 모르는 시리즈 예측용 (진영 보정 없음)
    neutralProb(a, b) {
      return winProb(strength(a) - strength(b));
    },

    update(g) {
      const p = this.gameProb(g.blue, g.red);
      const delta = config.k * ((g.blueWin ? 1 : 0) - p);
      for (const [side, d] of [[g.blue, delta], [g.red, -delta]]) {
        teamR.set(side.org, teamRating(side.org) + d);
        for (const id of side.players) playerR.set(id, playerRating(id) + d);
      }
    },
  };
}
