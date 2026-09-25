'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';

// 페이지가 생길 때마다 여기에 추가
const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/matches', label: '일정·결과' },
  { href: '/teams', label: '팀' },
  { href: '/players', label: '선수' },
  { href: '/champions', label: '챔피언' },
  { href: '/predict', label: '승부예측' },
];

export default function Header() {
  const pathname = usePathname();
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          lol<span>predict</span>
        </Link>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? `${styles.link} ${styles.active}` : styles.link}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
