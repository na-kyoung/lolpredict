# lolpredict

LCK(League of Legends Champions Korea) 경기 기록·통계·AI 승부예측 사이트

- **일정·결과**: 2020년~현재 LCK 전체 경기, 세트별 밴픽·스코어보드·골드 차 그래프(2024~)
- **팀·선수·챔피언 통계**: 연도·포지션별 통계, 챔피언 라인 상성
- **AI 승부예측**: 선수 개인 Elo 기반 예측 (이적·로스터 변경 반영), 파워랭킹, 적중률 공개

## 기술 스택

- Next.js (JavaScript, App Router) + CSS Modules
- Supabase (PostgreSQL)
- GitHub Actions (매일 데이터 수집), Vercel (배포)

## 데이터 출처

- [Leaguepedia](https://lol.fandom.com) (CC BY-SA 3.0): 경기 일정·결과·밴픽·선수 기록
- [LoL Esports](https://lolesports.com): 분 단위 골드 그래프·팀 로고 (비공식 API)
- [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon): 챔피언 이미지·이름

lolpredict는 Riot Games가 보증하지 않으며, Riot Games 또는 League of Legends 제작·관리에 공식적으로 관여하는 누구의 견해도 반영하지 않습니다.

## 로컬 실행

1. Supabase 프로젝트를 만들고 SQL Editor 에서 순서대로 실행
   `supabase/schema.sql` → `supabase/views.sql` → `supabase/champion_views.sql` → `supabase/prediction.sql`
2. `.env.local` 작성

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<프로젝트>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable 또는 anon 키>
   SUPABASE_SECRET_KEY=<secret 또는 service_role 키>
   LEAGUEPEDIA_BOT_USER=<Fandom아이디>@<봇이름>
   LEAGUEPEDIA_BOT_PASSWORD=<봇 비밀번호>
   ```

3. 설치·데이터 수집·실행

   ```bash
   npm install
   npm run collect -- --since=2020-01-01   # 최초 1회 전체 수집 (15~20분)
   npm run collect:timeline                 # 골드 그래프·팀 로고 (최초 1회 1시간 이상)
   npm run predict                          # 승부예측 계산
   npm run dev                              # http://localhost:3000
   ```

## 스크립트

| 명령 | 내용 |
|---|---|
| `npm run collect` | Leaguepedia 최근 경기 갱신 (`--since=YYYY-MM-DD` 로 기간 지정) |
| `npm run collect:timeline` | LoL Esports 골드 그래프·팀 로고 |
| `npm run predict` | 선수 Elo 예측 계산 후 저장 |
| `npm run backtest` | 예측 모델 백테스트 (팀·선수·혼합 Elo 비교) |
