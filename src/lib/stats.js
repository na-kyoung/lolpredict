// 통계 숫자 표시

// 승률 "62.5%"
export function winRate(wins, games) {
  return games ? `${((wins / games) * 100).toFixed(1)}%` : '-';
}

// "32:15"
export function duration(sec) {
  if (sec == null) return '-';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// KDA 는 데스가 0이면 null 로 옴
export function kda(value) {
  return value == null ? 'Perfect' : Number(value).toFixed(2);
}

// 천 단위 쉼표, 없으면 "-"
export function num(value, digits) {
  if (value == null) return '-';
  const n = Number(value);
  return digits == null ? n.toLocaleString('ko-KR') : n.toFixed(digits);
}

// "+1,234" / "-567"
export function signed(value) {
  if (value == null) return '-';
  const n = Math.round(Number(value));
  return `${n > 0 ? '+' : ''}${n.toLocaleString('ko-KR')}`;
}

export const ROLE_LABELS = { top: '탑', jungle: '정글', mid: '미드', bottom: '원딜', support: '서폿' };
export const ROLE_ORDER = ['top', 'jungle', 'mid', 'bottom', 'support'];
