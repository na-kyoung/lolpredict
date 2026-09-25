import Link from 'next/link';
import { notFound } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import ChampionIcon from '@/components/ChampionIcon';
import GoldChart from '@/components/GoldChart';
import Scoreboard from '@/components/Scoreboard';
import PredictionBar from '@/components/PredictionBar';
import { supabase, MATCH_COLUMNS } from '@/lib/supabase';
import { getChampions } from '@/lib/ddragon';
import { formatDate, formatTime } from '@/lib/format';
import { stageLabel, tournamentLabel } from '@/lib/labels';
import styles from './page.module.css';

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bottom', 'support'];

const STAT_ROWS = [
  ['kills', '킬'],
  ['total_gold', '골드'],
  ['towers', '타워'],
  ['inhibitors', '억제기'],
  ['dragons', '드래곤'],
  ['heralds', '전령'],
  ['void_grubs', '공허 유충'],
  ['barons', '바론'],
];

const duration = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

async function getMatch(id) {
  const { data, error } = await supabase.from('matches').select(MATCH_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const match = Number(id) ? await getMatch(id) : null;
  if (!match) return { title: '경기 없음' };
  return { title: `${match.team1.name} vs ${match.team2.name}` };
}

// /matches/123?game=2  (세트를 고르지 않으면 1세트)
export default async function MatchDetailPage({ params, searchParams }) {
  const { id } = await params;
  const { game: gameParam } = await searchParams;
  const match = Number(id) ? await getMatch(id) : null;
  if (!match) notFound();

  const { data: games, error } = await supabase
    .from('games')
    .select('id, game_number, duration_sec, patch, winner_id, blue_team_id, red_team_id')
    .eq('match_id', match.id)
    .order('game_number');
  if (error) throw new Error(error.message);

  const done = match.state === 'completed';
  const team1Won = done && match.winner_id === match.team1.id;
  const team2Won = done && match.winner_id === match.team2.id;

  return (
    <div className={`container ${styles.page}`}>
      <Link href={`/matches?year=${new Date(match.start_time).getUTCFullYear()}&t=${match.tournament.id}`}
        className={styles.back}>
        ← {tournamentLabel(match.tournament.name)} 일정
      </Link>

      <section className={styles.header}>
        <p className={styles.meta}>
          {tournamentLabel(match.tournament.name)} · {stageLabel(match.stage)}
          {match.best_of ? ` · Bo${match.best_of}` : ''}
          <br />
          {formatDate(match.start_time, { withYear: true })} {formatTime(match.start_time)}
        </p>
        <div className={styles.scoreLine}>
          <div className={`${styles.bigTeam} ${team2Won ? styles.lost : ''}`}>
            <TeamLogo team={match.team1} size={64} />
            <b>{match.team1.name}</b>
          </div>
          <div className={styles.bigScore}>
            {done ? (
              <>
                <span className={team1Won ? styles.winScore : undefined}>{match.team1_score}</span>
                <i>:</i>
                <span className={team2Won ? styles.winScore : undefined}>{match.team2_score}</span>
              </>
            ) : (
              <span className={styles.vs}>VS</span>
            )}
          </div>
          <div className={`${styles.bigTeam} ${team1Won ? styles.lost : ''}`}>
            <TeamLogo team={match.team2} size={64} />
            <b>{match.team2.name}</b>
          </div>
        </div>
      </section>

      <PredictionBar match={match} />

      {games.length ? (
        <GameSection match={match} games={games} gameParam={gameParam} />
      ) : (
        <p className={styles.empty}>아직 경기 기록이 없어요.</p>
      )}
    </div>
  );
}

async function GameSection({ match, games, gameParam }) {
  const game = games.find((g) => g.game_number === Number(gameParam)) ?? games[0];

  const [teamsRes, playersRes, timelineRes, champion] = await Promise.all([
    supabase.from('game_teams').select('*').eq('game_id', game.id),
    supabase
      .from('game_players')
      .select('side, role, champion, kills, deaths, assists, cs, gold, damage, player:player_id (id, name)')
      .eq('game_id', game.id),
    supabase.from('game_gold_timeline').select('minute, blue_gold, red_gold').eq('game_id', game.id).order('minute'),
    getChampions(),
  ]);
  for (const res of [teamsRes, playersRes, timelineRes]) if (res.error) throw new Error(res.error.message);

  const teamById = new Map([match.team1, match.team2].map((t) => [t.id, t]));
  const sides = ['blue', 'red'].map((side) => {
    const stats = teamsRes.data.find((t) => t.side === side) ?? {};
    const team = teamById.get(side === 'blue' ? game.blue_team_id : game.red_team_id);
    const players = playersRes.data
      .filter((p) => p.side === side)
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .map((p) => ({ ...p, champ: champion(p.champion) }));
    return { side, team, stats, players };
  });
  const [blue, red] = sides;
  const maxDamage = Math.max(0, ...playersRes.data.map((p) => p.damage ?? 0));
  const winner = teamById.get(game.winner_id);

  return (
    <>
      <nav className={styles.gameTabs} aria-label="세트 선택">
        {games.map((g) => (
          <Link
            key={g.id}
            href={`/matches/${match.id}?game=${g.game_number}`}
            className={g.id === game.id ? styles.activeGameTab : styles.gameTab}
            scroll={false}
          >
            {g.game_number}세트
            <small>{teamById.get(g.winner_id)?.short}</small>
          </Link>
        ))}
      </nav>

      <section className={styles.summary}>
        <span>
          <b className={styles.accent}>{winner?.name}</b> 승리
        </span>
        {game.duration_sec && <span>경기 시간 {duration(game.duration_sec)}</span>}
        {game.patch && <span>패치 {game.patch}</span>}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>팀 기록</h2>
        <div className={styles.compare}>
          <div className={styles.compareHead}>
            <span className={styles.blueText}>{blue.team.short || blue.team.name}</span>
            <span className={styles.redText}>{red.team.short || red.team.name}</span>
          </div>
          {STAT_ROWS.map(([key, label]) => {
            const b = blue.stats[key] ?? 0;
            const r = red.stats[key] ?? 0;
            const total = b + r || 1;
            return (
              <div key={key} className={styles.compareRow}>
                <span className={b > r ? styles.bold : undefined}>{b.toLocaleString('ko-KR')}</span>
                <div className={styles.compareBar}>
                  <div className={styles.blueBar} style={{ width: `${(b / total) * 100}%` }} />
                  <div className={styles.redBar} style={{ width: `${(r / total) * 100}%` }} />
                  <em>{label}</em>
                </div>
                <span className={r > b ? styles.bold : undefined}>{r.toLocaleString('ko-KR')}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>밴픽</h2>
        <div className={styles.draft}>
          {sides.map(({ side, team, stats }) => (
            <div key={side} className={styles.draftTeam}>
              <span className={side === 'blue' ? styles.blueText : styles.redText}>{team.short || team.name}</span>
              <div className={styles.draftRow}>
                <em>밴</em>
                {(stats.bans ?? []).map((c) => (
                  <ChampionIcon key={c} champ={champion(c)} size={30} dimmed />
                ))}
              </div>
              <div className={styles.draftRow}>
                <em>픽</em>
                {(stats.picks ?? []).map((c) => (
                  <ChampionIcon key={c} champ={champion(c)} size={30} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>골드 차 그래프</h2>
        {timelineRes.data.length ? (
          <GoldChart timeline={timelineRes.data} blueTeam={blue.team} redTeam={red.team} />
        ) : (
          <p className={styles.noData}>골드 그래프는 2024년 이후 경기만 제공돼요.</p>
        )}
      </section>

      <section className={styles.boards}>
        {sides.map((s) => (
          <Scoreboard
            key={s.side}
            team={s.team}
            side={s.side}
            win={game.winner_id === s.team.id}
            players={s.players}
            maxDamage={maxDamage}
          />
        ))}
      </section>
    </>
  );
}
