// 무료 키워드 도구: DataLab + 자동완성 + Google Trends
// CPC는 모두 추정·비공식 수치임. 실제 값은 ±50% 변동 가능.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const axios = require('axios');
const googleTrends = require('google-trends-api');

// ── CPC 추정 (high-cpc.yml 기반) ────────────────────────────────
// 1) high-cpc.yml 에 키워드가 있으면 그 cpc_est 사용
// 2) 없으면 키워드 패턴(대출/청약·부동산/세금/보험·연금)으로 해당 카테고리 평균값 추정
// 3) 둘 다 아니면 기본값 1000
let _cpcCache = null;
function loadCpc() {
  if (_cpcCache) return _cpcCache;
  const exact = new Map();        // keyword → cpc_est
  const catAvg = {};              // category → 평균 cpc_est
  try {
    const file = path.join(__dirname, '..', 'keyword-bank', 'high-cpc.yml');
    const doc = yaml.parse(fs.readFileSync(file, 'utf8')) || {};
    for (const [cat, arr] of Object.entries(doc)) {
      if (!Array.isArray(arr)) continue;
      let sum = 0, n = 0;
      for (const o of arr) {
        if (o && o.keyword && o.cpc_est) { exact.set(o.keyword, o.cpc_est); sum += o.cpc_est; n++; }
      }
      if (n) catAvg[cat] = Math.round(sum / n);
    }
  } catch { /* 파일 없으면 패턴/기본값만 사용 */ }
  _cpcCache = { exact, catAvg };
  return _cpcCache;
}

// 키워드 패턴 → high-cpc.yml 카테고리 매핑 (위에서부터 먼저 매칭)
const CPC_PATTERNS = [
  ['loan',              /대출|전세자금|디딤돌|보금자리|햇살론|사잇돌|버팀목|주택연금|보증보험|반환보증/],
  ['realestate',        /청약|분양|종부세|종합부동산|부동산세|양도세|취득세|재산세|재건축|재개발|오피스텔|공시지가|전월세|특별공급|매입임대|비과세/],
  ['tax',               /소득세|부가세|연말정산|상속세|증여세|원천징수|법인세|절세|세액공제/],
  ['insurance_pension', /보험|연금|IRP|ISA|건강보험|고용보험|산재|실업급여|퇴직/]
];

function estimateCpc(keyword) {
  const { exact, catAvg } = loadCpc();
  if (exact.has(keyword)) return exact.get(keyword);          // 1) 정확 매칭
  for (const [cat, re] of CPC_PATTERNS) {                     // 2) 패턴 → 카테고리 평균
    if (re.test(keyword) && catAvg[cat]) return catAvg[cat];
  }
  return 1000;                                                // 3) 기본값
}

async function getNaverAutocomplete(keyword) {
  const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`;
  const { data } = await axios.get(url);
  return (data.items?.[0] || []).map(i => i[0]);
}

async function getDataLabTrend(keyword) {
  try {
    const today = new Date().toISOString().slice(0,10);
    const start = new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
    const { data } = await axios.post(
      'https://openapi.naver.com/v1/datalab/search',
      { startDate: start, endDate: today, timeUnit: 'date', keywordGroups: [{ groupName: keyword, keywords: [keyword] }] },
      { headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
        'Content-Type': 'application/json'
      }}
    );
    const ratios = (data.results?.[0]?.data || []).map(d => d.ratio);
    if (ratios.length === 0) return null; // 검색량이 적은 롱테일 키워드는 데이터 없음
    const r1 = n => Math.round(n * 10) / 10;
    const score = ratios.reduce((a, b) => a + b, 0) / ratios.length; // 평균 검색 관심도
    // 급상승 지표: 최근 절반 평균 - 이전 절반 평균 (양수·클수록 최근 검색이 가파르게 상승)
    const half = Math.floor(ratios.length / 2);
    const firstAvg = ratios.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
    const lastAvg = ratios.slice(half).reduce((a, b) => a + b, 0) / ((ratios.length - half) || 1);
    return { score: r1(score), rising: r1(lastAvg - firstAvg) };
  } catch (e) {
    // DataLab API 미등록(401) 등은 치명적이지 않음 — trend_score 없이 진행
    console.warn(`DataLab 건너뜀 (${keyword}): ${e.response?.status || e.message}`);
    return null;
  }
}

async function getGoogleTrend(keyword) {
  // 최선 노력(best-effort) 수요 신호 — DataLab 이 401 등으로 비면 대체로 쓴다.
  // google-trends 가 캡차/HTML 을 뱉으면 조용히 null 반환(파이프라인 비차단).
  try {
    const req = googleTrends.interestOverTime({
      keyword, geo: 'KR', startTime: new Date(Date.now() - 90 * 24 * 3600 * 1000),
    });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('gtrend timeout')), 4000));
    const raw = await Promise.race([req, timeout]);
    const vals = (JSON.parse(raw).default?.timelineData || []).map(d => Number(d.value?.[0] || 0));
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  } catch { return null; }
}

async function getCompetition(keyword) {
  const { data } = await axios.get(
    `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=10`,
    { headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
    }}
  );
  return data.total; // 총 결과 수가 적을수록 경쟁도 낮음
}

async function analyzeKeyword(keyword) {
  const [related, trend, comp, gtrend] = await Promise.all([
    getNaverAutocomplete(keyword),
    getDataLabTrend(keyword),
    getCompetition(keyword),
    getGoogleTrend(keyword)
  ]);
  const competition = comp < 10000 ? 'LOW' : comp < 50000 ? 'MEDIUM' : 'HIGH';
  return {
    keyword,
    trend_score: trend ? trend.score : null,
    rising_score: trend ? trend.rising : null, // 급상승 정렬용 (높을수록 최근 상승)
    trend_google: gtrend,                       // DataLab 대체용 수요 신호 (0~100, 없으면 null)
    competition,
    total_posts: comp,
    cpc_est: estimateCpc(keyword),              // 추정·비공식 CPC (high-cpc.yml 또는 패턴/기본값)
    related_keywords: related.slice(0, 10)
  };
}

if (require.main === module) {
  const kw = process.argv[2];
  if (!kw) { console.error('Usage: node keyword-free.js <keyword>'); process.exit(1); }
  analyzeKeyword(kw).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { analyzeKeyword, getNaverAutocomplete, getDataLabTrend, getGoogleTrend, getCompetition, estimateCpc };
