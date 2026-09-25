import styles from './GoldChart.module.css';

const W = 1000;
const H = 200;

const fmt = (n) => `${n > 0 ? '+' : ''}${n.toLocaleString('ko-KR')}`;

// 분 단위 골드 차 그래프 (블루 - 레드). 0 위는 블루 우세, 아래는 레드 우세
export default function GoldChart({ timeline, blueTeam, redTeam }) {
  const points = timeline.map((p) => ({ minute: p.minute, diff: p.blue_gold - p.red_gold }));
  const lastMinute = points.at(-1).minute;
  const maxAbs = Math.max(2000, ...points.map((p) => Math.abs(p.diff)));
  const range = Math.ceil(maxAbs / 1000) * 1000;

  const x = (minute) => (minute / lastMinute) * W;
  const y = (diff) => H / 2 - (diff / range) * (H / 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.minute)},${y(p.diff)}`).join(' ');
  const area = `${line} L${W},${H / 2} L0,${H / 2} Z`;

  const ticks = [];
  for (let m = 0; m <= lastMinute; m += lastMinute > 40 ? 10 : 5) ticks.push(m);

  const at15 = points.find((p) => p.minute === 15);

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.caption}>
        <span className={styles.blue}>{blueTeam.short || blueTeam.name} 우세</span>
        {at15 && <span>15분 골드 차 {fmt(at15.diff)}</span>}
        <span className={styles.red}>{redTeam.short || redTeam.name} 우세</span>
      </figcaption>

      <div className={styles.plot}>
        <div className={styles.yLabels}>
          <span>{fmt(range)}</span>
          <span>0</span>
          <span>{fmt(-range)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg} role="img"
          aria-label="분 단위 골드 차 그래프">
          <defs>
            <clipPath id="gold-top">
              <rect x="0" y="0" width={W} height={H / 2} />
            </clipPath>
            <clipPath id="gold-bottom">
              <rect x="0" y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} className={styles.zero} vectorEffect="non-scaling-stroke" />
          <path d={area} className={styles.blueArea} clipPath="url(#gold-top)" />
          <path d={area} className={styles.redArea} clipPath="url(#gold-bottom)" />
          <path d={line} className={styles.line} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className={styles.xLabels}>
        {ticks.map((m) => (
          <span key={m} style={{ left: `${(m / lastMinute) * 100}%` }}>
            {m}분
          </span>
        ))}
      </div>
    </figure>
  );
}
