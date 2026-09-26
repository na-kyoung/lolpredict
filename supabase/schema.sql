-- lolpredict DB 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- 데이터 출처: Leaguepedia (경기 일정·결과·밴픽·선수 기록, 2020~)
--             LoL Esports API (분 단위 골드 그래프·팀 로고, 2024~)

-- 기존 테이블 삭제 (다시 만들 때용. 저장된 데이터도 모두 지워집니다)
drop table if exists team_ratings, predictions, game_gold_timeline, game_players,
  game_teams, games, matches, tournaments, players, teams cascade;

-- 팀 (Leaguepedia 팀 이름 기준)
create table teams (
  id           bigint generated always as identity primary key,
  name         text not null unique,      -- Leaguepedia 팀 이름 (T1, Gen.G ...)
  short        text,                      -- 약칭 (T1, GEN ...)
  renamed_to   text,                      -- 팀명이 바뀐 경우 새 이름 (Elo 연속성용)
  org_id       bigint references teams(id), -- 구단 id: 팀 계보의 가장 최근 팀 id (통계를 구단 단위로 묶음)
  image_url    text,                      -- 로고 (어두운 배경용, 기본)
  image_url_light text,                   -- 밝은 배경용 로고 (팀이 따로 제공하는 경우만)
  esports_id   text unique                -- LoL Esports API 팀 id (로고·골드 그래프 매핑용)
);

-- 선수
create table players (
  id           bigint generated always as identity primary key,
  name         text not null unique       -- Leaguepedia 선수 페이지 이름 (Faker ...)
);

-- 대회 (스플릿·플레이오프 단위)
create table tournaments (
  id            bigint generated always as identity primary key,
  overview_page text not null unique,     -- LCK/2021 Season/Spring Season
  name          text not null,            -- LCK 2021 Spring
  year          int  not null,
  start_date    date,
  end_date      date,
  is_playoffs   boolean not null default false
);

-- 매치 (한 대진, 예: T1 vs GEN 3:1). 앞으로 열릴 경기도 포함
create table matches (
  id            bigint generated always as identity primary key,
  lp_match_id   text not null unique,     -- Leaguepedia MatchId
  tournament_id bigint not null references tournaments(id),
  start_time    timestamptz not null,
  stage         text,                     -- Week 1, Playoffs Round 1 ...
  best_of       int,
  team1_id      bigint not null references teams(id),
  team2_id      bigint not null references teams(id),
  team1_score   int,
  team2_score   int,
  winner_id     bigint references teams(id),  -- 경기 전이면 null
  state         text not null default 'unstarted' check (state in ('unstarted', 'completed')),
  esports_id    text unique
);
create index on matches (start_time);
create index on matches (tournament_id);

-- 게임 (매치 안의 한 세트)
create table games (
  id            bigint generated always as identity primary key,
  lp_game_id    text not null unique,     -- Leaguepedia GameId
  match_id      bigint not null references matches(id) on delete cascade,
  game_number   int    not null,          -- 1세트, 2세트 ...
  start_time    timestamptz,
  blue_team_id  bigint not null references teams(id),
  red_team_id   bigint not null references teams(id),
  winner_id     bigint references teams(id),
  duration_sec  int,
  patch         text,                     -- 16.16
  esports_id    text unique               -- LoL Esports 게임 id (골드 그래프용)
);
create index on games (match_id);

-- 게임별 팀 기록
create table game_teams (
  game_id       bigint not null references games(id) on delete cascade,
  team_id       bigint not null references teams(id),
  side          text   not null check (side in ('blue', 'red')),
  win           boolean not null,
  kills         int,
  total_gold    int,
  towers        int,
  inhibitors    int,
  dragons       int,
  barons        int,
  heralds       int,
  void_grubs    int,
  bans          text[],                   -- 밴한 챔피언 (Leaguepedia 표기: Jarvan IV ...)
  picks         text[],                   -- 픽한 챔피언 (픽 순서)
  gold_diff_15  int,                      -- 15분 골드 차 (골드 그래프가 있는 2024~ 만)
  primary key (game_id, team_id)
);

-- 게임별 선수 기록
create table game_players (
  game_id       bigint not null references games(id) on delete cascade,
  player_id     bigint not null references players(id),
  team_id       bigint not null references teams(id),
  side          text   not null check (side in ('blue', 'red')),
  role          text   not null check (role in ('top', 'jungle', 'mid', 'bottom', 'support')),
  champion      text   not null,
  kills         int,
  deaths        int,
  assists       int,
  cs            int,
  gold          int,
  damage        int,                      -- 챔피언 대상 피해량
  vision_score  int,
  items         text[],
  primary key (game_id, player_id)
);
create index on game_players (champion);
create index on game_players (player_id);

-- 분 단위 골드 그래프 (LoL Esports API 가 있는 2024~ 경기만)
create table game_gold_timeline (
  game_id       bigint not null references games(id) on delete cascade,
  minute        int    not null,
  blue_gold     int    not null,
  red_gold      int    not null,
  primary key (game_id, minute)
);

-- AI 예측 (경기 전 계산한 승률을 저장해 적중률 공개에 사용)
create table predictions (
  match_id        bigint not null references matches(id) on delete cascade,
  model           text   not null,        -- elo_v1 ...
  team1_win_prob  numeric(4, 3) not null, -- 0.000 ~ 1.000
  created_at      timestamptz not null default now(),
  primary key (match_id, model)
);

-- 팀 Elo 레이팅 기록 (매치마다 갱신)
create table team_ratings (
  team_id       bigint not null references teams(id),
  match_id      bigint not null references matches(id) on delete cascade,
  rating        numeric(7, 2) not null,
  primary key (team_id, match_id)
);

-- 보안: 사이트 방문자는 읽기만 가능.
-- 쓰기는 수집 스크립트가 secret(service_role) 키로만 하며, 이 키는 RLS 를 우회합니다.
do $$
declare t text;
begin
  foreach t in array array['teams', 'players', 'tournaments', 'matches', 'games',
                           'game_teams', 'game_players', 'game_gold_timeline',
                           'predictions', 'team_ratings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;

-- Data API 접근 권한 (새 테이블을 자동 공개하지 않는 프로젝트 설정 대비)
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
notify pgrst, 'reload schema';
