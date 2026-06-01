#!/usr/bin/env node
/**
 * 홈피드(홈판) 노출 게이트 v1
 * ------------------------------------------------------------
 * 네이버는 홈피드 알고리즘을 공개하지 않는다. "확정 노출"은 불가능하다.
 * 이 스크립트는 공개된 동작 원리 + 실측 신호로 만든 "필요조건 게이트"다.
 *  - 하드 게이트(G): 하나라도 실패하면 홈피드 노출 거의 불가 → 무조건 통과해야 함
 *  - 점수 신호(S): 가점. 합계가 임계 이상이면 "홈피드 노림수" 등급
 * 통과 = 노출 "자격" 충족. 실제 노출 여부는 발행 후 유입경로(Layer3)로 검증·보정한다.
 *
 * 사용:
 *   node scripts/homefeed-gate.js feed-pool/132-파킹통장_추천_순위.md
 *   node scripts/homefeed-gate.js feed-pool/*.md          # 여러 개 일괄
 *   node scripts/homefeed-gate.js feed-pool/132-...md --json
 */
const fs = require('fs');

// ── 튜닝 가능한 임계값/가중치 (Layer3 검증 후 여기만 보정) ──────────────
const CFG = {
  minChars: 1100,          // 공백제외 최소 본문(너무 짧으면 체류·정보성 부족)
  maxChars: 2600,          // 너무 길면 홈피드 완독률 저하
  minFirstPerson: 3,       // 경험형 1인칭/감정 신호 최소 개수 (DIA+)
  minNumbers: 3,           // 구체 숫자(금액·%·기한) 최소 개수
  scoreThreshold: 8,       // 노림수 등급 컷
  highCpcClusters: /ISA|IRP|연금저축|퇴직연금|국채|배당|대출|대환|주담대|전세대출|보금자리|중도상환|카드|신용점수|할부|실손|운전자보험|태아보험|암보험|치아보험|종합소득세|양도|상속|증여|경정청구|절세|세무대리|기장/,
};

