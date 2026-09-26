// LoL Esports API 로 2024~ 경기의 분 단위 골드 그래프와 팀 로고를 받아 DB 에 저장합니다.
// Leaguepedia 수집(collect-leaguepedia.mjs) 이후에 실행하세요.
//
// 사용법: npm run collect:timeline
//   1) 우리 매치 ↔ LoL Esports 매치를 시간·팀 약칭으로 연결
//   2) 팀 로고 갱신 (기본 + 밝은 배경용, 팀 계보로 공유)
//   3) 골드 그래프가 없는 세트만 골라 수집 (게임당 약 40번 요청)
import { db, upsert } from './lib/db.mjs';
import { getAllEvents, getMatchDetails, getGoldTimeline, getTeams } from './lib/lolesports.mjs';

const CONCURRENCY = 4;
const HOUR = 3600000;

async function linkMatches() {
  const { data: teams, error: teamError } = await db.from('teams').select('id,short,esports_id');
  if (teamError) throw new Error(teamError.message);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const usedEsportsTeamIds = new Set(teams.map((t) => t.esports_id).filter(Boolean));

  const { data: matches, error } = await db
    .from('matches')
    .select('id,start_time,team1_id,team2_id')
    .eq('state', 'completed')
    .is('esports_id', null)
    .gte('start_time', '2024-01-01');
  if (error) throw new Error(error.message);
  if (!matches.length) return;

  console.log(`LoL Esports 일정 조회 중... (연결 안 된 매치 ${matches.length}개)`);
  const events = (await getAllEvents()).filter((e) => e.state === 'completed');
  const codesOf = (e) => e.match.teams.map((t) => t.code.toUpperCase()).sort().join('|');

  let linked = 0;
  const unlinked = [];
  for (const m of matches) {
    const t = Date.parse(m.start_time);
    const ours = [teamById.get(m.team1_id), teamById.get(m.team2_id)];
    const ourCodes = ours.map((x) => (x.short || '').toUpperCase()).sort().join('|');

    // 1순위: 팀 약칭이 같고 12시간 이내. 2순위: 약칭이 달라도 30분 이내 경기가 딱 하나
    let event = events.find((e) => codesOf(e) === ourCodes && Math.abs(Date.parse(e.startTime) - t) < 12 * HOUR);
    if (!event) {
      const near = events.filter((e) => Math.abs(Date.parse(e.startTime) - t) < HOUR / 2);
      if (near.length === 1) event = near[0];
    }
    if (!event) {
      unlinked.push(`${m.start_time} ${ourCodes}`);
      continue;
    }

    const details = await getMatchDetails(event.match.id);
    const { error: matchError } = await db.from('matches').update({ esports_id: event.match.id }).eq('id', m.id);
    if (matchError) throw new Error(matchError.message);

    // LoL Esports 팀 id: 약칭이 같은 팀에만 저장 (로고는 updateLogos 에서)
    for (const et of details.teams) {
      const team = ours.find((x) => (x.short || '').toUpperCase() === et.code.toUpperCase());
      if (!team || team.esports_id || usedEsportsTeamIds.has(et.id)) continue;
      await db.from('teams').update({ esports_id: et.id }).eq('id', team.id);
      team.esports_id = et.id;
      usedEsportsTeamIds.add(et.id);
    }

    for (const g of details.games.filter((x) => x.state === 'completed')) {
      await db.from('games').update({ esports_id: g.id }).eq('match_id', m.id).eq('game_number', g.number);
    }
    linked++;
  }
  console.log(`  연결 ${linked}개, 실패 ${unlinked.length}개`);
  for (const u of unlinked.slice(0, 10)) console.log(`   - ${u}`);
}

