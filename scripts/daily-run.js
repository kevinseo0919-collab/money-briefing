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
  // 일반 시드는 `_` 로 시작하지 않는 .yml 만 (특수 파일 _seasonal.yml 은 별도 처리)
  const banks = fs.readdirSync('keyword-bank').filter(f => f.endsWith('.yml') && !f.startsWith('_'));
  const candidates = banks.flatMap(f => {
    const doc = yaml.parse(fs.readFileSync(`keyword-bank/${f}`, 'utf8')) || {};
    // 구조 1: { keywords: [...] }  |  구조 2: { 카테고리A: [...], 카테고리B: [...] }
    if (Array.isArray(doc.keywords)) return doc.keywords;
    return Object.entries(doc)
      .filter(([k, v]) => Array.isArray(v) && k !== 'covered')
      .flatMap(([, v]) => v);
  });

  // Layer 1: 시즌 캘린더 — 이번 달 시즌 키워드를 시드 후보에 가산 (DataLab 없어도 매일 안정 공급)
  try {
    const seasonal = yaml.parse(fs.readFileSync('keyword-bank/_seasonal.yml', 'utf8')) || {};
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const seasonalToday = (seasonal[mm] || []).map(k => String(k).trim()).filter(Boolean);
    candidates.push(...seasonalToday);
    if (seasonalToday.length) console.log(`🗓 시즌 키워드 ${seasonalToday.length}개 (${mm}월) 가산`);
  } catch (e) { /* 시즌 파일 없으면 무시 */ }

  // feed-pool 에 이미 적재된 키워드 자동 제외
  // 파일명 형식: "<순번>-<공백을_로_치환한_키워드>.<md|html>"
  // feed-pool 하위 폴더(주차별 보관 등)까지 재귀적으로 파일명 수집 → 이미 작성한 키워드 제외
  const listFeedNames = (dir) =>
    !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? listFeedNames(`${dir}/${e.name}`)
        : (/\.(md|html)$/i.test(e.name) ? [e.name] : [])
    );
  const covered = new Set(
    listFeedNames('feed-pool')
      .map(f => f.replace(/\.(md|html)$/i, '').replace(/^\d+-/, '').replace(/_/g, ' '))
  );
  let uncovered = candidates.filter(k => !covered.has(k));

  // 자가증식 풀(keyword-expand): 사용가능 후보가 부족하면 자동완성으로 보충하고 상위 후보를 병합
  const expand = require('./keyword-expand');

  // Layer 2: 뉴스 마이너 — 매일 새벽 헤드라인에서 머니 키워드 추출해 풀에 적재
  try {
    await require('./news-miner').mine();
    await expand.score(20).catch(() => {}); // 새 뉴스 후보 채점 (오늘 바로 사용 가능)
  } catch (e) { console.warn('news-mine skip:', e.message); }

  // 블랙리스트(keyword-bank/_blocklist.txt) 적용 — 시드 미작성에서 제외 (풀 topCandidates는 내부에서 자체 적용)
  const block = expand.loadBlocklist();
  const blocked = uncovered.filter(k => block.has(k.trim().replace(/\s+/g, ' ')));
  uncovered = uncovered.filter(k => !block.has(k.trim().replace(/\s+/g, ' ')));
  await expand.replenish(20).catch(e => console.warn('풀 보충 skip:', e.message));
  const poolTop = expand.topCandidates(40); // Golden Score 상위 (미작성·미탈락·채점완료·미블랙)
  console.log(`📋 시드 미작성 ${uncovered.length}개 + 자가증식 풀 ${poolTop.length}개 (covered ${covered.size}개, 블랙 ${blocked.length}개 자동 제외)`);
  if (uncovered.length === 0 && poolTop.length === 0) {
    console.warn('⚠️  후보 고갈. `node scripts/keyword-expand.js` 로 풀을 채우거나 keyword-bank/*.yml 에 시드를 추가하세요.');
    process.exit(0);
  }

  // Phase 2: 키워드 분석 (병렬) — 하루 10개 = 급상승 + 풀(노출유리) + 시드
  const TOTAL = 10, N_RISING = 4;
  // 급상승 판별을 위해 시드 후보를 넉넉히(최대 30개) 분석한다
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
  const selected = [...rising];

  // 1순위 채움: 자가증식 풀의 Golden Score 상위 (이미 채점 = 노출 유리도 검증된 롱테일)
  for (const c of poolTop) {
    if (selected.length >= TOTAL) break;
    if (picked.has(c.keyword)) continue;
    selected.push({
      keyword: c.keyword, trend_score: c.trend_score ?? null, rising_score: c.rising_score ?? null,
      competition: c.competition, total_posts: c.total_posts,
      related_keywords: [], golden_score: c.score, category: c.category, source: '풀',
    });
    picked.add(c.keyword);
  }
  // 2순위 채움: 분석된 시드로 총 TOTAL개를 맞춘다
  for (const k of eligible) {
    if (selected.length >= TOTAL) break;
    if (picked.has(k.keyword)) continue;
    selected.push({ ...k, source: '시드' });
    picked.add(k.keyword);
  }

  // 연관어 환류: 이번에 분석한 시드의 자동완성 연관어를 풀에 적립 (다음 회차 자원 = 고갈 방지)
  try {
    const pool = expand.loadPool();
    const harvested = analyzed.flatMap(a => (a.related_keywords || []).map(k => ({ keyword: k, category: 'misc' })));
    const n = expand.addCandidates(pool, harvested);
    expand.savePool(pool);
    if (n) console.log(`♻️  연관어 ${n}개 풀에 환류`);
  } catch (e) { console.warn('환류 skip:', e.message); }

  // Phase 3: 결과 저장 (Claude Code가 이후 /blog-new 실행)
  const outDir = `output/${today}_daily`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/keywords.json`, JSON.stringify(selected, null, 2));
  const cnt = s => selected.filter(k => k.source === s).length;
  console.log(`✅ ${selected.length}개 키워드 저장 (급상승 ${cnt('급상승')} + 풀 ${cnt('풀')} + 시드 ${cnt('시드')}):`, `${outDir}/keywords.json`);
  console.log('다음: Claude Code에서 /blog-new "<키워드>" 실행');
}

run().catch(e => { console.error(e); process.exit(1); });
