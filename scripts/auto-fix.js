const fs = require('fs');
const { check, stripFrontmatter, isStructural } = require('./quality-check');

// 원문을 head(프론트매터) / body(본문) / tail(꼬리 섹션) 로 분해
function splitParts(text) {
  const fmMatch = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const head = fmMatch ? fmMatch[0] : '';
  const rest = head ? text.slice(head.length) : text;
  const tailIdx = rest.search(/^## (함께 읽으면 좋은 글|함께 보면 좋은 글|해시태그|썸네일 후킹 멘트|이미지 프롬프트)/m);
  const body = tailIdx >= 0 ? rest.slice(0, tailIdx) : rest;
  const tail = tailIdx >= 0 ? rest.slice(tailIdx) : '';
  return { head, body, tail };
}

// prose = 비어있지 않고, 구조 라인 아니고, 해시태그(#) 아님
function proseLine(line) {
  return line.trim() !== '' && !isStructural(line) && !/^\s*#\S/.test(line);
}

// ── 1) emphasis: 숫자/날짜/금액 자동 탐지해 「」 감싸기 (6회까지) ──
const NUM_TOKEN = /\d[\d,]*\s?(?:억\s?원|억|만원|만 원|원|개월|년|월|일|주|%|퍼센트)/;
function fixEmphasis(body, currentCount) {
  let need = 6 - currentCount;
  if (need <= 0) return { body, added: 0 };
  const lines = body.split('\n');
  let added = 0;
  for (let i = 0; i < lines.length && added < need; i++) {
    const line = lines[i];
    if (!proseLine(line)) continue;
    if (line.includes('「')) continue; // 이미 강조 있는 줄은 건너뜀
    const m = line.match(NUM_TOKEN);
    if (m) {
      const idx = line.indexOf(m[0]);
      lines[i] = line.slice(0, idx) + '「' + m[0] + '」' + line.slice(idx + m[0].length);
      added++;
    }
  }
  return { body: lines.join('\n'), added };
}

// ── 3) line_length: 60자 초과 prose 라인을 어절 단위로 줄바꿈 ──
function fixLineLength(body) {
  const lines = body.split('\n');
  let wrapped = 0;
  const out = [];
  for (const line of lines) {
    if (!proseLine(line) || line.length <= 60) { out.push(line); continue; }
    const words = line.split(' ');
    let cur = '';
    const pieces = [];
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > 60) { pieces.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) pieces.push(cur);
    if (pieces.length > 1) wrapped++;
    out.push(...pieces);
  }
  return { body: out.join('\n'), wrapped };
}

// ── 4) paragraph_density: 연속 prose 4줄 이상이면 빈 줄 자동 삽입 ──
function fixParagraphDensity(body) {
  const lines = body.split('\n');
  const out = [];
  let run = 0, inserted = 0;
  for (const line of lines) {
    if (line.trim() === '' || isStructural(line)) { out.push(line); run = 0; continue; }
    if (run === 3) { out.push(''); inserted++; run = 0; } // 3줄마다 빈 줄
    out.push(line);
    run++;
  }
  return { body: out.join('\n'), inserted };
}

// ── 5) length 부족: FAQ 직전에 보강 신호 마커 삽입 (실제 본문 생성은 /blog-fix) ──
function fixLengthSignal(body, len) {
  const signal = `<!-- AUTO-FIX: 본문 ${len}자 (1800 미달) → /blog-fix 로 추가 단락 1~2개 보강 필요 -->`;
  if (body.includes(signal.slice(0, 25))) return { body, signaled: false };
  const faqIdx = body.search(/^## 자주 묻는 질문/m);
  if (faqIdx >= 0) {
    return { body: body.slice(0, faqIdx) + signal + '\n\n' + body.slice(faqIdx), signaled: true };
  }
  return { body: body.trimEnd() + '\n\n' + signal + '\n', signaled: true };
}

function autoFix(file) {
  const text = fs.readFileSync(file, 'utf8');
  const before = check(file);
  const report = { file, applied: [], manual: [] };

  let { head, body, tail } = splitParts(text);

  // 3) line_length
  if (before.line_length && !before.line_length.passed) {
    const r = fixLineLength(body); body = r.body;
    report.applied.push(`line_length: ${r.wrapped}개 라인 줄바꿈`);
  }
  // 4) paragraph_density
  if (before.paragraph_density && !before.paragraph_density.passed) {
    const r = fixParagraphDensity(body); body = r.body;
    report.applied.push(`paragraph_density: 빈 줄 ${r.inserted}개 삽입`);
  }
  // 1) emphasis_count
  if (before.emphasis_count && !before.emphasis_count.passed) {
    const cur = (body.match(/「[^」]*」/g) || []).length;
    const r = fixEmphasis(body, cur); body = r.body;
    report.applied.push(`emphasis_count: 「」 ${r.added}개 추가`);
    if (cur + r.added < 6) report.manual.push('emphasis_count: 자동 탐지 토큰 부족 — 수동 강조 필요');
  }
  // 5) length 부족 → 신호만
  if (before.length && !before.length.passed && before.length.value < 1800) {
    const r = fixLengthSignal(body, before.length.value); body = r.body;
    if (r.signaled) report.applied.push('length: 보강 신호 마커 삽입(/blog-fix 필요)');
    report.manual.push(`length: 본문 ${before.length.value}자 → 실제 단락 보강은 /blog-fix 로 처리`);
  }
  // 6) 자동 수정 불가 → 보고만
  if (before.intro_pattern && !before.intro_pattern.passed)
    report.manual.push(`intro_pattern: ${before.intro_pattern.detail} — 도입부 재작성 필요`);
  if (before.cta_variety && !before.cta_variety.passed)
    report.manual.push('cta_variety: 마지막 단락 CTA 패턴 없음 — 응원/약속/질문/정리/경험 중 하나로 마무리 필요');

  fs.writeFileSync(file, head + body + tail);
  return report;
}

if (require.main === module) {
  console.log(JSON.stringify(autoFix(process.argv[2]), null, 2));
}
module.exports = { autoFix };
