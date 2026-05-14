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
    const ratios = data.results[0].data.map(d => d.ratio);
    return ratios.reduce((a,b)=>a+b,0) / ratios.length;
  } catch (e) {
    // DataLab API 미등록(401) 등은 치명적이지 않음 — trend_score 없이 진행
    console.warn(`DataLab 건너뜀 (${keyword}): ${e.response?.status || e.message}`);
    return null;
  }
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
  const [related, trend, comp] = await Promise.all([
    getNaverAutocomplete(keyword),
    getDataLabTrend(keyword),
    getCompetition(keyword)
  ]);
  const competition = comp < 10000 ? 'LOW' : comp < 50000 ? 'MEDIUM' : 'HIGH';
  return { keyword, trend_score: trend, competition, total_posts: comp, related_keywords: related.slice(0,10) };
}

if (require.main === module) {
  const kw = process.argv[2];
  if (!kw) { console.error('Usage: node keyword-free.js <keyword>'); process.exit(1); }
  analyzeKeyword(kw).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { analyzeKeyword, getNaverAutocomplete, getDataLabTrend, getCompetition };
