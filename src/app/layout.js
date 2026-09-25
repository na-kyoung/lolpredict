import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './globals.css';

export const metadata = {
  title: {
    default: 'lolpredict - LCK 경기 기록·통계·승부예측',
    template: '%s | lolpredict',
  },
  description: 'LCK 경기 일정과 결과, 팀·선수·챔피언 통계, AI 승부예측',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
