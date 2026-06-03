const fs = require('fs');
const path = require('path');
const { checkDuplicate } = require('./duplicate-check');

// ── 공용 헬퍼 (auto-fix.js 와 공유) ──────────────────────────────

// 프론트매터 제거
function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

// 본문 영역만 = 프론트매터 제외 + 꼬리 섹션(함께~/해시태그/썸네일/이미지) 이전
function extractBody(text) {
  const noFm = stripFrontmatter(text);
  const tailIdx = noFm.search(/^## (함께 읽으면 좋은 글|함께 보면 좋은 글|해시태그|썸네일 후킹 멘트|이미지 프롬프트)/m);
  return tailIdx >= 0 ? noFm.slice(0, tailIdx) : noFm;
}

// 인용구/콜아웃 라인 여부 (> 로 시작)
function isCallout(line) { return /^\s*>/.test(line); }
// 구조 라인(목록·표·헤더·마커)이라 prose 밀도 계산에서 제외할지
function isStructural(line) {
  return /^\s*>/.test(line)            // 인용구/콜아웃
    || /^\s*\|/.test(line)            // 표
    || /^\s*#/.test(line)             // 헤더
    || /^\s*\[이미지 자리/.test(line) // 이미지 마커
    || /^\s*\d+단계\s*[:：]/.test(line) // 절차 목록
    || /^\s*[-*]\s/.test(line);       // 불릿
}

// 최근 발행 feed-pool 글 N개 (날짜 frontmatter desc, 자기 자신 제외)
function recentFeedFiles(targetFile, poolDir, n = 7) {
  if (!fs.existsSync(poolDir)) return [];
  const targetAbs = path.resolve(targetFile);
  const all = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/^_quarantine$/.test(e.name)) walk(p); }
      else if (e.name.endsWith('.md') && !e.name.startsWith('_')) all.push(p);
    }
  })(poolDir);
  const dated = all
    .filter(p => path.resolve(p) !== targetAbs)
    .map(p => {
      const t = fs.readFileSync(p, 'utf8');
      const m = t.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
      return { p, date: m ? m[1] : '0000-00-00' };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return dated.slice(0, n).map(d => d.p);
}

function ngrams(text, k = 6) {
  const clean = text.replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i <= clean.length - k; i++) set.add(clean.slice(i, i + k));
  return set;
}
function jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// ── 신규 검증 항목 (2-1) ────────────────────────────────────────

// 1) line_length: 60자 초과 라인이 전체 비어있지 않은 라인의 5% 이상이면 fail
function checkLineLength(body) {
  const lines = body.split('\n').filter(l => l.trim() !== '');
  const over = lines.filter(l => l.length > 60);
  const ratio = lines.length ? over.length / lines.length : 0;
  return {
    passed: ratio < 0.05,
    detail: `${over.length}/${lines.length} 라인 60자 초과 (${(ratio * 100).toFixed(1)}%)`
  };
}

// 2) paragraph_density: 빈 줄 없이 연속된 prose 텍스트 라인 4줄 이상 단락이 1개라도 있으면 fail
function checkParagraphDensity(body) {
  const lines = body.split('\n');
  let run = 0, maxRun = 0, dense = 0;
  for (const l of lines) {
    if (l.trim() === '' || isStructural(l)) { run = 0; continue; }
    run++;
    if (run > maxRun) maxRun = run;
    if (run === 4) dense++; // 4줄째 도달하는 단락 카운트
  }
  return {
    passed: maxRun < 4,
    detail: `최대 연속 prose ${maxRun}줄, 4줄 이상 단락 ${dense}개`
  };
}

// 3) emphasis_count: 「」 강조 6회 이상
function checkEmphasis(body) {
  const count = (body.match(/「[^」]*」/g) || []).length;
  return { passed: count >= 6, detail: `「」 강조 ${count}회` };
}

