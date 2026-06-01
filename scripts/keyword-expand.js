#!/usr/bin/env node
'use strict';
// 키워드 자가 증식 마이너 + 노출 유리도 스코어러.
// 시드를 네이버 자동완성으로 2-hop 확장해 풀(data/keyword-pool.json)을 스스로 불리고,
// "수요 vs 경쟁 vs 롱테일 vs 블로그맞춤"을 합친 Golden Score(0~100)로 정렬한다.
//
// 사용법:
//   node scripts/keyword-expand.js                 마이닝 + 미채점 20개 채점 + 통계
//   node scripts/keyword-expand.js --mine          자동완성 확장만 (채점 X)
//   node scripts/keyword-expand.js --score 30      미채점 후보 30개 채점
//   node scripts/keyword-expand.js --top 20        점수 상위 미작성 후보 20개 표
//   node scripts/keyword-expand.js --stats         풀 통계
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { analyzeKeyword, getNaverAutocomplete } = require('./keyword-free');

const POOL_PATH = path.join('data', 'keyword-pool.json');
const HOP2_SAMPLE = 120;     // 2-hop 확장 대상 표본 상한
const MAX_NEW_PER_RUN = 400; // 한 번에 추가할 신규 후보 상한
const HIGH_CPC = /(대출|세금|환급|공제|보험|카드|연말정산|부가세|소득세|종합소득세|연금|청약|이자|금리|수수료|절세|비과세|정책자금|지원금|장려금|급여|수당)/;

const norm = k => (k || '').trim().replace(/\s+/g, ' ');
const won = n => Math.round(n).toLocaleString('ko-KR');

async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return out;
}

// ── 시드 (카테고리 포함) ────────────────────────────────────────────────────
function loadSeeds() {
  const out = [];
  if (!fs.existsSync('keyword-bank')) return out;
  for (const f of fs.readdirSync('keyword-bank').filter(f => f.endsWith('.yml'))) {
    const doc = yaml.parse(fs.readFileSync(`keyword-bank/${f}`, 'utf8')) || {};
    if (Array.isArray(doc.keywords)) {
      const cat = doc.category || f.replace(/\.yml$/, '');
      doc.keywords.forEach(k => out.push({ keyword: norm(k), category: cat }));
    } else {
      for (const [k, v] of Object.entries(doc)) {
        if (Array.isArray(v) && k !== 'covered') v.forEach(x => out.push({ keyword: norm(x), category: k }));
      }
    }
  }
  return out;
}

// 시드 카테고리 맵 (covered 키워드의 카테고리 추정용)
function categoryGuesser(seeds) {
  return (kw) => {
    const k = norm(kw);
    for (const s of seeds) {
      const a = s.keyword;
      if (a && (k.includes(a) || a.includes(k.split(' ')[0]))) return s.category;
    }
    return 'misc';
  };
}

// ── covered (feed-pool 재귀) ────────────────────────────────────────────────
function listFeedNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? listFeedNames(path.join(dir, e.name))
      : (/\.(md|html)$/i.test(e.name) ? [e.name] : []));
}
function coveredSet() {
  return new Set(listFeedNames('feed-pool')
    .map(f => norm(f.replace(/\.(md|html)$/i, '').replace(/^\d+-/, '').replace(/_/g, ' '))));
}

// ── 풀 입출력 ───────────────────────────────────────────────────────────────
function loadPool() {
  try { return JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')); }
  catch { return { updated: null, candidates: [] }; }
}
function savePool(pool) {
  pool.updated = new Date().toISOString();
  fs.mkdirSync(path.dirname(POOL_PATH), { recursive: true });
  fs.writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2), 'utf8');
}

