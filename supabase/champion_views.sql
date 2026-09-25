-- lolpredict 챔피언 통계 뷰
-- views.sql 실행 후, Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.

-- 챔피언 연도별 통계 (픽·밴·승률)
create or replace view champion_season_stats with (security_invoker = true) as
with picks as (
  select
    year, champion,
    count(*) as picks,
    count(*) filter (where win) as wins,
    sum(kills) as kills, sum(deaths) as deaths, sum(assists) as assists,
    mode() within group (order by role) as main_role
  from player_game_rows
  group by year, champion
),
bans as (
  select t.year, b.champion, count(*) as bans
  from game_teams gt
  cross join lateral unnest(gt.bans) as b(champion)
  join games g on g.id = gt.game_id
  join matches m on m.id = g.match_id
  join tournaments t on t.id = m.tournament_id
  group by t.year, b.champion
),
totals as (
  select t.year, count(*) as total_games
  from games g
  join matches m on m.id = g.match_id
  join tournaments t on t.id = m.tournament_id
  group by t.year
)
select
  coalesce(p.year, b.year) as year,
  coalesce(p.champion, b.champion) as champion,
  coalesce(p.picks, 0) as picks,
  coalesce(p.wins, 0) as wins,
  p.kills, p.deaths, p.assists, p.main_role,
  coalesce(b.bans, 0) as bans,
  tot.total_games                               -- 픽률·밴률 분모 (그해 전체 세트 수)
from picks p
full join bans b on b.year = p.year and b.champion = p.champion
join totals tot on tot.year = coalesce(p.year, b.year);

-- 챔피언 포지션별 통계
create or replace view champion_role_stats with (security_invoker = true) as
select
  year, champion, role,
  count(*) as picks,
  count(*) filter (where win) as wins,
  sum(kills) as kills, sum(deaths) as deaths, sum(assists) as assists
from player_game_rows
group by year, champion, role;

-- 라인 상성: 같은 세트·같은 포지션에서 맞붙은 상대 챔피언별 전적
create or replace view champion_matchups with (security_invoker = true) as
select
  a.year, a.role, a.champion, b.champion as opponent,
  count(*) as games,
  count(*) filter (where a.win) as wins
from player_game_rows a
join player_game_rows b on b.game_id = a.game_id and b.role = a.role and b.side <> a.side
group by a.year, a.role, a.champion, b.champion;

grant select on champion_season_stats, champion_role_stats, champion_matchups to anon, authenticated, service_role;
notify pgrst, 'reload schema';
