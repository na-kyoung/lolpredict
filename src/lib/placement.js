// 대회 순위 계산 (일정·결과의 우승팀 배너, 팀 상세의 대회별 성적에서 사용)
import { stageLabel } from './labels';

// 정규시즌 대회 이름 (결승이 없어서 순위표로 계산): "LCK 2021 Spring", "LCK 2026 Rounds 1-2"
export const REGULAR_SEASON = /(Spring|Summer)$|Rounds \d/;

// 매치 목록으로 순위표 계산: 매치 승수 → 세트 득실 순
// keyOf: 팀 → 순위표 키 (같은 구단의 여러 이름을 한 줄로 묶을 때 사용, 기본은 팀 id)
export function standings(matches, keyOf = (team) => team.id) {
  const table = new Map();
  for (const m of matches) {
    if (m.state !== 'completed') continue;
    for (const [team, own, opp] of [
      [m.team1, m.team1_score, m.team2_score],
      [m.team2, m.team2_score, m.team1_score],
    ]) {
      const key = keyOf(team);
      const row = table.get(key) ?? { key, team, wins: 0, losses: 0, setDiff: 0 };
      if (m.winner_id === team.id) row.wins++;
      else row.losses++;
      row.setDiff += (own ?? 0) - (opp ?? 0);
      table.set(key, row);
    }
  }
  return [...table.values()].sort((a, b) => b.wins - a.wins || b.setDiff - a.setDiff);
}

// 탈락 단계 묶음: 조별리그·스위스처럼 날짜만 다른 경기들은 같은 단계로 봄
// → { key: 묶음 기준, label: 화면 표시 }
function phaseOf(tournamentName, stage) {
  if (/^(Week \d+|Day \d+|Tiebreakers|Groups)/.test(stage)) return { key: 'group', label: '그룹 스테이지' };
  if (/^Play-In/.test(stage)) return { key: 'playin', label: '플레이-인' };
  if (/^Rumble/.test(stage)) return { key: 'rumble', label: '럼블 스테이지' };
  // 월즈 본선 2023~ 의 "Round 1~5" 는 스위스 스테이지 (LCK 플레이오프의 Round N 은 대진 라운드라 따로)
  if (/Worlds/.test(tournamentName) && /^Round \d$/.test(stage)) return { key: 'swiss', label: '스위스 스테이지' };
  return { key: stage, label: stageLabel(stage) };
}

// 월즈 선발전은 결승이 있어도 월즈 시드를 정하는 경기라 우승·준우승이 아님
export const isQualifierFinals = (tournamentName) => tournamentName.includes('Regional Finals');

/**
 * 한 대회에서 구단의 최종 성적.
 * matches: 그 대회의 모든 매치, isOurs(teamId): 이 구단의 팀인지
 * earlierRounds: 2025~ 정규시즌 3라운드 이후 대회면 같은 해 1-2라운드 매치 (합산 순위용)
 * → { label: '우승' | '준우승' | '공동 3위' | '정규시즌 2위' | '참가' | '진행 중', note, medal: 'gold'|'silver'|null }
 */
export function placement(tournament, matches, isOurs, earlierRounds = []) {
  const key = (team) => (isOurs(team.id) ? 'ours' : team.id);
  const final =
    !isQualifierFinals(tournament.name) && matches.find((m) => m.stage === 'Finals' && m.state === 'completed');

  if (final) {
    const winnerKey = key(final.winner_id === final.team1.id ? final.team1 : final.team2);
    const loserKey = key(final.winner_id === final.team1.id ? final.team2 : final.team1);
    if (winnerKey === 'ours') return { label: '우승', medal: 'gold' };
    if (loserKey === 'ours') return { label: '준우승', medal: 'silver' };

    // 나머지 팀: 늦게 탈락할수록 높은 순위, 같은 단계(조별리그 등은 하나로 묶음)에서 탈락하면 공동 순위
    const last = new Map();
    for (const m of matches) {
      for (const team of [m.team1, m.team2]) {
        const k = key(team);
        if (k === winnerKey || k === loserKey) continue;
        if (!last.has(k) || last.get(k).start_time < m.start_time) last.set(k, m);
      }
    }
    const order = [...last]
      .map(([k, m]) => ({ k, time: m.start_time, phase: phaseOf(tournament.name, m.stage) }))
      .sort((a, b) => b.time.localeCompare(a.time));
    // 같은 단계는 한 묶음 (날짜가 섞여 있어도 묶이도록 단계별로 모음, 단계 순서는 그 단계의 마지막 경기 기준)
    const groups = [];
    for (const row of order) {
      const g = groups.find((x) => x.key === row.phase.key);
      if (g) g.rows.push(row);
      else groups.push({ key: row.phase.key, label: row.phase.label, rows: [row] });
    }
    let rank = 3;
    for (const g of groups) {
      if (g.rows.some((r) => r.k === 'ours')) {
        return { label: `${g.rows.length > 1 ? '공동 ' : ''}${rank}위`, note: `${g.label} 탈락`, medal: null };
      }
      rank += g.rows.length;
    }
  }

  const finished = matches.length > 0 && matches.every((m) => m.state === 'completed');
  if (!finished) return { label: '진행 중', medal: null };

  if (REGULAR_SEASON.test(tournament.name)) {
    const table = standings([...earlierRounds, ...matches], key);
    const rank = table.findIndex((r) => r.key === 'ours') + 1;
    const prefix = /Rounds 1-2/.test(tournament.name) ? '1-2라운드' : '정규시즌';
    return { label: `${prefix} ${rank}위`, medal: rank === 1 ? 'gold' : null };
  }
  return { label: '참가', medal: null };
}
