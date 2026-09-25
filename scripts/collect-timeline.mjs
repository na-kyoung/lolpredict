// LoL Esports API 로 2024~ 경기의 분 단위 골드 그래프와 팀 로고를 받아 DB 에 저장합니다.
// Leaguepedia 수집(collect-leaguepedia.mjs) 이후에 실행하세요.
//
// 사용법: npm run collect:timeline
//   1) 우리 매치 ↔ LoL Esports 매치를 시간·팀 약칭으로 연결
//   2) 팀 로고·LoL Esports 팀 id 저장
//   3) 골드 그래프가 없는 세트만 골라 수집 (게임당 약 40번 요청)
import { db, upsert } from './lib/db.mjs';
import { getAllEvents, getMatchDetails, getGoldTimeline } from './lib/lolesports.mjs';

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

    // 팀 로고·id: 약칭이 같은 팀에만 저장
    for (const et of details.teams) {
      const team = ours.find((x) => (x.short || '').toUpperCase() === et.code.toUpperCase());
      if (!team || team.esports_id || usedEsportsTeamIds.has(et.id)) continue;
      await db.from('teams').update({ esports_id: et.id, image_url: et.image }).eq('id', team.id);
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

// LoL Esports 는 구단 하나에 팀 id 가 하나라서 로고가 한 팀명에만 저장됨.
// 팀 계보(renamed_to)로 묶인 같은 구단의 다른 이름들에도 로고를 채움
export async function shareLogos() {
  const { data: teams, error } = await db.from('teams').select('id,name,renamed_to,image_url');
  if (error) throw new Error(error.message);

  const root = new Map(teams.map((t) => [t.name, t.name]));
  const find = (n) => (root.get(n) === n ? n : find(root.get(n)));
  for (const t of teams) {
    if (t.renamed_to && root.has(t.renamed_to)) root.set(find(t.name), find(t.renamed_to));
  }

  const logoOf = new Map();
  for (const t of teams) if (t.image_url) logoOf.set(find(t.name), t.image_url);
  let filled = 0;
  for (const t of teams) {
    const logo = logoOf.get(find(t.name));
    if (t.image_url || !logo) continue;
    await db.from('teams').update({ image_url: logo }).eq('id', t.id);
    filled++;
  }
  if (filled) console.log(`로고 공유 ${filled}개 팀`);
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
  await shareLogos();
  await collectTimelines();
}

main().catch((err) => {
  console.error('수집 실패:', err.message);
  process.exit(1);
});
