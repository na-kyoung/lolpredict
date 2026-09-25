// 수집 스크립트용 Supabase 클라이언트 (secret 키 사용 → 쓰기 가능)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 설정되지 않았습니다.');

export const db = createClient(url, key, { auth: { persistSession: false } });

const CHUNK_SIZE = 500;

// 여러 행을 나눠서 upsert. returning 을 주면 해당 컬럼을 모아서 돌려줍니다.
export async function upsert(table, rows, onConflict, returning) {
  const result = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    let query = db.from(table).upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict });
    if (returning) query = query.select(returning);
    const { data, error } = await query;
    if (error) throw new Error(`${table} 저장 실패: ${error.message}`);
    if (data) result.push(...data);
  }
  return result;
}

// 테이블 전체를 { key값: id } 맵으로 읽기 (Supabase 는 한 번에 1000행까지 주므로 나눠서 읽음)
export async function idMap(table, keyColumn) {
  const map = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(`id,${keyColumn}`).range(from, from + 999);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    for (const row of data) map.set(row[keyColumn], row.id);
    if (data.length < 1000) return map;
  }
}
