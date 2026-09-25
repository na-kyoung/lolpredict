// Leaguepedia 에서 LCK 경기 일정·결과·세트 기록·선수 기록을 받아 DB 에 저장합니다.
//
// 사용법:
//   npm run collect                          최근 경기만 갱신 (DB 의 마지막 경기 7일 전부터)
//   npm run collect -- --since=2020-01-01    지정한 날짜부터 전부 다시 수집
import { login, cargoQuery, quote, resolveRedirects } from './lib/leaguepedia.mjs';
import { db, upsert, idMap } from './lib/db.mjs';

// LCK CL 은 "LCK CL/..." 이라 제외됨. 쇼매치(이벤트 경기)도 제외
const LCK_PAGES = 'OverviewPage LIKE "LCK/%" AND OverviewPage NOT LIKE "%Showmatch%"';
const RESYNC_DAYS = 7; // 위키 수정 사항을 반영하려고 최근 경기는 다시 받음

const ROLES = { Top: 'top', Jungle: 'jungle', Mid: 'mid', Bot: 'bottom', Support: 'support' };

// 예전 팀명은 Leaguepedia 에 약칭이 없어서(현재 팀 약칭만 있음) 당시 약칭을 직접 지정
const HISTORICAL_SHORT = {
  'Afreeca Freecs': 'AF',
  'Kwangdong Freecs': 'KDF',
  'DN Freecs': 'DNF',
  'DAMWON Gaming': 'DWG',
  'DWG KIA': 'DK',
  'Dplus KIA': 'DK',
  DragonX: 'DRX',
  DRX: 'DRX',
  'SANDBOX Gaming': 'SB',
  'Liiv SANDBOX': 'LSB',
  FearX: 'FOX',
  BRION: 'BRO',
  'Fredit BRION': 'BRO',
  'OKSavingsBank BRION': 'BRO',
  'APK Prince': 'APK',
  'Team Dynamics': 'DYN',
  'Seorabeol Gaming': 'SRB',
  'Griffin (Korean Team)': 'GRF',
};

const num = (v) => (v === '' || v == null ? null : Number(v));
const list = (v, sep = ',') => (v ? v.split(sep).map((s) => s.trim()).filter((s) => s && s !== 'None') : []);
// Cargo 날짜는 "2021-01-13 08:00:00" (UTC)
const utc = (v) => (v ? `${v.replace(' ', 'T')}Z` : null);
const side = (n) => (Number(n) === 1 ? 'blue' : 'red');

async function getSince() {
  const arg = process.argv.find((a) => a.startsWith('--since='));
  if (arg) return arg.split('=')[1];

  const { data, error } = await db
    .from('matches')
    .select('start_time')
    .eq('state', 'completed')
    .order('start_time', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data.length) return '2020-01-01';
  const d = new Date(data[0].start_time);
  d.setUTCDate(d.getUTCDate() - RESYNC_DAYS);
  return d.toISOString().slice(0, 10);
}

async function saveTeams(names) {
  const { data: known, error } = await db.from('teams').select('name,short');
  if (error) throw new Error(error.message);
  const hasShort = new Map(known.map((t) => [t.name, !!t.short]));
  // 새 팀 + 약칭을 못 채운 기존 팀
  const targets = [...new Set([...names, ...known.map((t) => t.name)])].filter((n) => !hasShort.get(n));
  if (!targets.length) return idMap('teams', 'name');

  // 예전 팀명(DAMWON Gaming 등)은 현재 팀 페이지로 넘겨주기 되어 있어서, 최종 이름으로 Teams 정보를 찾음
  const canonical = await resolveRedirects(targets);
  const canonicalNames = [...new Set(canonical.values())];
  const info = new Map();
  for (let i = 0; i < canonicalNames.length; i += 20) {
    const rows = await cargoQuery({
      tables: 'Teams',
      fields: { name: 'Name', short: 'Short', renamedTo: 'RenamedTo' },
      where: `Name IN (${canonicalNames.slice(i, i + 20).map(quote).join(',')})`,
    });
    for (const r of rows) info.set(r.name, r);
  }
  await upsert(
    'teams',
    targets.map((name) => {
      const current = canonical.get(name);
      return {
        name,
        short: HISTORICAL_SHORT[name] || info.get(current)?.short || null,
        // 이름이 바뀐 팀은 현재 이름을, 아니면 Leaguepedia 의 개명 정보를 저장
        renamed_to: current !== name ? current : info.get(name)?.renamedTo || null,
      };
    }),
    'name',
  );
  console.log(`  팀 정보 ${targets.length}개 저장 (약칭 없음: ${targets.filter((n) => !info.get(canonical.get(n))?.short).length}개)`);
  return idMap('teams', 'name');
}

