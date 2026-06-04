// daily-monitor.js — 일 10건 모드 안전장치 모니터 (PR3)
// 발행량(최근 7일)·격리 비율·다운시프트 권고를 집계해 output/monitor/<날짜>.json 으로 저장.
// 주의: "발행"은 별도 추적 시스템이 없어 feed-pool 글의 date 프론트매터(없으면 파일 mtime)를
//       발행 근사치로 사용한다. 실제 발행과 차이가 날 수 있음.
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const FEED = 'feed-pool';

// feed-pool 재귀 수집 → { path, name, underQuarantine }
function walkFeed(dir, underQ = false) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walkFeed(p, underQ || e.name === '_quarantine');
    if (!e.name.endsWith('.md')) return [];
    return [{ path: p, name: e.name, underQuarantine: underQ }];
  });
}

// 글(아티클) 판정 — 인덱스/README 등 메타 파일 제외
function isArticle(name) {
  return name.endsWith('.md') && name !== 'README.md' && !name.startsWith('_');
}

// 발행일 근사: date 프론트매터(YYYY-MM-DD) → 없으면 파일 mtime
function pubDate(file) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 400);
    const m = head.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
    if (m) return m[1];
  } catch { /* noop */ }
  try { return dayjs(fs.statSync(file).mtime).format('YYYY-MM-DD'); } catch { return null; }
}

function monitor() {
  const today = dayjs().format('YYYY-MM-DD');
  const all = walkFeed(FEED);
  const articles = all.filter(f => isArticle(f.name));

  // ── 격리 비율 ──
  const quarantined = articles.filter(f => f.underQuarantine);
  const totalArticles = articles.length;
  const quarantineRatio = totalArticles ? quarantined.length / totalArticles : 0;

  // ── 최근 7일 발행(근사) 카운트 ──
  const start = dayjs(today).subtract(6, 'day'); // 오늘 포함 7일 [today-6 ... today]
  const byDay = {};
  for (let i = 0; i < 7; i++) byDay[dayjs(today).subtract(i, 'day').format('YYYY-MM-DD')] = 0;
  let count7 = 0;
  for (const f of articles) {
    if (f.underQuarantine) continue; // 격리분은 발행으로 보지 않음
    const d = pubDate(f.path);
    if (!d) continue;
    if (dayjs(d).isAfter(start.subtract(1, 'day')) && !dayjs(d).isAfter(dayjs(today))) {
      if (d in byDay) { byDay[d]++; count7++; }
    }
  }
  const distinctDays = Object.values(byDay).filter(v => v > 0).length;
  const avg7 = Math.round((count7 / 7) * 100) / 100;

  // ── 경보/권고 ──
  // 데이터 충분 여부: 7일 모두 발행 기록이 있어야 이동평균을 신뢰(=하드 권고 가능)
  const insufficient = distinctDays < 7;
  const downshift = avg7 < 8 && !insufficient; // 불완전 데이터로는 다운시프트 확정 안 함

  const alerts = [];
  if (quarantineRatio > 0.20)
    alerts.push(`🚨 격리 비율 ${(quarantineRatio * 100).toFixed(1)}% > 20% — 품질 파이프라인 점검 필요 (auto-fix/blog-fix)`);
  if (insufficient)
    alerts.push(`ℹ️  데이터 부족: 최근 7일 중 발행 기록일 ${distinctDays}/7 — 이동평균 판단 보류(첫 가동 정상)`);
  if (downshift)
    alerts.push(`⬇️  7일 이동평균 ${avg7}건/일 < 8 — 일 5건 모드로 다운시프트 권고`);
  else if (insufficient && avg7 < 8)
    alerts.push(`   (참고) 현재 근사 평균 ${avg7}건/일 — 7일 누적되면 다운시프트 판단 적용`);

  const result = {
    date: today,
    total_articles: totalArticles,
    quarantined: quarantined.length,
    quarantine_ratio: Math.round(quarantineRatio * 1000) / 1000,
    quarantine_alert: quarantineRatio > 0.20,
    published_last7: count7,
    moving_avg_per_day: avg7,
    distinct_publish_days: distinctDays,
    downshift_recommended: downshift,
    insufficient_data: insufficient,
    by_day: byDay,
    alerts
  };

  const outDir = 'output/monitor';
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`📡 daily-monitor (${today})`);
  console.log(`   글 ${totalArticles}개 · 격리 ${quarantined.length}개 (${(quarantineRatio * 100).toFixed(1)}%)`);
  console.log(`   최근 7일 발행(근사) ${count7}건 · 일평균 ${avg7} · 기록일 ${distinctDays}/7`);
  if (alerts.length) alerts.forEach(a => console.log('   ' + a));
  else console.log('   ✅ 경보 없음');
  console.log(`   저장: ${outPath}`);
  return result;
}

if (require.main === module) monitor();
module.exports = { monitor };
