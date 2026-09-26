import Link from 'next/link';
import page from './Page.module.css';

export const COMPETITIONS = [
  ['lck', 'LCK'],
  ['intl', '국제대회'],
];

// LCK / 국제대회 선택. href(comp) 로 각 버튼 주소를 만듦. available 을 주면 그 목록만 표시
export default function CompTabs({ comp, href, available }) {
  const items = COMPETITIONS.filter(([key]) => !available || available.includes(key));
  if (items.length < 2) return null;
  return (
    <nav className={page.filters} aria-label="대회 구분">
      {items.map(([key, label]) => (
        <Link key={key} href={href(key)} className={key === comp ? page.activeChip : page.chip}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
