-- 국제대회(월즈·MSI·First Stand·MSC) 추가 (2026-09-26 변경)
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요. (한 번만)
-- 1) 대회에 리그 구분 추가  2) 통계 뷰를 LCK / 국제대회 별로 다시 만들기
-- (아래 뷰 부분은 views.sql + champion_views.sql 과 같은 내용)

alter table tournaments add column if not exists league text not null default 'LCK';
alter table tournaments add column if not exists competition text
  generated always as (case when league = 'LCK' then 'lck' else 'intl' end) stored;


-- 다시 만들 때 컬럼이 바뀌면 교체가 안 되므로 먼저 삭제 (챔피언 뷰도 이 뷰들을 참조해서 함께 삭제됨)
drop view if exists champion_matchups, champion_role_stats, champion_season_stats,
  team_season_stats, player_season_stats, player_game_rows cascade;

-- 선수 기록 한 줄 = 한 선수의 한 세트 (승패·팀 킬·경기 시간·연도 포함)
create view player_game_rows with (security_invoker = true) as
select
  gp.game_id, gp.player_id, gp.team_id, gp.side, gp.role, gp.champion,
  gp.kills, gp.deaths, gp.assists, gp.cs, gp.gold, gp.damage,
  gt.win, gt.kills as team_kills,
  g.duration_sec, g.start_time, g.match_id,
  t.year, t.is_playoffs, t.league, t.competition
from game_players gp
join game_teams gt on gt.game_id = gp.game_id and gt.team_id = gp.team_id
join games g on g.id = gp.game_id
join matches m on m.id = g.match_id
join tournaments t on t.id = m.tournament_id;

-- 선수 연도별 통계
create view player_season_stats with (security_invoker = true) as
select
  player_id,
  year,
  competition,
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
group by player_id, year, competition;

-- 팀 연도별 통계 (구단 단위: 시즌 중 팀명이 바뀌어도 한 줄)
create view team_season_stats with (security_invoker = true) as
with game_rows as (
  select
    coalesce(tm.org_id, tm.id) as org_id, gt.team_id, t.year, t.competition, g.start_time,
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
    org_id, year, competition,
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
  group by org_id, year, competition
),
match_rows as (
  select coalesce(tm.org_id, tm.id) as org_id, t.year, t.competition, m.winner_id = m.team1_id as win
  from matches m
  join teams tm on tm.id = m.team1_id
  join tournaments t on t.id = m.tournament_id
  where m.state = 'completed'
  union all
  select coalesce(tm.org_id, tm.id), t.year, t.competition, m.winner_id = m.team2_id
  from matches m
  join teams tm on tm.id = m.team2_id
  join tournaments t on t.id = m.tournament_id
  where m.state = 'completed'
),
match_agg as (
  select org_id, year, competition, count(*) as matches, count(*) filter (where win) as match_wins
  from match_rows
  group by org_id, year, competition
)
select
  ga.*,
  coalesce(ma.matches, 0) as matches,
  coalesce(ma.match_wins, 0) as match_wins
from game_agg ga
left join match_agg ma on ma.org_id = ga.org_id and ma.year = ga.year and ma.competition = ga.competition;

grant select on player_game_rows, player_season_stats, team_season_stats to anon, authenticated, service_role;
notify pgrst, 'reload schema';


-- 챔피언 연도별 통계 (픽·밴·승률)
create or replace view champion_season_stats with (security_invoker = true) as
with picks as (
  select
    year, competition, champion,
    count(*) as picks,
    count(*) filter (where win) as wins,
    sum(kills) as kills, sum(deaths) as deaths, sum(assists) as assists,
    mode() within group (order by role) as main_role
  from player_game_rows
  group by year, competition, champion
),
bans as (
  select t.year, t.competition, b.champion, count(*) as bans
  from game_teams gt
  cross join lateral unnest(gt.bans) as b(champion)
  join games g on g.id = gt.game_id
  join matches m on m.id = g.match_id
  join tournaments t on t.id = m.tournament_id
  group by t.year, t.competition, b.champion
),
totals as (
  select t.year, t.competition, count(*) as total_games
  from games g
  join matches m on m.id = g.match_id
  join tournaments t on t.id = m.tournament_id
  group by t.year, t.competition
)
select
  coalesce(p.year, b.year) as year,
  coalesce(p.competition, b.competition) as competition,
  coalesce(p.champion, b.champion) as champion,
  coalesce(p.picks, 0) as picks,
  coalesce(p.wins, 0) as wins,
  p.kills, p.deaths, p.assists, p.main_role,
  coalesce(b.bans, 0) as bans,
  tot.total_games                               -- 픽률·밴률 분모 (그해 전체 세트 수)
from picks p
full join bans b on b.year = p.year and b.competition = p.competition and b.champion = p.champion
join totals tot on tot.year = coalesce(p.year, b.year) and tot.competition = coalesce(p.competition, b.competition);

-- 챔피언 포지션별 통계
create or replace view champion_role_stats with (security_invoker = true) as
select
  year, competition, champion, role,
  count(*) as picks,
  count(*) filter (where win) as wins,
  sum(kills) as kills, sum(deaths) as deaths, sum(assists) as assists
from player_game_rows
group by year, competition, champion, role;

-- 라인 상성: 같은 세트·같은 포지션에서 맞붙은 상대 챔피언별 전적
create or replace view champion_matchups with (security_invoker = true) as
select
  a.year, a.competition, a.role, a.champion, b.champion as opponent,
  count(*) as games,
  count(*) filter (where a.win) as wins
from player_game_rows a
join player_game_rows b on b.game_id = a.game_id and b.role = a.role and b.side <> a.side
group by a.year, a.competition, a.role, a.champion, b.champion;

grant select on champion_season_stats, champion_role_stats, champion_matchups to anon, authenticated, service_role;
notify pgrst, 'reload schema';
