// scripts/research.js
// 키워드 1개에 대한 리서치 브리프 생성.
// 네이버 블로그/뉴스 검색으로 상위 노출 글의 제목·요약을 수집해
// Claude 가 초안을 쓸 때 참고할 자료(output/<날짜>/research/<키워드>.json)를 만든다.
//   사용법: node scripts/research.js "키워드"
'use strict';

const path = require('path');
const {
  PATHS,
  today,
  writeJson,
  log,
  warn,
  naverSearch,
  stripTags,
} = require('./lib/util');

// 검색 결과 항목 정규화
function normalize(items) {
  return (items || []).map((it) => ({
    title: stripTags(it.title),
    description: stripTags(it.description),
    link: it.link,
    source: stripTags(it.bloggername || it.originallink || ''),
    date: it.postdate || it.pubDate || '',
  }));
}

// 제목·요약에서 자주 등장하는 단어를 뽑아 "다뤄야 할 소재" 힌트로 제공
function topTerms(rows, limit = 15) {
  const freq = new Map();
  const stop = new Set(['그리고', '하지만', '있는', '있다', '하는', '이번', '관련', '대한', '위해']);
  for (const r of rows) {
    const text = `${r.title} ${r.description}`;
    for (const w of text.split(/[^가-힣a-zA-Z0-9]+/)) {
      if (w.length < 2 || stop.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

async function research(keyword) {
  log(`리서치 시작 — "${keyword}"`);

  const [blog, news] = await Promise.all([
    naverSearch('blog', keyword, { display: 20, sort: 'sim' }).catch((e) => {
      warn('블로그 검색 실패:', e.message);
      return { items: [], total: 0 };
    }),
    naverSearch('news', keyword, { display: 10, sort: 'date' }).catch((e) => {
      warn('뉴스 검색 실패:', e.message);
      return { items: [], total: 0 };
    }),
  ]);

  const blogRows = normalize(blog.items);
  const newsRows = normalize(news.items);

  const brief = {
    keyword,
    date: today(),
    naverBlogTotal: blog.total || 0,
    naverNewsTotal: news.total || 0,
    competitionHint:
      (blog.total || 0) > 500000 ? '경쟁 높음' : (blog.total || 0) > 50000 ? '경쟁 보통' : '경쟁 낮음',
    topTerms: topTerms([...blogRows, ...newsRows]),
    blogResults: blogRows,
    newsResults: newsRows,
    notes: [
      'topTerms 는 상위 노출 글에서 반복되는 소재 — 글에 자연스럽게 녹일 것.',
      '같은 제목/구성을 베끼지 말 것. duplicate-check 25% 기준을 통과해야 함.',
    ],
  };

  const safeName = keyword.replace(/[^\w가-힣]+/g, '_').slice(0, 40);
  const outFile = path.join(PATHS.output, today(), 'research', `${safeName}.json`);
  writeJson(outFile, brief);
  log(
    `완료 — 블로그 ${blogRows.length}건 / 뉴스 ${newsRows.length}건, ${brief.competitionHint}` +
      ` → ${path.relative(PATHS.root, outFile)}`
  );
  return brief;
}

if (require.main === module) {
  const keyword = process.argv.slice(2).join(' ').trim();
  if (!keyword) {
    warn('사용법: node scripts/research.js "키워드"');
    process.exit(1);
  }
  research(keyword).catch((err) => {
    warn('리서치 실패:', err.message);
    process.exit(1);
  });
}

module.exports = { research };
