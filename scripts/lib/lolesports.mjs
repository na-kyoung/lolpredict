// LoL Esports 비공식 API 클라이언트 (lolesports.com 이 내부적으로 쓰는 API)
// 공식 문서가 없어 예고 없이 바뀔 수 있습니다.

const GW = 'https://esports-api.lolesports.com/persisted/gw';
const FEED = 'https://feed.lolesports.com/livestats/v1';
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'; // lolesports.com 웹사이트에 공개된 키
export const LCK_LEAGUE_ID = '98767991310872058';

async function gw(path) {
  const res = await fetch(`${GW}/${path}`, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`LoL Esports HTTP ${res.status} (${path})`);
  return (await res.json()).data;
}

// LCK 전체 일정 (API 에 남아 있는 2024~ 전부)
export async function getAllEvents() {
  const events = [];
  let token = null;
  do {
    const data = await gw(
      `getSchedule?hl=ko-KR&leagueId=${LCK_LEAGUE_ID}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`,
    );
    events.push(...data.schedule.events);
    token = data.schedule.pages.older;
  } while (token);
  return events.filter((e) => e.match);
}

export async function getMatchDetails(matchId) {
  return (await gw(`getEventDetails?hl=ko-KR&id=${matchId}`)).event.match;
}

// livestats 는 10초 단위 시각만 받음
const alignTime = (ms) => new Date(Math.floor(ms / 10000) * 10000).toISOString().replace('.000Z', 'Z');

async function window(gameId, startMs) {
  const url = `${FEED}/window/${gameId}${startMs ? `?startingTime=${alignTime(startMs)}` : ''}`;
  const res = await fetch(url);
  if (res.status !== 200) return null;
  return res.json();
}

// 분 단위 골드 그래프. { blueTeamId, points: [{ minute, blue, red }] }
export async function getGoldTimeline(gameId) {
  const first = await window(gameId);
  if (!first?.frames?.length) return null;

  const t0 = Date.parse(first.frames[0].rfc460Timestamp);
  const points = [{ minute: 0, blue: first.frames[0].blueTeam.totalGold, red: first.frames[0].redTeam.totalGold }];
  for (let minute = 1; minute <= 80; minute++) {
    const w = await window(gameId, t0 + minute * 60000);
    const frame = w?.frames?.[0];
    if (!frame) break;
    points.push({ minute, blue: frame.blueTeam.totalGold, red: frame.redTeam.totalGold });
    if (w.frames.at(-1).gameState === 'finished') break;
  }
  return { blueTeamId: first.gameMetadata.blueTeamMetadata.esportsTeamId, points };
}