async function getTournamentInfo(since) {
  const rows = await cargoQuery({
    tables: 'Tournaments',
    fields: { page: 'OverviewPage', name: 'Name', year: 'Year', start: 'DateStart', end: 'Date', playoffs: 'IsPlayoffs' },
    where: `${LCK_PAGES} AND Year >= "${since.slice(0, 4)}"`,
  });
  return new Map(rows.map((t) => [t.page, t]));
}

// 연도 단위로 나눔 → 연도마다 받아서 바로 저장하므로 중간에 실패해도 앞 연도는 남음
// 마지막 구간은 끝이 없어서 앞으로 열릴 경기까지 포함
function yearRanges(since) {
  const ranges = [];
  const lastYear = new Date().getUTCFullYear();
  let from = since;
  for (let y = Number(since.slice(0, 4)) + 1; y <= lastYear; y++) {
    ranges.push([from, `${y}-01-01`]);
    from = `${y}-01-01`;
  }
  ranges.push([from, null]);
  return ranges;
}

async function main() {
  const since = await getSince();
  console.log(`Leaguepedia 수집 시작 (${since} 이후)`);
  await login();
  const tourInfo = await getTournamentInfo(since);

  for (const [from, to] of yearRanges(since)) {
    console.log(`\n=== ${from} ~ ${to ?? '앞으로 열릴 경기까지'} ===`);
    await collectRange(from, to, tourInfo);
  }
}

