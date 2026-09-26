// 사이트(서버 컴포넌트)에서 쓰는 Supabase 클라이언트 — 읽기 전용 publishable 키 사용
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

// 매치 목록 조회 시 공통으로 가져올 컬럼 (팀 정보 포함)
export const MATCH_COLUMNS = `
  id, start_time, stage, best_of, state, team1_score, team2_score, winner_id,
  team1:team1_id (id, name, short, image_url, image_url_light),
  team2:team2_id (id, name, short, image_url, image_url_light),
  tournament:tournament_id (id, name),
  predictions (model, team1_win_prob)
`;

// 매치의 경기 전 예측. { favorite: 팀, prob: 0.5~1, hit: true/false/null(경기 전) }
export function matchPrediction(match) {
  const pred = match.predictions?.[0];
  if (!pred) return null;
  const p = Number(pred.team1_win_prob);
  const favorite = p >= 0.5 ? match.team1 : match.team2;
  const done = match.state === 'completed';
  return {
    team1Prob: p,
    favorite,
    prob: Math.max(p, 1 - p),
    hit: done ? match.winner_id === favorite.id : null,
  };
}
