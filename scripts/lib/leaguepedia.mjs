// Leaguepedia (lol.fandom.com) Cargo API 클라이언트
// - 봇 비밀번호로 로그인해야 조회 제한이 완화됩니다.
// - 로그인 후에도 연속 요청 시 제한이 걸리므로 요청 간격을 두고, 막히면 점점 길게 기다렸다 재시도합니다.

const API = 'https://lol.fandom.com/api.php';
const USER_AGENT = 'lolpredict/0.1 (personal non-commercial project)';
const REQUEST_GAP_MS = 4000;
const RETRY_WAITS_MS = [10000, 20000, 40000, 80000, 160000];
const PAGE_SIZE = 500;

const cookies = new Map();
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(params, { post = false } = {}) {
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const body = new URLSearchParams({ format: 'json', ...params });
  const headers = {
    'User-Agent': USER_AGENT,
    Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  };
  const res = post
    ? await fetch(API, { method: 'POST', headers, body })
    : await fetch(`${API}?${body}`, { headers });

  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const i = pair.indexOf('=');
    cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
  if (!res.ok) throw new Error(`Leaguepedia HTTP ${res.status}`);
  return res.json();
}

export async function login() {
  const user = process.env.LEAGUEPEDIA_BOT_USER;
  const password = process.env.LEAGUEPEDIA_BOT_PASSWORD;
  if (!user || !password) throw new Error('LEAGUEPEDIA_BOT_USER / LEAGUEPEDIA_BOT_PASSWORD 가 설정되지 않았습니다.');

  const tokenRes = await request({ action: 'query', meta: 'tokens', type: 'login' });
  const res = await request(
    { action: 'login', lgname: user, lgpassword: password, lgtoken: tokenRes.query.tokens.logintoken },
    { post: true },
  );
  if (res.login?.result !== 'Success') {
    throw new Error(`Leaguepedia 로그인 실패: ${JSON.stringify(res.login)}`);
  }
}

async function cargoPage(params) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await request({ action: 'cargoquery', ...params });
    } catch (err) {
      res = { error: { code: err.message } };
    }
    if (!res.error) return res.cargoquery.map((row) => row.title);
    if (attempt >= RETRY_WAITS_MS.length) throw new Error(`Cargo 조회 실패: ${res.error.code}`);
    console.log(`  ${res.error.code} → ${RETRY_WAITS_MS[attempt] / 1000}초 후 재시도`);
    await sleep(RETRY_WAITS_MS[attempt]);
  }
}

// fields 는 { 결과키: 'Cargo필드' } 형태. (Cargo 는 필드명의 _ 를 공백으로 바꿔 돌려주므로 별칭을 붙여 받음)
// 결과를 모두 받을 때까지 PAGE_SIZE 단위로 넘겨 가며 조회합니다.
export async function cargoQuery({ tables, fields, where, orderBy }) {
  const fieldList = Object.entries(fields).map(([alias, field]) => `${field}=${alias}`).join(',');
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await cargoPage({
      tables,
      fields: fieldList,
      where,
      ...(orderBy && { order_by: orderBy }),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// 페이지 넘겨주기(redirect) 풀기. 예전 팀명 → 현재 팀 페이지 이름. { 원래이름: 최종이름 }
export async function resolveRedirects(titles) {
  const result = new Map(titles.map((t) => [t, t]));
  for (let i = 0; i < titles.length; i += 50) {
    const res = await request({ action: 'query', redirects: '1', titles: titles.slice(i, i + 50).join('|') });
    const normalized = new Map((res.query?.normalized ?? []).map((n) => [n.from, n.to]));
    const redirects = new Map((res.query?.redirects ?? []).map((r) => [r.from, r.to]));
    for (const t of titles.slice(i, i + 50)) {
      const n = normalized.get(t) ?? t;
      result.set(t, redirects.get(n) ?? n);
    }
  }
  return result;
}

// Cargo where 절에 넣을 문자열 값
export function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}