// 4) image_placeholder: "[이미지 자리" 마커 4개 이상
function checkImagePlaceholder(body) {
  const count = (body.match(/\[이미지 자리/g) || []).length;
  return { passed: count >= 4, detail: `이미지 자리 마커 ${count}개` };
}

// 5) table_or_checklist: "| ---" 또는 "> 📋" 또는 "> 📊" 1개 이상
function checkTableOrChecklist(body) {
  const found = /\|\s*---/.test(body) || body.includes('> 📋') || body.includes('> 📊');
  return { passed: found, detail: found ? '표/체크리스트 콜아웃 존재' : '표/체크리스트 없음' };
}

// 6) intro_pattern: 도입부 첫 200자가 최근 7개 글과 6-gram Jaccard 30% 미만
function checkIntroPattern(targetFile, body, poolDir) {
  const intro = body.replace(/\s+/g, '').slice(0, 200);
  const introGrams = ngrams(intro);
  let maxSim = 0, maxFile = '';
  for (const f of recentFeedFiles(targetFile, poolDir, 7)) {
    const otherIntro = extractBody(fs.readFileSync(f, 'utf8')).replace(/\s+/g, '').slice(0, 200);
    const sim = jaccard(introGrams, ngrams(otherIntro));
    if (sim > maxSim) { maxSim = sim; maxFile = path.basename(f); }
  }
  return {
    passed: maxSim < 0.30,
    detail: `도입부 최대 유사도 ${(maxSim * 100).toFixed(1)}% (${maxFile || '비교대상 없음'})`
  };
}

// 7) cta_variety: 마지막 단락이 5종 CTA(응원/약속/질문/정리/경험) 중 하나
const CTA_PATTERNS = {
  응원: /응원|화이팅|잘 ?(되|하|챙)|힘내|함께|됐으면|되(길|면)|바라|바랄게요|도움이 ?(됐|되|돼)/,
  약속: /다음|또 ?(만나|뵐|뵙|정리|올릴|준비|찾|봐요)|준비할게요|알려드릴게요|이어서|브리핑에서/,
  질문: /\?|궁금|댓글|어떠세요|있으세요|남겨|공유해/,
  정리: /핵심|정리하면|요약|한 ?줄로|다시 ?짚|마지막으로|결국/,
  경험: /저도|제 ?경험|경험상|해보니|겪|느꼈|후회/
};
function checkCtaVariety(body) {
  // 마지막 비어있지 않은 단락(꼬리 섹션 제외된 body 기준)
  const paras = body.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const last = paras.slice(-2).join('\n'); // 마지막 1~2단락
  const matched = Object.entries(CTA_PATTERNS).filter(([, re]) => re.test(last)).map(([k]) => k);
  return {
    passed: matched.length > 0,
    detail: matched.length ? `CTA 유형: ${matched.join('/')}` : 'CTA 패턴 미검출'
  };
}

// ── 메인 ────────────────────────────────────────────────────────

function check(file) {
  const text = fs.readFileSync(file, 'utf8');
  const banned = ['최고의', '최저가', '확실히', '100%', '보장'];

  const body = extractBody(text);
  // 분량은 실제 prose 기준 — 이미지 자리 마커·HTML 주석 제외 후 공백 제외
  const proseOnly = body
    .replace(/\[이미지 자리[^\]]*\]/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const len = proseOnly.replace(/\s/g, '').length;

  const faqCount = (text.match(/^Q\d/gm) || []).length;
  const hasGreeting = /안녕하세요|반갑습니다/.test(text.slice(0, 200));
  const hasBanned = banned.filter(w => text.includes(w));
  const hasBold = text.includes('**'); // 별표 볼드 금지
  const dup = checkDuplicate(file, 'feed-pool');

  const result = {
    // 기존 항목 유지
    length: { value: len, passed: len >= 1800 && len <= 2200 },
    faq_count: { value: faqCount, passed: faqCount >= 6 },
    greeting: { passed: hasGreeting },
    banned_words: { found: hasBanned, passed: hasBanned.length === 0 },
    bold_markdown: { found: hasBold, passed: !hasBold },
    duplicate: dup,
    mobile_format: { passed: text.includes('>') && text.split('\n\n').length > 10 },
    // 신규 7항목 (2-1)
    line_length: checkLineLength(body),
    paragraph_density: checkParagraphDensity(body),
    emphasis_count: checkEmphasis(body),
    image_placeholder: checkImagePlaceholder(body),
    table_or_checklist: checkTableOrChecklist(body),
    intro_pattern: checkIntroPattern(file, body, 'feed-pool'),
    cta_variety: checkCtaVariety(body)
  };
  result.overall_passed = Object.values(result).every(v => v.passed !== false);
  return result;
}

if (require.main === module) {
  console.log(JSON.stringify(check(process.argv[2]), null, 2));
}
module.exports = {
  check,
  // 헬퍼 export (auto-fix 재사용)
  stripFrontmatter, extractBody, isStructural, isCallout, recentFeedFiles
};
