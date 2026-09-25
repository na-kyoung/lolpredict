import styles from './Footer.module.css';

// Riot 팬 사이트 정책상 면책 문구, Leaguepedia(CC BY-SA) 출처 표기 필수
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p>
          lolpredict는 Riot Games가 보증하지 않으며, Riot Games 또는 League of Legends 제작·관리에 공식적으로
          관여하는 누구의 견해도 반영하지 않습니다. League of Legends와 Riot Games는 Riot Games, Inc.의 상표 또는
          등록 상표입니다.
        </p>
        <p>
          경기 데이터 출처:{' '}
          <a href="https://lol.fandom.com" target="_blank" rel="noreferrer">
            Leaguepedia
          </a>{' '}
          (CC BY-SA 3.0),{' '}
          <a href="https://lolesports.com" target="_blank" rel="noreferrer">
            LoL Esports
          </a>
        </p>
      </div>
    </footer>
  );
}
