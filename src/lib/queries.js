// 여러 페이지에서 쓰는 조회
import { supabase } from './supabase';

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// 데이터가 있는 연도 (최신순)
export async function getYears() {
  const rows = check(await supabase.from('tournaments').select('year'));
  return [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
}

// 쿼리스트링의 연도가 유효하면 그 연도, 아니면 최신 연도
export function pickYear(years, value) {
  return years.includes(Number(value)) ? Number(value) : years[0];
}

// { id → 팀 }  (통계 뷰는 팀 정보를 직접 붙일 수 없어서 따로 읽어 연결)
export async function getTeamMap() {
  const rows = check(await supabase.from('teams').select('id, name, short, image_url, image_url_light, renamed_to'));
  return new Map(rows.map((t) => [t.id, t]));
}

// { id → 선수 }  (Supabase 는 한 번에 1000행까지라 나눠서 읽음)
export async function getPlayerMap() {
  const map = new Map();
  for (let from = 0; ; from += 1000) {
    const rows = check(await supabase.from('players').select('id, name').range(from, from + 999));
    for (const p of rows) map.set(p.id, p);
    if (rows.length < 1000) return map;
  }
}

// 1000행이 넘을 수 있는 조회를 끝까지 읽기. makeQuery: () => supabase.from(...)... (range 전까지)
export async function fetchAll(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const data = check(await makeQuery().range(from, from + 999));
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// 해당 연도 대회 id 목록
export async function getTournamentIds(year) {
  const rows = check(await supabase.from('tournaments').select('id').eq('year', year));
  return rows.map((r) => r.id);
}

export { check };
