-- lolpredict 승부예측 테이블
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- (predictions, team_ratings 는 schema.sql 에 이미 있음)

-- 선수 Elo 점수 (예측 스크립트가 매일 갱신)
create table if not exists player_ratings (
  player_id   bigint primary key references players(id) on delete cascade,
  rating      numeric(7, 2) not null,
  games       int not null,                 -- 점수에 반영된 세트 수
  updated_at  timestamptz not null default now()
);

-- 현재 팀 전력 (파워랭킹): 가장 최근 선발 5명의 선수 Elo 평균
create table if not exists team_power (
  team_id        bigint primary key references teams(id) on delete cascade,
  rating         numeric(7, 2) not null,
  lineup         bigint[] not null,          -- 선수 id 5명 (탑·정글·미드·원딜·서폿 순)
  last_game_at   timestamptz,
  updated_at     timestamptz not null default now()
);

alter table player_ratings enable row level security;
alter table team_power enable row level security;
drop policy if exists "public read" on player_ratings;
drop policy if exists "public read" on team_power;
create policy "public read" on player_ratings for select using (true);
create policy "public read" on team_power for select using (true);

grant select on player_ratings, team_power to anon, authenticated;
grant all on player_ratings, team_power to service_role;
notify pgrst, 'reload schema';
