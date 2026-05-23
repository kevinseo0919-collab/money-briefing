require('dotenv').config();
const { analyzeKeyword } = require('./keyword-free');
const { collectKPI } = require('./kpi-collector');
const fs = require('fs');
const yaml = require('yaml');
const dayjs = require('dayjs');

// 동시 요청 수를 제한해 네이버 API rate-limit/버스트 실패를 줄인다
async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return out;
}

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

  // Phase 2: 키워드 분석 (병렬) — 하루 10개 = 급상승 4 + 시드 6
  const TOTAL = 10, N_RISING = 4;
  // 급상승 판별을 위해 후보를 넉넉히(최대 30개) 분석한다
  const sample = uncovered.sort(() => Math.random() - 0.5).slice(0, 30);
  const analyzed = (await mapLimit(sample, 5, k => analyzeKeyword(k).catch(() => null))).filter(Boolean);
  const eligible = analyzed.filter(k => k.competition !== 'HIGH'); // 고경쟁(블로그 글 5만+) 제외

  // 급상승: DataLab 트렌드 상승폭(rising_score)이 양수인 것 중 상위 N_RISING개
  const rising = eligible
    .filter(k => k.rising_score != null && k.rising_score > 0)
    .sort((a, b) => b.rising_score - a.rising_score)
    .slice(0, N_RISING)
    .map(k => ({ ...k, source: '급상승' }));
  const picked = new Set(rising.map(k => k.keyword));

  // 시드: 나머지 후보로 채워 총 TOTAL개를 맞춘다 (급상승이 4개 미만이면 시드가 더 채워짐)
  const selected = [...rising];
  for (const k of eligible) {
    if (selected.length >= TOTAL) break;
    if (picked.has(k.keyword)) continue;
    selected.push({ ...k, source: '시드' });
    picked.add(k.keyword);
  }

  // Phase 3: 결과 저장 (Claude Code가 이후 /blog-new 실행)
  const outDir = `output/${today}_daily`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/keywords.json`, JSON.stringify(selected, null, 2));
  const risingCount = selected.filter(k => k.source === '급상승').length;
  console.log(`✅ ${selected.length}개 키워드 저장 (급상승 ${risingCount} + 시드 ${selected.length - risingCount}):`, `${outDir}/keywords.json`);
  console.log('다음: Claude Code에서 /blog-new "<키워드>" 실행');
}

run().catch(e => { console.error(e); process.exit(1); });
