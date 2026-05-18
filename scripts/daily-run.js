require('dotenv').config();
const { analyzeKeyword } = require('./keyword-free');
const { collectKPI } = require('./kpi-collector');
const fs = require('fs');
const yaml = require('yaml');
const dayjs = require('dayjs');

async function run() {
  console.log('🚀 Daily run started:', new Date().toISOString());
  const today = dayjs().format('YYYY-MM-DD');

  // Phase 1: KPI 수집 + 키워드 풀 로드
  await collectKPI(process.env.BLOG_ID).catch(e => console.warn('KPI skip:', e.message));
  const banks = fs.readdirSync('keyword-bank').filter(f => f.endsWith('.yml'));
  const candidates = banks.flatMap(f => {
    const doc = yaml.parse(fs.readFileSync(`keyword-bank/${f}`, 'utf8')) || {};
    // 구조 1: { keywords: [...] }  |  구조 2: { 카테고리A: [...], 카테고리B: [...] }
    if (Array.isArray(doc.keywords)) return doc.keywords;
    return Object.entries(doc)
      .filter(([k, v]) => Array.isArray(v) && k !== 'covered')
      .flatMap(([, v]) => v);
  });

  // feed-pool 에 이미 적재된 키워드 자동 제외
  // 파일명 형식: "<순번>-<공백을_로_치환한_키워드>.<md|html>"
  const covered = new Set(
    fs.existsSync('feed-pool')
      ? fs.readdirSync('feed-pool')
          .filter(f => /\.(md|html)$/i.test(f))
          .map(f => f.replace(/\.(md|html)$/i, '').replace(/^\d+-/, '').replace(/_/g, ' '))
      : []
  );
  const uncovered = candidates.filter(k => !covered.has(k));
  console.log(`📋 키워드 풀 ${candidates.length}개 / 미작성 ${uncovered.length}개 (covered ${covered.size}개 자동 제외)`);
  if (uncovered.length === 0) {
    console.warn('⚠️  모든 키워드가 이미 작성됨. keyword-bank/*.yml 에 새 키워드를 추가하세요.');
    process.exit(0);
  }

  // Phase 2: Top 5 키워드 분석 (병렬)
  const sample = uncovered.sort(() => Math.random() - 0.5).slice(0, 10);
  const analyzed = await Promise.all(sample.map(k => analyzeKeyword(k).catch(() => null)));
  const top5 = analyzed.filter(Boolean).filter(k => k.competition !== 'HIGH').slice(0, 5);

  // Phase 3: 결과 저장 (Claude Code가 이후 /blog-new 실행)
  const outDir = `output/${today}_daily`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/keywords.json`, JSON.stringify(top5, null, 2));
  console.log('✅ Top 5 키워드 저장:', `${outDir}/keywords.json`);
  console.log('다음: Claude Code에서 /blog-new "<키워드>" 실행');
}

run().catch(e => { console.error(e); process.exit(1); });
