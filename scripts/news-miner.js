#!/usr/bin/env node
'use strict';
// Layer 2 신선도 — 네이버 뉴스 헤드라인에서 머니/정책 키워드를 매일 추출해
// 자가증식 풀(data/keyword-pool.json)에 적재한다. DataLab 죽어도 동작.
//
// 사용:
//   node scripts/news-miner.js           기본 쿼리로 마이닝
//   node scripts/news-miner.js --dry      추출만 보고 풀에 안 넣음
require('dotenv').config();
const axios = require('axios');
const { addCandidates, loadPool, savePool } = require('./keyword-expand');

// 최근 정책·머니 이슈를 가장 잘 끌어내는 광범위 쿼리. (너무 좁으면 같은 토픽만 반복)
const QUERIES = [
  '지원금 신청', '환급 신청', '신청 마감', '정책 시행',
  '장려금', '바우처', '청년 정책', '세금 마감', '수당 인상', '특례대출',
];

// 머니 의미를 가지는 어구의 종결 토큰. 헤드라인에서 이걸로 끝나는 N그램만 후보.
const MONEY_TAIL = /^(신청|환급|지원금|수당|장려금|바우처|대출|적금|공제|세|급여|특례|면제|감면|할인|보조금|보상금|쿠폰|연금|보험|예금|신고|마감|지급|시행|모집|개시|개편|상향|인상|확대)$/;

// 첫 토큰이 이런 일반 어구면 의미 없는 N그램 (예: "조건 신청", "대상 신청") → 컷
const STOP_FIRST = new Set([
  '지원','대상','조건','자격','사전','전원','안내','관련','사람','전부','만','안',
  '향','이','그','저','수','분','명','중','앞','뒤','때','곳','첫','전','후','등',
]);

// 헤드라인 정리: HTML 태그·엔티티 제거
function clean(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/gi, ' ').trim();
}

async function fetchNews(query) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=30&sort=date`;
  const { data } = await axios.get(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
    timeout: 8000,
  });
  return (data.items || []).map(i => clean(i.title));
}

// 헤드라인 → 머니 N그램 추출 (마지막 토큰이 MONEY_TAIL 인 1~3그램)
function extractMoneyKeywords(title) {
  const tokens = title
    .split(/[\s\[\]【】「」"'\(\)…,·:\-—–\/]+/)
    .map(t => t.replace(/[.,!?]+$/, '').trim())
    .filter(Boolean);
  const out = new Set();
  for (let i = 1; i < tokens.length; i++) {
    if (!MONEY_TAIL.test(tokens[i])) continue;
    // 직전 1~2 토큰 + 머니 종결 토큰
    for (let len = 1; len <= 2; len++) {
      const start = Math.max(0, i - len);
      const first = tokens[start];
      // 의미 없는 일반 어구로 시작하면 컷 ("조건 신청" 류)
      if (STOP_FIRST.has(first)) continue;
      // 첫 토큰이 단음절 한글이면(뜻 불명) 컷
      if (/^[가-힣]$/.test(first)) continue;
      // 첫 토큰이 숫자·통화만이면 컷 ("5000만원 지급" 류 — 주제어 없음)
      if (/^[\d,\.원만억]+$/.test(first)) continue;
      const phrase = tokens.slice(start, i + 1).join(' ');
      if (phrase.length < 4 || phrase.length > 25) continue;
      if (/^\d+\s*$/.test(phrase)) continue;
      out.add(phrase);
    }
  }
  return [...out];
}

async function mine({ dry = false } = {}) {
  const allTitles = (await Promise.all(QUERIES.map(q => fetchNews(q).catch(e => {
    console.warn(`뉴스 fetch 실패 (${q}): ${e.response?.status || e.message}`);
    return [];
  })))).flat();

  const dedupTitles = [...new Set(allTitles)];
  const cands = new Set();
  for (const t of dedupTitles) extractMoneyKeywords(t).forEach(k => cands.add(k));

  if (dry) {
    console.log(`📰 (dry) 헤드라인 ${dedupTitles.length}개 → 머니 키워드 ${cands.size}개`);
    [...cands].slice(0, 50).forEach(k => console.log('  ·', k));
    return { extracted: cands.size, added: 0 };
  }

  const pool = loadPool();
  const items = [...cands].map(k => ({ keyword: k, category: 'news', source: 'news-mined' }));
  const added = addCandidates(pool, items);
  savePool(pool);
  console.log(`📰 뉴스 마이닝: 헤드라인 ${dedupTitles.length}개 → 추출 ${cands.size}개 → 신규 ${added}개 풀에 적재`);
  return { extracted: cands.size, added };
}

if (require.main === module) {
  const dry = process.argv.includes('--dry');
  mine({ dry }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { mine, extractMoneyKeywords };
