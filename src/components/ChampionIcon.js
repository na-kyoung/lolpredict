import styles from './ChampionIcon.module.css';

// champ: getChampions() 로 찾은 { name, icon }
export default function ChampionIcon({ champ, size = 32, dimmed = false }) {
  const cls = dimmed ? `${styles.icon} ${styles.dimmed}` : styles.icon;
  if (!champ.icon) {
    return (
      <span className={`${cls} ${styles.fallback}`} style={{ width: size, height: size }} title={champ.name}>
        {champ.name.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={champ.icon} alt={champ.name} title={champ.name} width={size} height={size} className={cls} />
  );
}
