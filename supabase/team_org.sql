-- 팀 통계를 구단 단위로 합치기 (2026-09-26 변경)
-- 시즌 중 팀명이 바뀐 구단(예: BRION → HANJIN BRION)이 같은 해에 두 줄로 나뉘던 문제 수정
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.

-- 구단 id: 팀 계보(renamed_to)의 가장 최근 팀 id. 수집 스크립트가 채움
alter table teams add column if not exists org_id bigint references teams(id);

-- 팀 연도별 통계: 팀 이름 → 구단 단위로 묶음
drop view if exists team_season_stats;
create view team_season_stats with (security_invoker = true) as
with game_rows as (
  select
    coalesce(tm.org_id, tm.id) as org_id, gt.team_id, t.year, g.start_time,
    gt.side, gt.win, gt.kills, opp.kills as deaths,
    gt.towers, gt.dragons, gt.barons, gt.gold_diff_15, g.duration_sec
  from game_teams gt
  join teams tm on tm.id = gt.team_id
  join game_teams opp on opp.game_id = gt.game_id and opp.team_id <> gt.team_id
  join games g on g.id = gt.game_id
  join matches m on m.id = g.match_id
  join tournaments t on t.id = m.tournament_id
),
game_agg as (
  select
    org_id, year,
    (array_agg(team_id order by start_time desc))[1] as team_id,  -- 그해 마지막으로 쓴 팀 이름
    count(*) as games,
    count(*) filter (where win) as wins,
    count(*) filter (where side = 'blue') as blue_games,
    count(*) filter (where side = 'blue' and win) as blue_wins,
    round(avg(kills), 1) as avg_kills,
    round(avg(deaths), 1) as avg_deaths,
    round(avg(duration_sec)) as avg_duration_sec,
    round(avg(gold_diff_15)) as avg_gold_diff_15,  -- 2024~ 만 값이 있음
    round(avg(towers), 1) as avg_towers,
    round(avg(dragons), 2) as avg_dragons,
    round(avg(barons), 2) as avg_barons
  from game_rows
  group by org_id, year
),
match_rows as (
  select coalesce(tm.org_id, tm.id) as org_id, t.year, m.winner_id = m.team1_id as win
  from matches m
  join teams tm on tm.id = m.team1_id
  join tournaments t on t.id = m.tournament_id
  where m.state = 'completed'
  union all
  select coalesce(tm.org_id, tm.id), t.year, m.winner_id = m.team2_id
  from matches m
  join teams tm on tm.id = m.team2_id
  join tournaments t on t.id = m.tournament_id
  where m.state = 'completed'
),
match_agg as (
  select org_id, year, count(*) as matches, count(*) filter (where win) as match_wins
  from match_rows
  group by org_id, year
)
select
  ga.*,
  coalesce(ma.matches, 0) as matches,
  coalesce(ma.match_wins, 0) as match_wins
from game_agg ga
left join match_agg ma on ma.org_id = ga.org_id and ma.year = ga.year;

grant select on team_season_stats to anon, authenticated, service_role;
notify pgrst, 'reload schema';
