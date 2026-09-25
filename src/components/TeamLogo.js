import styles from './TeamLogo.module.css';

// 로고가 없는 팀(예전 팀명 등)은 약칭 글자로 대신 표시
export default function TeamLogo({ team, size = 32 }) {
  if (team.image_url) {
    return (
      // 외부 로고 이미지라 next/image 최적화 없이 그대로 사용
      // eslint-disable-next-line @next/next/no-img-element
      <img src={team.image_url} alt={team.name} width={size} height={size} className={styles.logo} />
    );
  }
  return (
    <span className={styles.fallback} style={{ width: size, height: size, fontSize: size * 0.3 }} title={team.name}>
      {(team.short || team.name).slice(0, 3)}
    </span>
  );
}