// 골드 그래프가 아직 없는 세트 (Supabase 는 한 번에 1000행까지라 나눠서 읽음)
async function getTargets() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('game_teams')
      .select('game_id, games!inner(esports_id, blue_team_id, red_team_id)')
      .eq('side', 'blue')
      .is('gold_diff_15', null)
      .not('games.esports_id', 'is', null)
      .order('game_id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// 이름 비교용: "Rogue (European Team)" → "rogue", "Evil Geniuses.NA" → "evilgeniuses"
const normName = (s) =>
  s
    .toLowerCase()
    .replace(/\s*\(.*\)|\.[a-z]+$/g, '')
    .replace(/[^a-z0-9]/g, '');

// 경기로 연결되지 않은 팀(2024년 이전에만 국제대회에 나온 해외 팀 등)을 LoL Esports 팀 목록에서 이름·약칭으로 찾기
function findEsportsTeam(team, esTeams) {
  const withLogo = esTeams.filter((x) => x.logos.dark);
  const name = normName(team.name);
  const exact = withLogo.filter((x) => normName(x.name) === name);
  if (exact.length === 1) return exact[0];
  const byCode = withLogo.filter((x) => x.code?.toUpperCase() === team.short?.toUpperCase());
  if (byCode.length === 1) return byCode[0];
  const contains = (x) => normName(x.name).includes(name) || name.includes(normName(x.name));
  const codeAndName = byCode.filter(contains);
  if (codeAndName.length === 1) return codeAndName[0];
  const nameOnly = withLogo.filter(contains);
  if (nameOnly.length === 1) return nameOnly[0];

  // 후보가 여럿이면 (예: Cloud9 Kia / Cloud9 Challengers) 2군 팀을 빼고 가장 먼저 등록된 팀(본 팀)을 선택
  const main = (codeAndName.length ? codeAndName : nameOnly).filter(
    (x) => !/challengers|academy|akademi|amateur/i.test(x.name),
  );
  const byAge = (a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id);
  return main.sort(byAge)[0] ?? null;
}

// 팀 로고 갱신 (기본 로고 + 밝은 배경용 로고)
// LoL Esports 는 구단 하나에 팀 id 가 하나라서, 팀 계보(renamed_to)로 묶인 같은 구단의 모든 이름에 같은 로고를 저장
async function updateLogos() {
  const [esTeams, { data: teams, error }] = await Promise.all([
    getTeams(),
    db.from('teams').select('id,name,short,renamed_to,esports_id,image_url,image_url_light'),
  ]);
  if (error) throw new Error(error.message);
  const logos = new Map(esTeams.map((x) => [x.id, x.logos]));

  const root = new Map(teams.map((t) => [t.name, t.name]));
  const find = (n) => (root.get(n) === n ? n : find(root.get(n)));
  for (const t of teams) {
    if (t.renamed_to && root.has(t.renamed_to)) root.set(find(t.name), find(t.renamed_to));
  }

  // 구단 안에 LoL Esports 와 연결된 팀이 하나도 없으면 이름·약칭으로 찾아 연결
  const linkedOrgs = new Set(teams.filter((t) => t.esports_id).map((t) => find(t.name)));
  const usedIds = new Set(teams.map((t) => t.esports_id).filter(Boolean));
  let linked = 0;
  for (const t of teams) {
    if (linkedOrgs.has(find(t.name))) continue;
    const match = findEsportsTeam(t, esTeams);
    if (!match || usedIds.has(match.id)) continue;
    const { error: linkError } = await db.from('teams').update({ esports_id: match.id }).eq('id', t.id);
    if (linkError) throw new Error(linkError.message);
    t.esports_id = match.id;
    usedIds.add(match.id);
    linkedOrgs.add(find(t.name));
    linked++;
  }
  if (linked) console.log(`팀 이름으로 LoL Esports 연결 ${linked}개`);

  const logoOf = new Map();
  for (const t of teams) {
    const logo = t.esports_id && logos.get(t.esports_id);
    if (logo) logoOf.set(find(t.name), logo);
  }

  let changed = 0;
  for (const t of teams) {
    const logo = logoOf.get(find(t.name));
    if (!logo || (t.image_url === logo.dark && t.image_url_light === logo.light)) continue;
    const { error: updateError } = await db
      .from('teams')
      .update({ image_url: logo.dark, image_url_light: logo.light })
      .eq('id', t.id);
    if (updateError) throw new Error(updateError.message);
    changed++;
  }
  if (changed) console.log(`팀 로고 갱신 ${changed}개`);
}

async function collectTimelines() {
  const rows = await getTargets();
  console.log(`골드 그래프 수집 대상 세트 ${rows.length}개`);

  const { data: teams } = await db.from('teams').select('id,esports_id');
  const esportsIdOf = new Map(teams.map((t) => [t.id, t.esports_id]));

  let done = 0;
  let failed = 0;
  const queue = [...rows];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const g = row.games;
      try {
        const timeline = await getGoldTimeline(g.esports_id);
        if (!timeline || timeline.points.length < 16) throw new Error('데이터 부족');

        // Leaguepedia 와 블루/레드가 반대로 기록된 경우 바로잡기
        const swapped = timeline.blueTeamId && timeline.blueTeamId === esportsIdOf.get(g.red_team_id);
        const points = timeline.points.map((p) => ({
          game_id: row.game_id,
          minute: p.minute,
          blue_gold: swapped ? p.red : p.blue,
          red_gold: swapped ? p.blue : p.red,
        }));
        await upsert('game_gold_timeline', points, 'game_id,minute');

        const at15 = points.find((p) => p.minute === 15);
        const diff = at15.blue_gold - at15.red_gold;
        await db.from('game_teams').update({ gold_diff_15: diff }).eq('game_id', row.game_id).eq('side', 'blue');
        await db.from('game_teams').update({ gold_diff_15: -diff }).eq('game_id', row.game_id).eq('side', 'red');
        done++;
      } catch (err) {
        failed++;
        console.log(`  ⚠ 세트 ${row.game_id} 실패: ${err.message}`);
      }
      if ((done + failed) % 50 === 0) console.log(`  진행 ${done + failed}/${rows.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`완료: 골드 그래프 ${done}개, 실패 ${failed}개`);
}

async function main() {
  await linkMatches();
  await updateLogos();
  await collectTimelines();
}

main().catch((err) => {
  console.error('수집 실패:', err.message);
  process.exit(1);
});
