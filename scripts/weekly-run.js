#!/usr/bin/env node
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const dryRun = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const today = dayjs().format('YYYY-MM-DD');
const outDir = path.join('output', 'weekly-analysis', today);

const steps = [
  '1단계: 자체 블로그 진단 (feed-pool 통계 추출)',
  '2단계: 네이버 검색 트렌드 분석 (12개 키워드 상위 5개 수집)',
  '3단계: 격차 분석 (Gap Analysis 표 작성)',
  '4단계: 액션 플랜 자동 수립 (우선순위 3개)',
  '5단계: 자동 적용 + 변경 이력 기록 (knowledge/*.md 만)',
  '6단계: 사용자 보고 (REPORT.md 생성)',
];

console.log(`\n📅 Weekly Strategist — ${today}${dryRun ? ' (DRY RUN)' : ''}\n`);

if (dryRun) {
  console.log('실행 예정 단계:');
  steps.forEach(s => console.log(`  ▶ ${s}`));
  console.log(`\n출력 디렉터리(예정): ${outDir}/`);
  console.log('  ├─ self-diagnosis.md   (1단계, 스크립트 자동 생성)');
  console.log('  ├─ trend-analysis.md   (2단계, weekly-strategist 에이전트가 채움)');
  console.log('  ├─ gap-analysis.md     (3단계, 에이전트 작성)');
  console.log('  ├─ action-plan.md      (4단계, 에이전트 작성)');
  console.log('  ├─ changelog.md        (5단계, 자동 적용 시 기록)');
  console.log('  └─ REPORT.md           (6단계, 에이전트 요약)');
  console.log('\n참고:');
  console.log('  - 1단계만 이 스크립트가 자동 처리합니다.');
  console.log('  - 2~6단계는 Claude Code 세션에서 weekly-strategist 에이전트가 수행합니다.');
  console.log('  - launchd 트리거 시에도 1단계까지만 자동, 사람이 다음 날 확인.');
  console.log('\n(dry-run 종료 — 실제 실행은 --dry-run 없이)\n');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
console.log(`📁 출력 폴더: ${outDir}\n`);

// 1단계: 자체 블로그 진단 (자동)
console.log(`▶ ${steps[0]}`);
const feedPool = 'feed-pool';
const feedFiles = fs.existsSync(feedPool) ? fs.readdirSync(feedPool).filter(f => f.endsWith('.md')) : [];
const stats = feedFiles.map(f => {
  const c = fs.readFileSync(path.join(feedPool, f), 'utf8');
  const fmEnd = c.indexOf('\n---\n', 4);
  const body = fmEnd > 0 ? c.slice(fmEnd + 5) : c;
  const clean = body.replace(/```[\s\S]*?```/g, '').replace(/[#*_`>]/g, '').trim();
  const len = clean.replace(/\s/g, '').length;
  const kw = (c.match(/^keyword:\s*"([^"]+)"/m) || [])[1] || '';
  const kwCount = kw ? (clean.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 0;
  const density = len > 0 ? (kw.length * kwCount / len * 100).toFixed(2) : '0';
  const hasBadge = />\s*(💼|📋|👶|💰)\s*\*\*.+\*\*\s*\|/.test(c);
  const linkCount = (c.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  return { file: f, len, density, kwCount, linkCount, hasBadge };
});
const diag = `# 자체 블로그 진단 — ${today}\n\n총 ${feedFiles.length}개 글\n\n| 파일 | 본문 길이 | 키워드 밀도 | 키워드 등장 | 내부 링크 | 카테고리 배지 |\n|---|---:|---:|---:|---:|---|\n${stats.map(s => `| ${s.file} | ${s.len}자 | ${s.density}% | ${s.kwCount}회 | ${s.linkCount}개 | ${s.hasBadge ? '✅' : '❌'} |`).join('\n')}\n`;
fs.writeFileSync(path.join(outDir, 'self-diagnosis.md'), diag);
console.log(`  ✓ self-diagnosis.md 저장 (${feedFiles.length}개 글 분석)\n`);

// 2~5단계: placeholder (에이전트 채움)
console.log(`▶ ${steps[1]}`);
fs.writeFileSync(path.join(outDir, 'trend-analysis.md'),
`# 트렌드 분석 — ${today}\n\n_네이버 검색 1페이지 상위 블로그 수집은 Claude Code 세션에서 weekly-strategist 에이전트가 WebFetch/Bash 로 수행합니다._\n\n## 분석 대상 키워드 (카테고리별 3개)\n- 사장님 금융: \n- 정책이슈: \n- 육아경제: \n- 돈 일기: \n\n## 추출 항목\n- 제목 구조 비율 (숫자형/질문형/체크리스트형)\n- 평균 본문 길이\n- 첫 문장 패턴\n- 해시태그 개수와 종류\n`);
console.log(`  ✓ trend-analysis.md placeholder (에이전트 분석 대기)\n`);

console.log(`▶ ${steps[2]}`);
fs.writeFileSync(path.join(outDir, 'gap-analysis.md'),
`# 격차 분석 — ${today}\n\n_self-diagnosis.md 와 trend-analysis.md 종합 후 에이전트 작성._\n\n| 항목 | 케빈 | 상위 평균 | 격차 | 우선순위 |\n|---|---|---|---|---|\n| 제목 패턴 |  |  |  |  |\n| 본문 길이 |  |  |  |  |\n| 내부 링크 |  |  |  |  |\n| 인간미 요소 |  |  |  |  |\n`);
console.log(`  ✓ gap-analysis.md placeholder\n`);

console.log(`▶ ${steps[3]}`);
fs.writeFileSync(path.join(outDir, 'action-plan.md'),
`# 액션 플랜 — ${today}\n\n## 자동 적용 항목 (스스로 실행)\n- [ ] \n\n## 사용자 수동 항목\n- [ ] \n`);
console.log(`  ✓ action-plan.md placeholder\n`);

console.log(`▶ ${steps[4]}`);
fs.writeFileSync(path.join(outDir, 'changelog.md'),
`# 변경 이력 — ${today}\n\n_action-plan.md 자동 적용 항목 실행 시 이 파일에 기록됩니다._\n`);
console.log(`  ✓ changelog.md 초기화\n`);

console.log(`▶ ${steps[5]}`);
fs.writeFileSync(path.join(outDir, 'REPORT.md'),
`# 📊 주간 리포트 — ${today}\n\n## 한 페이지 요약\n_(에이전트가 종합 작성)_\n\n## 지난 주 성과\n- 발행 수: ${feedFiles.length}건 (누적)\n- 방문자 변화: (KPI 수집 후 기입)\n\n## 이번 주 핵심 발견 3가지\n1. \n2. \n3. \n\n## 자동 적용된 변경사항\n- changelog.md 참조\n\n## 사용자 수동 To-Do\n- [ ] \n- [ ] \n- [ ] \n- [ ] \n- [ ] \n\n## 다음 주 핵심 KPI\n- \n`);
console.log(`  ✓ REPORT.md 스켈레톤 생성\n`);

console.log(`✅ 1단계 자동 진단 완료. 분석 폴더: ${outDir}/`);
console.log(`📄 REPORT: ${path.join(outDir, 'REPORT.md')}\n`);
console.log(`다음: Claude Code 세션에서 weekly-strategist 에이전트를 호출해`);
console.log(`trend-analysis / gap-analysis / action-plan / REPORT 를 채워주세요.\n`);
