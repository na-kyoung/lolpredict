import CompTabs from './CompTabs';
import page from './Page.module.css';

// 선택한 대회 구분(LCK/국제대회)에 아직 데이터가 없을 때
export default function NoData({ title, comp, basePath }) {
  return (
    <div className={`container ${page.page}`}>
      <h1 className={page.title}>{title}</h1>
      <CompTabs comp={comp} href={(c) => `${basePath}${c === 'intl' ? '?comp=intl' : ''}`} />
      <p className={page.empty}>아직 기록이 없어요. 데이터가 수집되면 표시돼요.</p>
    </div>
  );
}
