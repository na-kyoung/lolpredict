// LoL Esports 비공식 API 클라이언트 (lolesports.com 이 내부적으로 쓰는 API)
// 공식 문서가 없어 예고 없이 바뀔 수 있습니다.

const GW = 'https://esports-api.lolesports.com/persisted/gw';
const FEED = 'https://feed.lolesports.com/livestats/v1';
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'; // lolesports.com 웹사이트에 공개된 키
// 수집 대상 리그: LCK + 국제대회 (MSC 2020 은 LoL Esports API 에 없음 → 골드 그래프 없음)
export const LEAGUE_IDS = {
  LCK: '98767991310872058',
  Worlds: '98767975604431411',
  MSI: '98767991325878492',
  'First Stand': '113464388705111224',
};

async function gw(path) {
  const res = await fetch(`${GW}/${path}`, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`LoL Esports HTTP ${res.status} (${path})`);
  return (await res.json()).data;
}

// 수집 대상 리그의 전체 일정 (API 에 남아 있는 2024~ 전부)
export async function getAllEvents() {
  const events = [];
  for (const leagueId of Object.values(LEAGUE_IDS)) {
    let token = null;
    do {
      const data = await gw(
        `getSchedule?hl=ko-KR&leagueId=${leagueId}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`,
      );
      events.push(...data.schedule.events);
      token = data.schedule.pages.older;
    } while (token);
  }
  return events.filter((e) => e.match);
}

// 팀 로고: { 팀 id → { dark: 기본 로고, light: 밝은 배경용 로고(없으면 null) } }
// 로고 주소는 http 로 오지만 https 도 제공되므로 https 로 바꿔 저장 (사이트가 https 라서)
export async function getTeamLogos() {
  const https = (url) => url?.replace(/^http:\/\//, 'https://') ?? null;
  const teams = (await gw('getTeams?hl=ko-KR')).teams;
  return new Map(
    teams.map((t) => [
      t.id,
      { dark: https(t.image), light: t.alternativeImage && t.alternativeImage !== t.image ? https(t.alternativeImage) : null },
    ]),
  );
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
