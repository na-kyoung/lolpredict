-- lolpredict 통계 뷰
-- schema.sql 실행 후, Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- 뷰는 "저장된 조회문"이라 데이터가 늘어나면 통계도 자동으로 바뀝니다.
-- security_invoker: 조회하는 사람의 권한(읽기 전용)으로 실행

-- 선수 기록 한 줄 = 한 선수의 한 세트 (승패·팀 킬·경기 시간·연도 포함)
create or replace view player_game_rows with (security_invoker = true) as
select
  gp.game_id, gp.player_id, gp.team_id, gp.side, gp.role, gp.champion,
  gp.kills, gp.deaths, gp.assists, gp.cs, gp.gold, gp.damage,
  gt.win, gt.kills as team_kills,
  g.duration_sec, g.start_time, g.match_id,
  t.year, t.is_playoffs
from game_players gp
join game_teams gt on gt.game_id = gp.game_id and gt.team_id = gp.team_id
join games g on g.id = gp.game_id
join matches m on m.id = g.match_id
join tournaments t on t.id = m.tournament_id;

-- 선수 연도별 통계
create or replace view player_season_stats with (security_invoker = true) as
select
  player_id,
  year,
  (array_agg(team_id order by start_time desc))[1] as team_id,  -- 그해 마지막 소속팀
  mode() within group (order by role) as role,                  -- 가장 많이 뛴 포지션
  count(*) as games,
  count(*) filter (where win) as wins,
  round(avg(kills), 2) as avg_kills,
  round(avg(deaths), 2) as avg_deaths,
  round(avg(assists), 2) as avg_assists,
  -- 데스가 0이면 null (화면에서 Perfect 로 표시)
  round((sum(kills) + sum(assists))::numeric / nullif(sum(deaths), 0), 2) as kda,
  round(sum(cs)::numeric / nullif(sum(duration_sec), 0) * 60, 1) as cs_per_min,
  round(sum(gold)::numeric / nullif(sum(duration_sec), 0) * 60) as gold_per_min,
  -- 딜량이 없는 경기(2020년 일부)는 분모에서도 제외
  round(sum(damage)::numeric / nullif(sum(duration_sec) filter (where damage is not null), 0) * 60)
    as damage_per_min,
  round((sum(kills) + sum(assists))::numeric / nullif(sum(team_kills), 0) * 100, 1) as kill_participation,
  count(distinct champion) as champion_count
from player_game_rows
group by player_id, year;

-- 팀 연도별 통계
create or replace view team_season_stats with (security_invoker = true) as
with game_rows as (
  select
    gt.team_id, t.year, gt.side, gt.win, gt.kills, opp.kills as deaths,
    gt.towers, gt.dragons, gt.barons, gt.gold_diff_15, g.duration_sec
  from game_teams gt
  join game_teams opp on opp.game_id = gt.game_id and opp.team_id <> gt.team_id
  join games g on g.id = gt.game_id
  join matches m on m.id = g.match_id
  join tournaments t on t.id = m.tournament_id
),
game_agg as (
  select
    team_id, year,
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
  group by team_id, year
),
match_rows as (
  select m.team1_id as team_id, t.year, m.winner_id = m.team1_id as win
  from matches m join tournaments t on t.id = m.tournament_id
  where m.state = 'completed'
  union all
  select m.team2_id, t.year, m.winner_id = m.team2_id
  from matches m join tournaments t on t.id = m.tournament_id
  where m.state = 'completed'
)
select
  ga.*,
  count(mr.*) as matches,
  count(mr.*) filter (where mr.win) as match_wins
from game_agg ga
left join match_rows mr on mr.team_id = ga.team_id and mr.year = ga.year
group by ga.team_id, ga.year, ga.games, ga.wins, ga.blue_games, ga.blue_wins, ga.avg_kills, ga.avg_deaths,
  ga.avg_duration_sec, ga.avg_gold_diff_15, ga.avg_towers, ga.avg_dragons, ga.avg_barons;

grant select on player_game_rows, player_season_stats, team_season_stats to anon, authenticated, service_role;
notify pgrst, 'reload schema';
