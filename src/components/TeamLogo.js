import styles from './TeamLogo.module.css';

// 팀 로고. 밝은 배경용 로고가 따로 있으면 밝은 모드에서 그걸로 자동 교체 (<picture> 라 JS 불필요)
// 로고가 없는 팀(2024년 이전에 떠난 팀 등)은 약칭 글자로 대신 표시
export default function TeamLogo({ team, size = 32 }) {
  if (team.image_url) {
    return (
      <picture className={styles.picture}>
        {team.image_url_light && <source media="(prefers-color-scheme: light)" srcSet={team.image_url_light} />}
        {/* 외부 로고 이미지라 next/image 최적화 없이 그대로 사용 */}
        <img src={team.image_url} alt={team.name} width={size} height={size} className={styles.logo} />
      </picture>
    );
  }
  return (
    <span className={styles.fallback} style={{ width: size, height: size, fontSize: size * 0.3 }} title={team.name}>
      {(team.short || team.name).slice(0, 3)}
    </span>
  );
}