function analyze(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const fmM = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (fmM) for (const l of fmM[1].split('\n')) { const m = l.match(/^(\w+):\s*"?(.*?)"?\s*$/); if (m) fm[m[1]] = m[2]; }
  const body = fmM ? raw.slice(fmM[0].length) : raw;
  const title = fm.title || '';
  const keyword = fm.keyword || '';

  const charLen = body.replace(/\s/g, '').length;
  // 경험형/1인칭/감정 신호
  const fp = (body.match(/저는|제가|저도|봤더니|해봤|받았어요|냈어요|싶어서|기억이|후회|아까웠|놀랐|뭉클|솔직히|막막|당황|챙겨봤|돌려봤|갈아타보|신청해봤|이용해보/g) || []).length;
  // 구체 숫자(금액/%/기한/원/만원/년/일)
  const nums = (body.match(/\d[\d,]*\s*(만원|원|%|퍼센트|일|개월|년|만|억)/g) || []).length;
  // 스니펫(한 문장 요약) — 「」 강조 문장 존재
  const hasSnippet = /「[^」]{8,}」/.test(body);
  // 구조화 — 마크다운 표 또는 "항목 : 값" 3줄 이상 또는 한눈표 언급
  const hasTable = /\n\s*\|.*\|.*\n\s*\|?\s*-{2,}/.test(body) || /한눈|정리표|요약표/.test(body) ||
    (body.match(/^\s*[^\n:]{2,20}\s*[:：]\s*\S+/gm) || []).length >= 3;
  // 저장 유발
  const hasSave = /저장|스크랩|보관해|즐겨찾/.test(body);
  // 기한/금액 후킹
  const hasDeadline = /마감|까지|D-|기준일|신청기간|이내|전까지/.test(title + body);
  // 가독성(v4.0) — 평균 줄길이 짧고 빈 줄 충분
  const lines = body.split('\n');
  const textLines = lines.filter(l => l.trim());
  const avgLineLen = textLines.length ? textLines.reduce((a, l) => a + l.length, 0) / textLines.length : 0;
  const blankRatio = lines.filter(l => !l.trim()).length / Math.max(1, lines.length);
  const readable = avgLineLen <= 45 && blankRatio >= 0.25;
  // 친근체
  const friendly = /요\.|요\?|어요|네요|까요|에요/.test(body);
  // 별표 볼드 금지(복붙 규칙)
  const noStarBold = !/\*\*/.test(body);
  // 광고 과다 톤(리드젠 페널티 회피)
  const adHeavy = /최저가|무료상담|지금 신청하세요|클릭|문의 주세요|제휴|광고료/.test(body);

  // 제목 신호
  const titleHasNum = /\d/.test(title);
  const titleLoss = /못 받|놓치|날립|아까|늦으면|모르면|손해|폭탄|0원|공짜/.test(title);
  const titleQuestion = /까요\?|나요\?|\?$|할까요|될까요/.test(title);
  // 내부링크
  const internalLinks = (body.match(/blog\.naver\.com\/syh2918|함께(하면|보면)|이전 글|관련 글/g) || []).length;
  // 고단가 브리지
  const bridge = CFG.highCpcClusters.test(keyword + title);

  // ── 하드 게이트 ──
  const gates = [
    ['G1 경험형 진정성(1인칭/감정 ' + fp + '개)', fp >= CFG.minFirstPerson],
    ['G2 구체 숫자(' + nums + '개)', nums >= CFG.minNumbers],
    ['G3 스니펫(요약 「」문장)', hasSnippet],
    ['G4 구조화(표/한눈정리)', hasTable],
    ['G5 가독성(v4.0)', readable && friendly],
    ['G6 저장 유발 장치', hasSave],
    ['G7 본문 길이 ' + charLen + '자(' + CFG.minChars + '~' + CFG.maxChars + ')', charLen >= CFG.minChars && charLen <= CFG.maxChars],
    ['G8 광고 과다 아님 / 별표볼드 없음', !adHeavy && noStarBold],
  ];

  // ── 점수 신호 ──
  const signals = [
    ['S1 제목 공식(숫자+손실회피)', (titleHasNum && titleLoss) ? 2 : (titleHasNum || titleLoss ? 1 : 0)],
    ['S2 기한/마감 후킹', hasDeadline ? 2 : 0],
    ['S3 질문형 후킹 제목', titleQuestion ? 1 : 0],
    ['S4 내부링크 ' + internalLinks + '개', internalLinks >= 2 ? 1 : 0],
    ['S5 고단가 브리지 주제', bridge ? 1 : 0],
    ['S6 경험형 강(1인칭 ' + fp + '≥5)', fp >= 5 ? 1 : 0],
    ['S7 숫자 풍부(' + nums + '≥6)', nums >= 6 ? 2 : 0],
  ];
  const score = signals.reduce((a, [, v]) => a + v, 0);
  const gatePass = gates.every(([, ok]) => ok);

  return { path, title, keyword, category: fm.category || '미분류', charLen, gates, signals, score, gatePass, bridge };
}

function fmt(r) {
  const L = [];
  L.push('━'.repeat(60));
  L.push('📄 ' + r.path);
  L.push('   ' + r.title);
  L.push('   [' + r.category + ']' + (r.bridge ? ' 💰고단가' : '') + '  ' + r.charLen + '자');
  L.push('── 하드 게이트 ' + (r.gatePass ? '✅ 통과' : '❌ 탈락') + ' ──');
  for (const [name, ok] of r.gates) L.push('  ' + (ok ? '✅' : '❌') + ' ' + name);
  L.push('── 점수 ' + r.score + '/10 ' + (r.score >= CFG.scoreThreshold ? '🎯 노림수' : '(노림수 컷 ' + CFG.scoreThreshold + ')') + ' ──');
  for (const [name, v] of r.signals) L.push('  ' + (v > 0 ? '＋' + v : ' 0') + ' ' + name);
  const verdict = r.gatePass ? (r.score >= CFG.scoreThreshold ? '🟢 홈피드 노림수 (집중 발행 권장)' : '🟡 노출 자격 충족 (가점 보강하면 노림수)') : '🔴 홈피드 부적합 (하드 게이트 보완 필수)';
  L.push('▶ 판정: ' + verdict);
  return L.join('\n');
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.error('사용법: node scripts/homefeed-gate.js <feed.md> [...]'); process.exit(1); }
const results = files.map(analyze);
if (asJson) { console.log(JSON.stringify(results, null, 2)); }
else {
  results.forEach(r => console.log(fmt(r)));
  if (results.length > 1) {
    const pass = results.filter(r => r.gatePass).length;
    const aim = results.filter(r => r.gatePass && r.score >= CFG.scoreThreshold).length;
    console.log('\n' + '═'.repeat(60));
    console.log(`📊 총 ${results.length}개 · 게이트통과 ${pass} · 노림수 ${aim}`);
  }
}

module.exports = { analyze, CFG };