async function collectRange(from, to, tourInfo) {
  const sinceWhere = `DateTime_UTC >= "${from} 00:00:00"` + (to ? ` AND DateTime_UTC < "${to} 00:00:00"` : '');

  // 1. 매치 일정·결과 (앞으로 열릴 경기 포함)
  console.log('매치 조회 중...');
  const matchRows = (
    await cargoQuery({
      tables: 'MatchSchedule',
      fields: {
        matchId: 'MatchId', page: 'OverviewPage', time: 'DateTime_UTC', tab: 'Tab', bestOf: 'BestOf',
        team1: 'Team1', team2: 'Team2', score1: 'Team1Score', score2: 'Team2Score', winner: 'Winner',
        nullified: 'IsNullified',
      },
      where: `${LCK_PAGES} AND ${sinceWhere}`,
      orderBy: 'DateTime_UTC',
    })
  ).filter((m) => m.matchId && m.time && m.nullified !== '1' && m.team1 !== 'TBD' && m.team2 !== 'TBD');
  console.log(`  ${matchRows.length}개`);

  // 2. 세트 기록
  console.log('세트 기록 조회 중...');
  const gameRows = await cargoQuery({
    tables: 'ScoreboardGames',
    fields: {
      gameId: 'GameId', matchId: 'MatchId', n: 'N_GameInMatch', time: 'DateTime_UTC',
      team1: 'Team1', team2: 'Team2', winner: 'Winner', length: 'Gamelength_Number', patch: 'Patch',
      bans1: 'Team1Bans', bans2: 'Team2Bans', picks1: 'Team1Picks', picks2: 'Team2Picks',
      kills1: 'Team1Kills', kills2: 'Team2Kills', gold1: 'Team1Gold', gold2: 'Team2Gold',
      towers1: 'Team1Towers', towers2: 'Team2Towers', inhib1: 'Team1Inhibitors', inhib2: 'Team2Inhibitors',
      dragons1: 'Team1Dragons', dragons2: 'Team2Dragons', barons1: 'Team1Barons', barons2: 'Team2Barons',
      heralds1: 'Team1RiftHeralds', heralds2: 'Team2RiftHeralds', grubs1: 'Team1VoidGrubs', grubs2: 'Team2VoidGrubs',
    },
    where: `${LCK_PAGES} AND ${sinceWhere}`,
    orderBy: 'DateTime_UTC,GameId',
  });
  console.log(`  ${gameRows.length}개`);

  // 3. 선수 기록
  console.log('선수 기록 조회 중...');
  const playerRows = await cargoQuery({
    tables: 'ScoreboardPlayers',
    fields: {
      gameId: 'GameId', link: 'Link', team: 'Team', side: 'Side', role: 'Role', champion: 'Champion',
      kills: 'Kills', deaths: 'Deaths', assists: 'Assists', cs: 'CS', gold: 'Gold',
      damage: 'DamageToChampions', vision: 'VisionScore', items: 'Items',
    },
    where: `${LCK_PAGES} AND ${sinceWhere}`,
    orderBy: 'DateTime_UTC,GameId,Side,Role_Number',
  });
  console.log(`  ${playerRows.length}개`);

  // 4. 대회
  console.log('대회 정보 저장 중...');
  const pages = [...new Set(matchRows.map((m) => m.page))];
  await upsert(
    'tournaments',
    pages.map((page) => {
      const t = tourInfo.get(page);
      return {
        overview_page: page,
        // 대회 정보가 없으면 "LCK/2025 Season/Road to MSI" → "LCK 2025 Road to MSI"
        name: t?.name || page.replace('/', ' ').replace(' Season/', ' '),
        year: num(t?.year) ?? Number(page.match(/\d{4}/)?.[0]),
        start_date: t?.start || null,
        end_date: t?.end || null,
        is_playoffs: t?.playoffs === '1',
      };
    }),
    'overview_page',
  );
  const tournamentIds = await idMap('tournaments', 'overview_page');

  // 세트의 팀명이 매치의 팀명과 대소문자만 다르면 매치 쪽 이름으로 맞춤 (위키 오타: "Dplus KIA"/"Dplus Kia")
  const matchTeams = new Map(matchRows.map((m) => [m.matchId, [m.team1, m.team2]]));
  for (const g of gameRows) {
    const names = matchTeams.get(g.matchId) ?? [];
    for (const key of ['team1', 'team2']) {
      if (names.includes(g[key])) continue;
      const same = names.find((n) => n.toLowerCase() === g[key].toLowerCase());
      if (same) g[key] = same;
    }
  }

  // 5. 팀 (선수 기록의 팀명은 세트 진영으로 맞추므로 제외)
  const teamNames = new Set();
  for (const m of matchRows) teamNames.add(m.team1).add(m.team2);
  for (const g of gameRows) teamNames.add(g.team1).add(g.team2);
  teamNames.delete('');
  const teamIds = await saveTeams(teamNames);

  // 6. 매치 저장
  console.log('매치 저장 중...');
  await upsert(
    'matches',
    matchRows.map((m) => ({
      lp_match_id: m.matchId,
      tournament_id: tournamentIds.get(m.page),
      start_time: utc(m.time),
      stage: m.tab || null,
      best_of: num(m.bestOf),
      team1_id: teamIds.get(m.team1),
      team2_id: teamIds.get(m.team2),
      team1_score: num(m.score1),
      team2_score: num(m.score2),
      winner_id: m.winner === '1' ? teamIds.get(m.team1) : m.winner === '2' ? teamIds.get(m.team2) : null,
      state: m.winner === '1' || m.winner === '2' ? 'completed' : 'unstarted',
    })),
    'lp_match_id',
  );
  const matchIds = await idMap('matches', 'lp_match_id');

  // 7. 세트 저장 (Leaguepedia 의 Team1 = 블루, Team2 = 레드)
  console.log('세트 저장 중...');
  const validGames = gameRows.filter((g) => matchIds.has(g.matchId));
  if (validGames.length < gameRows.length) {
    console.log(`  ⚠ 매치 정보가 없는 세트 ${gameRows.length - validGames.length}개는 건너뜀`);
  }
  const savedGames = await upsert(
    'games',
    validGames.map((g) => ({
      lp_game_id: g.gameId,
      match_id: matchIds.get(g.matchId),
      game_number: num(g.n),
      start_time: utc(g.time),
      blue_team_id: teamIds.get(g.team1),
      red_team_id: teamIds.get(g.team2),
      winner_id: g.winner === '1' ? teamIds.get(g.team1) : g.winner === '2' ? teamIds.get(g.team2) : null,
      duration_sec: g.length ? Math.round(Number(g.length) * 60) : null,
      patch: g.patch || null,
    })),
    'lp_game_id',
    'id,lp_game_id',
  );
  const gameIds = new Map(savedGames.map((g) => [g.lp_game_id, g.id]));

  const gameTeams = validGames.flatMap((g) =>
    [1, 2].map((n) => ({
      game_id: gameIds.get(g.gameId),
      team_id: teamIds.get(g[`team${n}`]),
      side: side(n),
      win: g.winner === String(n),
      kills: num(g[`kills${n}`]),
      total_gold: g[`gold${n}`] ? Math.round(Number(g[`gold${n}`])) : null,
      towers: num(g[`towers${n}`]),
      inhibitors: num(g[`inhib${n}`]),
      dragons: num(g[`dragons${n}`]),
      barons: num(g[`barons${n}`]),
      heralds: num(g[`heralds${n}`]),
      void_grubs: num(g[`grubs${n}`]),
      bans: list(g[`bans${n}`]),
      picks: list(g[`picks${n}`]),
    })),
  );
  await upsert('game_teams', gameTeams, 'game_id,team_id');

  // 8. 선수 저장
  console.log('선수 기록 저장 중...');
  const validPlayers = playerRows.filter((p) => gameIds.has(p.gameId) && p.link && ROLES[p.role]);
  if (validPlayers.length < playerRows.length) {
    console.log(`  ⚠ 세트·선수·포지션 정보가 없는 기록 ${playerRows.length - validPlayers.length}개는 건너뜀`);
  }
  await upsert('players', [...new Set(validPlayers.map((p) => p.link))].map((name) => ({ name })), 'name');
  const playerIds = await idMap('players', 'name');

  // 선수 팀은 세트의 진영 팀으로 맞춤 (위키에 "Dplus KIA"/"Dplus Kia" 처럼 표기가 섞인 경우가 있음)
  const sideTeams = new Map(
    validGames.map((g) => [g.gameId, { blue: teamIds.get(g.team1), red: teamIds.get(g.team2) }]),
  );

  const gamePlayers = new Map(); // 같은 세트·선수가 중복으로 오면 마지막 것만 사용
  for (const p of validPlayers) {
    const row = {
      game_id: gameIds.get(p.gameId),
      player_id: playerIds.get(p.link),
      team_id: sideTeams.get(p.gameId)[side(p.side)],
      side: side(p.side),
      role: ROLES[p.role],
      champion: p.champion,
      kills: num(p.kills),
      deaths: num(p.deaths),
      assists: num(p.assists),
      cs: num(p.cs),
      gold: num(p.gold),
      damage: num(p.damage),
      vision_score: num(p.vision),
      items: list(p.items, ';'),
    };
    gamePlayers.set(`${row.game_id}:${row.player_id}`, row);
  }
  await upsert('game_players', [...gamePlayers.values()], 'game_id,player_id');

  console.log(
    `완료: 매치 ${matchRows.length}, 세트 ${savedGames.length}, 선수 기록 ${gamePlayers.size}`,
  );
}

main().catch((err) => {
  console.error('수집 실패:', err.message);
  process.exit(1);
});