// 블랙리스트: 다시 떠올라도 자동 제외할 키워드 (keyword-bank/_blocklist.txt)
function loadBlocklist() {
  try {
    return new Set(fs.readFileSync(path.join('keyword-bank', '_blocklist.txt'), 'utf8')
      .split(/\r?\n/).map(l => norm(l.replace(/#.*$/, ''))).filter(Boolean));
  } catch { return new Set(); }
}

// 신규 후보 병합 (covered/블랙리스트/중복 제외). items: [{keyword, category, ac_rank?}]
function addCandidates(pool, items) {
  const cov = coveredSet();
  const block = loadBlocklist();
  const have = new Set(pool.candidates.map(c => c.keyword));
  let added = 0;
  for (const it of items) {
    const k = norm(it.keyword);
    if (!k || k.length < 2) continue;
    if (cov.has(k) || block.has(k) || have.has(k)) continue;
    pool.candidates.push({
      keyword: k, category: it.category || 'misc',
      ac_rank: it.ac_rank ?? null, source: it.source || 'mined',
      scored: false, added: new Date().toISOString().slice(0, 10),
    });
    have.add(k); added++;
    if (added >= MAX_NEW_PER_RUN) break;
  }
  return added;
}

// ── 마이닝: 자동완성 2-hop ──────────────────────────────────────────────────
async function mine() {
  const seeds = loadSeeds();
  if (!seeds.length) { console.warn('⚠️ keyword-bank 시드가 없습니다.'); return { added: 0 }; }

  // hop1: 시드 → 자동완성 10개 (카테고리 상속, 순위 보존)
  const hop1 = [];
  await mapLimit(seeds, 5, async s => {
    const ac = await getNaverAutocomplete(s.keyword).catch(() => []);
    ac.forEach((k, i) => hop1.push({ keyword: norm(k), category: s.category, ac_rank: i }));
  });

  // hop2: hop1 표본 → 다시 자동완성 (롱테일 심화)
  const cov = coveredSet();
  const hop1uniq = [...new Map(hop1.map(x => [x.keyword, x])).values()]
    .filter(x => !cov.has(x.keyword));
  const sample = hop1uniq.sort(() => Math.random() - 0.5).slice(0, HOP2_SAMPLE);
  const hop2 = [];
  await mapLimit(sample, 5, async s => {
    const ac = await getNaverAutocomplete(s.keyword).catch(() => []);
    ac.forEach((k, i) => hop2.push({ keyword: norm(k), category: s.category, ac_rank: i }));
  });

  const pool = loadPool();
  const added = addCandidates(pool, [...hop1, ...hop2]);
  savePool(pool);
  console.log(`🌱 마이닝: hop1 ${hop1.length} + hop2 ${hop2.length} → 신규 ${added}개 추가 (풀 총 ${pool.candidates.length})`);
  return { added, poolSize: pool.candidates.length };
}

// ── 블로그 상태(방문자)로 경쟁도 상한 결정 ──────────────────────────────────
function compCeiling() {
  try {
    const { computeSprint, loadEntries } = require('./kpi-log');
    const v = computeSprint(loadEntries()).avg7;
    if (v == null || v < 200) return { hard: 30000, ideal: 10000, label: `신생(일${v ?? '?'})` };
    if (v < 500) return { hard: 50000, ideal: 20000, label: `성장(일${v})` };
    return { hard: 100000, ideal: 40000, label: `성숙(일${v})` };
  } catch { return { hard: 30000, ideal: 10000, label: '신생(기본)' }; }
}

// ── Golden Score (0~100) ────────────────────────────────────────────────────
function goldenScore(c, ctx) {
  // 수요: DataLab > Google Trends > 자동완성 순위
  let demand;
  if (typeof c.trend_score === 'number') demand = Math.min(100, c.trend_score);
  else if (typeof c.trend_google === 'number') demand = Math.min(100, c.trend_google);
  else demand = c.ac_rank != null ? Math.max(20, 100 - c.ac_rank * 8) : 35;

  // 경쟁 적합: 문서수 적을수록 ↑, 상한 초과는 0 (사실상 탈락)
  const tp = c.total_posts ?? ctx.ceil.hard;
  let comp_fit = tp >= ctx.ceil.hard ? 0 : 100 * (1 - tp / ctx.ceil.hard);
  if (tp <= ctx.ceil.ideal) comp_fit = Math.max(comp_fit, 80); // 저경쟁 우대

  // 롱테일: 어절 많을수록 의도 명확·저경쟁
  const words = c.keyword.split(' ').length;
  const longtail = words >= 4 ? 100 : words === 3 ? 85 : words === 2 ? 55 : 20;

  // 블로그 맞춤: 고단가(애드포스트) + 부족 카테고리
  const highCpc = HIGH_CPC.test(c.keyword) ? 60 : 0;
  const underCat = ctx.underCats.has(c.category) ? 40 : 0;
  const blogfit = Math.min(100, highCpc + underCat);

  const score = demand * 0.40 + comp_fit * 0.35 + longtail * 0.10 + blogfit * 0.15;
  return { score: Math.round(score * 10) / 10, demand: Math.round(demand), comp_fit: Math.round(comp_fit), longtail, blogfit };
}

// 부족 카테고리 집합 (covered 분포 기준 평균 미만)
function underRepresentedCats(seeds) {
  const guess = categoryGuesser(seeds);
  const counts = {};
  for (const k of coveredSet()) { const cat = guess(k); counts[cat] = (counts[cat] || 0) + 1; }
  const cats = [...new Set(seeds.map(s => s.category))];
  const avg = cats.length ? cats.reduce((a, c) => a + (counts[c] || 0), 0) / cats.length : 0;
  return new Set(cats.filter(c => (counts[c] || 0) < avg));
}

// ── 채점: 미채점 후보 N개 분석 ──────────────────────────────────────────────
async function score(n) {
  const pool = loadPool();
  const seeds = loadSeeds();
  const ctx = { ceil: compCeiling(), underCats: underRepresentedCats(seeds) };
  // 카테고리 라운드로빈으로 채점 대상 선정 (특정 카테고리 편중 방지 = 사용가능 풀 균형)
  const byCat = {};
  for (const c of pool.candidates) if (!c.scored) (byCat[c.category] = byCat[c.category] || []).push(c);
  const cats = Object.keys(byCat);
  const todo = [];
  for (let i = 0; todo.length < n && cats.some(cat => byCat[cat].length); i++) {
    const cat = cats[i % cats.length];
    if (byCat[cat].length) todo.push(byCat[cat].shift());
  }
  if (!todo.length) { console.log('채점할 미채점 후보가 없습니다. (먼저 --mine)'); return { scored: 0 }; }

  await mapLimit(todo, 5, async c => {
    const a = await analyzeKeyword(c.keyword).catch(() => null);
    if (!a) { c.scored = true; c.score = 0; c.dead = true; return; }
    Object.assign(c, {
      total_posts: a.total_posts, competition: a.competition,
      trend_score: a.trend_score, rising_score: a.rising_score, trend_google: a.trend_google ?? null,
    });
    const g = goldenScore(c, ctx);
    Object.assign(c, g, { scored: true, scored_at: new Date().toISOString().slice(0, 10) });
    // related 도 풀에 환류
    addCandidates(pool, (a.related_keywords || []).map(k => ({ keyword: k, category: c.category })));
  });
  savePool(pool);
  const ok = todo.filter(c => !c.dead).length;
  console.log(`📊 채점: ${todo.length}개 분석 (경쟁상한 ${ctx.ceil.label} / hard ${won(ctx.ceil.hard)}, 부족카테 ${[...ctx.underCats].join(',') || '없음'})`);
  return { scored: ok };
}

// ── 상위 후보 (미작성, 탈락 제외) ────────────────────────────────────────────
function topCandidates(n = 20) {
  const cov = coveredSet();
  const block = loadBlocklist();
  const ceil = compCeiling(); // 블로그 상태에 따라 동적 — 성장하면 상한이 올라 더 많은 후보 해금
  return loadPool().candidates
    .filter(c => c.scored && !c.dead && c.score > 0 && !cov.has(c.keyword) && !block.has(c.keyword)
      && (c.total_posts == null || c.total_posts < ceil.hard)) // 현재 경쟁상한 초과 제외
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function printTop(n) {
  const rows = topCandidates(n);
  if (!rows.length) return console.log('(채점된 후보 없음 — node scripts/keyword-expand.js 먼저 실행)');
  console.log('점수   키워드                          카테고리   문서수     경쟁   수요/경쟁/롱/맞춤');
  for (const c of rows) {
    console.log(
      `${String(c.score).padStart(5)}  ${c.keyword.padEnd(28)}  ${(c.category||'').padEnd(8)}  ${String(won(c.total_posts||0)).padStart(8)}  ${(c.competition||'').padEnd(6)}  ${c.demand}/${c.comp_fit}/${c.longtail}/${c.blogfit}`
    );
  }
}

function printStats() {
  const pool = loadPool();
  const cov = coveredSet();
  const all = pool.candidates;
  const scored = all.filter(c => c.scored);
  const ceil = compCeiling();
  const block = loadBlocklist();
  const live = all.filter(c => c.scored && !c.dead && c.score > 0 && !cov.has(c.keyword) && !block.has(c.keyword)
    && (c.total_posts == null || c.total_posts < ceil.hard));
  const byCat = {};
  live.forEach(c => byCat[c.category] = (byCat[c.category] || 0) + 1);
  console.log(`📦 풀 통계 (data/keyword-pool.json)`);
  console.log(`- 총 후보: ${all.length}  /  채점됨: ${scored.length}  /  미채점: ${all.length - scored.length}`);
  console.log(`- 사용 가능(미작성·미탈락): ${live.length}`);
  console.log(`- 카테고리별 사용가능: ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'}`);
  console.log(`- 경쟁도 상한: ${compCeiling().label}`);
}

// ── 자동 보충 (daily-run 에서 호출) ─────────────────────────────────────────
async function replenish(target = 20) {
  let avail = topCandidates(9999).length;
  if (avail >= target) return { replenished: false, available: avail };
  console.log(`🔄 사용가능 후보 ${avail} < ${target} → 자동 보충 시작`);
  await mine();
  await score(40);
  avail = topCandidates(9999).length;
  return { replenished: true, available: avail };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function runCli() {
  const args = process.argv.slice(2);
  const has = f => args.includes(f);
  const valOf = f => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : null; };

  if (has('--stats')) return printStats();
  if (has('--top')) return printTop(valOf('--top') || 20);

  if (has('--mine')) await mine();
  if (has('--score')) await score(valOf('--score') || 20);

  if (!has('--mine') && !has('--score')) { // 기본: 마이닝 + 소량 채점 + 통계
    await mine();
    await score(20);
  }
  console.log('');
  printStats();
}

if (require.main === module) runCli().catch(e => { console.error(e); process.exit(1); });

module.exports = { mine, score, addCandidates, topCandidates, replenish, loadPool, savePool, goldenScore, coveredSet, loadBlocklist };
