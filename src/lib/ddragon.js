// Riot Data Dragon: 챔피언 이미지·한국어 이름
// Leaguepedia 챔피언 이름("Jarvan IV")은 Data Dragon 영어 이름과 같아서 그대로 연결됨

const BASE = 'https://ddragon.leagueoflegends.com';
const DAY = 86400;

async function getJson(url) {
  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) throw new Error(`Data Dragon HTTP ${res.status}`);
  return res.json();
}

// [{ id: 'JarvanIV', en: 'Jarvan IV', name: '자르반 4세', icon }]
async function loadChampions() {
  const [version] = await getJson(`${BASE}/api/versions.json`);
  const [en, ko] = await Promise.all([
    getJson(`${BASE}/cdn/${version}/data/en_US/champion.json`),
    getJson(`${BASE}/cdn/${version}/data/ko_KR/champion.json`),
  ]);
  return Object.values(en.data).map((c) => ({
    id: c.id,
    en: c.name,
    name: ko.data[c.id]?.name ?? c.name,
    icon: `${BASE}/cdn/${version}/img/champion/${c.id}.png`,
  }));
}

// 영어 이름(Leaguepedia 표기)으로 찾는 함수: get('Jarvan IV') → { id, en, name, icon }
export async function getChampions() {
  const byName = new Map((await loadChampions()).map((c) => [c.en, c]));
  // 새 챔피언이 아직 Data Dragon 에 없으면 영어 이름만 표시
  return (name) => byName.get(name) ?? { id: null, en: name, name, icon: null };
}

// Data Dragon id 로 찾기 (챔피언 상세 페이지 주소용)
export async function getChampionById(id) {
  return (await loadChampions()).find((c) => c.id === id) ?? null;
}
