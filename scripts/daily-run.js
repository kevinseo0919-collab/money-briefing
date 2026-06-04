require('dotenv').config();
const { analyzeKeyword, estimateCpc } = require('./keyword-free');
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
  // seedMeta: keyword → { category, cpc_est?, intent? } — 카테고리/CPC 보존 (선정 가중·분산에 사용)
  const seedMeta = new Map();
  const candidates = banks.flatMap(f => {
    const doc = yaml.parse(fs.readFileSync(`keyword-bank/${f}`, 'utf8')) || {};
    const out = [];
    const add = (kw, category, extra = {}) => {
      const s = String(kw).trim();
      if (!s) return;
      out.push(s);
      if (!seedMeta.has(s)) seedMeta.set(s, { category, ...extra });
    };
    // 구조 1: { keywords: [...] } → 카테고리 = 파일명
    if (Array.isArray(doc.keywords)) {
      const cat = f.replace(/\.yml$/, '');
      doc.keywords.forEach(k => add(k, cat));
      return out;
    }
    // 구조 2: { 카테고리A: [...], 카테고리B: [...] } — 항목은 문자열 또는 {keyword,cpc_est,intent}
    for (const [cat, v] of Object.entries(doc)) {
      if (!Array.isArray(v) || cat === 'covered') continue;
      for (const item of v) {
        if (item && typeof item === 'object' && item.keyword) {
          add(item.keyword, cat, { cpc_est: item.cpc_est, intent: item.intent }); // high-cpc.yml 객체포맷
        } else {
          add(item, cat);
        }
      }
    }
    return out;
  });

  // Layer 1: 시즌 캘린더 — 이번 달 시즌 키워드를 시드 후보에 가산 (DataLab 없어도 매일 안정 공급)
  try {
    const seasonal = yaml.parse(fs.readFileSync('keyword-bank/_seasonal.yml', 'utf8')) || {};
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const seasonalToday = (seasonal[mm] || []).map(k => String(k).trim()).filter(Boolean);
    seasonalToday.forEach(k => { if (!seedMeta.has(k)) seedMeta.set(k, { category: 'season' }); });
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

  // Phase 2: 키워드 분석 (병렬) → 가중합 점수로 하루 TOTAL개 선정
  const TOTAL = 10;
  // 시드 후보를 넉넉히(최대 30개) 분석 (rising_score·cpc_est·경쟁도 확보)
  const sample = uncovered.sort(() => Math.random() - 0.5).slice(0, 30);
  const analyzed = (await mapLimit(sample, 5, k => analyzeKeyword(k).catch(() => null))).filter(Boolean);

  // 키워드 풀 잔여 강력 경고 (일 10건 모드 지속 가능성 체크)
  const poolRemain = uncovered.length + poolTop.length;
  if (poolRemain < 30) {
    console.warn(`⚠️⚠️  키워드 풀 잔여 ${poolRemain}개 (<30). 일 10건 모드 지속 불가 위험 — 즉시 \`node scripts/keyword-expand.js\` 또는 keyword-bank 시드 보충 필요!`);
  }

  // 후보 통합: 분석된 시드 + 자가증식 풀(이미 채점된 롱테일). HIGH 경쟁 제외(저품질·매몰 위험)
  const toCand = (k, fromPool) => ({
    keyword: k.keyword,
    trend_score: k.trend_score ?? null,
    rising_score: k.rising_score ?? null,
    competition: k.competition,
    total_posts: k.total_posts,
    cpc_est: k.cpc_est ?? estimateCpc(k.keyword),
    category: (fromPool ? k.category : seedMeta.get(k.keyword)?.category) || 'misc',
    golden_score: fromPool ? k.score : undefined,
    related_keywords: fromPool ? [] : (k.related_keywords || []),
  });
  const merged = [
    ...analyzed.filter(k => k.competition !== 'HIGH').map(k => toCand(k, false)),
    ...poolTop.filter(c => c.competition !== 'HIGH').map(c => toCand(c, true)),
  ];
  const seen = new Set();
  const cands = merged.filter(c => (seen.has(c.keyword) ? false : (seen.add(c.keyword), true)));

  // 가중합: 0.35*norm(rising) + 0.35*norm(cpc) + 0.30*competition (LOW=1·MEDIUM=0.5·HIGH=0)
  const risings = cands.map(c => Math.max(0, c.rising_score ?? 0)); // 음수·null → 0
  const cpcs = cands.map(c => c.cpc_est ?? 1000);
  const norm = arr => { const mn = Math.min(...arr), mx = Math.max(...arr), d = mx - mn; return x => d === 0 ? 0 : (x - mn) / d; };
  const nR = norm(risings), nC = norm(cpcs);
  cands.forEach((c, i) => {
    const compN = c.competition === 'LOW' ? 1 : c.competition === 'MEDIUM' ? 0.5 : 0;
    c.pick_score = Math.round((0.35 * nR(risings[i]) + 0.35 * nC(cpcs[i]) + 0.30 * compN) * 1000) / 1000;
  });
  cands.sort((a, b) => b.pick_score - a.pick_score);

  // 제약 선정: 고단가(cpc≥2500) 최대 4개(40%), 같은 카테고리 연속 3개 초과 금지(C-Rank 분산)
  const isHigh = c => (c.cpc_est ?? 0) >= 2500;
  const classify = c => isHigh(c) ? '고단가' : (c.rising_score ?? 0) > 0 ? '급상승' : '시드';
  const selected = [];
  const remaining = [...cands];
  let highCpc = 0;
  while (selected.length < TOTAL && remaining.length) {
    const tail = selected.slice(-3);
    const blockedCat = (tail.length === 3 && tail.every(s => s.category === tail[0].category)) ? tail[0].category : null;
    const fits = c => !(isHigh(c) && highCpc >= 4) && !(blockedCat && c.category === blockedCat);
    let idx = remaining.findIndex(fits);
    if (idx === -1) idx = remaining.findIndex(c => !(isHigh(c) && highCpc >= 4)); // 연속캡만 완화(고단가캡은 유지)
    if (idx === -1) break; // 남은 후보가 전부 고단가캡 초과
    const [c] = remaining.splice(idx, 1);
    c.source = classify(c);
    selected.push(c);
    if (isHigh(c)) highCpc++;
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
  const highCnt = selected.filter(k => (k.cpc_est ?? 0) >= 2500).length;
  console.log(`✅ ${selected.length}개 키워드 저장 (급상승 ${cnt('급상승')} + 고단가 ${cnt('고단가')} + 시드 ${cnt('시드')} | 고단가픽 ${highCnt}/4):`, `${outDir}/keywords.json`);
  console.log('다음: Claude Code에서 /blog-new "<키워드>" 실행');
}

run().catch(e => { console.error(e); process.exit(1); });
