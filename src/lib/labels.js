// Leaguepedia 의 영어 대회·단계 이름을 한국어로 표시

const TOURNAMENT_WORDS = [
  // 국제대회 ("Worlds 2025 Main Event" → 연도를 뗀 "Worlds Main Event")
  ['Worlds Main Event', '월즈 본선'],
  ['Worlds Play-In', '월즈 플레이-인'],
  ['Worlds Qualifying Series', '월즈 예선'],
  ['MSI', 'MSI'],
  ['First Stand', 'First Stand'],
  ['Mid-Season Cup', '미드 시즌 컵'],
  // LCK
  ['Regional Finals', '월즈 선발전'],
  ['Summer Promotion', '승강전'],
  ['Season Play-In', '플레이-인'],
  ['Season Playoffs', '플레이오프'],
  ['Spring Playoffs', '스프링 플레이오프'],
  ['Summer Playoffs', '서머 플레이오프'],
  ['Spring', '스프링'],
  ['Summer', '서머'],
  ['Road to MSI', 'MSI 선발전'],
  ['Cup', 'LCK 컵'],
];

// "LCK 2026 Rounds 1-2" → "정규시즌 1-2R", "LCK 2021 Spring Playoffs" → "스프링 플레이오프"
export function tournamentLabel(name) {
  const label = name.replace(/LCK|\d{4}/g, '').replace(/\s+/g, ' ').trim();
  const rounds = label.match(/^Rounds (\d+)-(\d+)$/);
  if (rounds) return `정규시즌 ${rounds[1]}-${rounds[2]}R`;
  for (const [en, ko] of TOURNAMENT_WORDS) {
    if (label === en) return ko;
  }
  return label;
}

// Leaguepedia 가 동명이인 구분용으로 붙인 괄호 제거: "Zeka (Kim Geon-woo)" → "Zeka"
export function playerLabel(name) {
  return name.replace(/\s*\(.*\)$/, '');
}

// "Week 3" → "3주차", "Finals" → "결승"
export function stageLabel(stage) {
  if (!stage) return '';
  const week = stage.match(/^Week (\d+)$/);
  if (week) return `${week[1]}주차`;
  const round = stage.match(/^Round (\d+)$/);
  if (round) return `${round[1]}라운드`;
  const day = stage.match(/^Day (\d+)$/);
  if (day) return `${day[1]}일차`;
  const map = {
    Finals: '결승',
    Semifinals: '준결승',
    Quarterfinals: '8강',
    'Play-In': '플레이-인',
    Tiebreakers: '타이브레이커',
  };
  return map[stage] ?? stage;
}
