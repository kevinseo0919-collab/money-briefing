// 무료 키워드 도구: DataLab + 자동완성 + Google Trends
require('dotenv').config();
const axios = require('axios');
const googleTrends = require('google-trends-api');

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
    related_keywords: related.slice(0, 10)
  };
}

if (require.main === module) {
  const kw = process.argv[2];
  if (!kw) { console.error('Usage: node keyword-free.js <keyword>'); process.exit(1); }
  analyzeKeyword(kw).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { analyzeKeyword, getNaverAutocomplete, getDataLabTrend, getGoogleTrend, getCompetition };
