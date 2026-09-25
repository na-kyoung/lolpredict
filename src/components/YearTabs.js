import Link from 'next/link';
import styles from './YearTabs.module.css';

// 연도 선택 줄. params: 함께 유지할 다른 쿼리스트링 (예: { role: 'mid' })
export default function YearTabs({ basePath, years, year, params = {} }) {
  const href = (y) => {
    const query = new URLSearchParams({ ...params, year: String(y) });
    return `${basePath}?${query}`;
  };
  return (
    <nav className={styles.years} aria-label="연도 선택">
      {years.map((y) => (
        <Link key={y} href={href(y)} className={y === year ? styles.active : styles.year}>
          {y}
        </Link>
      ))}
    </nav>
  );
}
