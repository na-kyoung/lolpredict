// 날짜·시간 표시 (항상 한국 시간 기준)
const TIME_ZONE = 'Asia/Seoul';

// "2026-09-13" 형태의 한국 날짜 (날짜별 묶기용)
export function kstDateKey(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(iso));
}

// "9월 13일 (일)"
export function formatDate(iso, { withYear = false } = {}) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TIME_ZONE,
    ...(withYear && { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso));
}

// "14:00"
export function formatTime(iso) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
