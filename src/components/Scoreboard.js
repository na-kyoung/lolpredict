import Link from 'next/link';
import ChampionIcon from './ChampionIcon';
import TeamLogo from './TeamLogo';
import { playerLabel } from '@/lib/labels';
import styles from './Scoreboard.module.css';

const ROLE_LABELS = { top: '탑', jungle: '정글', mid: '미드', bottom: '원딜', support: '서폿' };

const n = (v) => (v == null ? '-' : v.toLocaleString('ko-KR'));

// 한 팀의 선수 기록 표. players 는 포지션 순서로 정렬된 상태로 받음
// maxDamage: 두 팀 통틀어 가장 높은 딜량 (막대 길이 기준)
export default function Scoreboard({ team, side, win, players, maxDamage }) {
  return (
    <div className={styles.board}>
      <div className={`${styles.head} ${styles[side]}`}>
        <TeamLogo team={team} size={24} />
        <b>{team.name}</b>
        <span className={styles.sideLabel}>{side === 'blue' ? '블루' : '레드'}</span>
        <span className={win ? styles.win : styles.lose}>{win ? '승리' : '패배'}</span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.playerCol}>선수</th>
              <th>KDA</th>
              <th>CS</th>
              <th>골드</th>
              <th className={styles.damageCol}>딜량</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player.name}>
                <td className={styles.playerCol}>
                  <div className={styles.player}>
                    <ChampionIcon champ={p.champ} size={36} />
                    <div className={styles.playerText}>
                      <Link href={`/players/${p.player.id}`} className={styles.playerLink}>
                        {playerLabel(p.player.name)}
                      </Link>
                      <span>
                        {ROLE_LABELS[p.role]} ·{' '}
                        {p.champ.id ? (
                          <Link href={`/champions/${p.champ.id}`} className={styles.champLink}>
                            {p.champ.name}
                          </Link>
                        ) : (
                          p.champ.name
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className={styles.kda}>
                  {p.kills} / <em>{p.deaths}</em> / {p.assists}
                </td>
                <td>{n(p.cs)}</td>
                <td>{n(p.gold)}</td>
                <td className={styles.damageCol}>
                  <div className={styles.damage}>
                    <span>{n(p.damage)}</span>
                    <div className={styles.bar}>
                      <div
                        className={`${styles.fill} ${styles[side]}`}
                        style={{ width: `${maxDamage ? ((p.damage ?? 0) / maxDamage) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
