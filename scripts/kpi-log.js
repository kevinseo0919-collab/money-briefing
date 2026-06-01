#!/usr/bin/env node
// 머니브리핑 성장 스프린트 추적기.
// 네이버는 방문자 무료 API가 없어 블로그 통계 숫자를 수동으로 한 줄씩 적재하고,
// 3개월 스프린트 목표(최고 상향 / 현실 베이스) 대비 진척을 대시보드로 보여준다.
//
// 사용법:
//   node scripts/kpi-log.js 130                 오늘 일 방문자 130 기록
//   node scripts/kpi-log.js --visitors 130 --pv 190 --neighbors 12 --revenue 12000 --date 2026-05-25
//   node scripts/kpi-log.js --revenue 30000     이번 달 애드포스트 수익만 갱신(오늘 날짜)
//   node scripts/kpi-log.js --show              기록 없이 대시보드만
//   node scripts/kpi-log.js --list              최근 14건 표로 보기
//
// 저장 위치: data/blog_metrics/sprint-log.json  (날짜별 1행, 같은 날짜는 병합)
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join('data', 'blog_metrics', 'sprint-log.json');

// ── 3개월 스프린트 목표 (2026-05-25 ~ 08-25) ────────────────────────────────
// 방문자/수익 목표를 (경과일, 값) 구간점으로 두고 오늘의 목표는 선형 보간한다.
const SPRINT = {
  start: '2026-05-25',
  baselineVisitors: 120,
  peakSoFar: 258,
  // 일 평균 방문자
  ceilingVisitors: [[0, 120], [31, 280], [61, 550], [92, 1000]], // 최고 상향
  floorVisitors:   [[0, 120], [31, 200], [61, 350], [92, 550]],  // 현실 베이스
  // 월 애드포스트 수익(원) — North Star
  ceilingRevenue:  [[0, 10000], [31, 25000], [61, 65000], [92, 150000]],
  floorRevenue:    [[0, 0],     [31, 15000], [61, 35000], [92, 50000]],
  pvPerVisitor: 1.4,
};

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 구간점 [day,val] 배열에서 day 위치의 선형 보간값
function interp(points, day) {
  if (day <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (day >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [d0, v0] = points[i - 1], [d1, v1] = points[i];
    if (day <= d1) return Math.round(v0 + (v1 - v0) * (day - d0) / (d1 - d0));
  }
  return last[1];
}
function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }

function loadEntries() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
  catch { return []; }
}
function saveEntries(entries) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

// ── 인자 파싱 ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { date: todayStr() };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--show') a.show = true;
    else if (t === '--report') a.report = true;
    else if (t === '--list') a.list = true;
    else if (t === '--visitors') a.visitors = Number(argv[++i]);
    else if (t === '--pv' || t === '--pageviews') a.pv = Number(argv[++i]);
    else if (t === '--neighbors') a.neighbors = Number(argv[++i]);
    else if (t === '--revenue') a.revenue = Number(argv[++i]);
    else if (t === '--date') a.date = argv[++i];
    else if (t === '--note') a.note = argv[++i];
    else rest.push(t);
  }
  // 위치 인자: 첫 숫자는 방문자
  if (a.visitors === undefined && rest.length && !isNaN(Number(rest[0]))) a.visitors = Number(rest[0]);
  return a;
}

function upsert(entries, a) {
  let e = entries.find(x => x.date === a.date);
  if (!e) { e = { date: a.date }; entries.push(e); }
  for (const k of ['visitors', 'pv', 'neighbors', 'revenue', 'note']) {
    if (a[k] !== undefined && !(typeof a[k] === 'number' && isNaN(a[k]))) e[k] = a[k];
  }
  return e;
}

// ── 스프린트 지표 계산 (대시보드/리포트 공용) ───────────────────────────────
function computeSprint(entries) {
  const today = todayStr();
  const dayN = Math.max(0, daysBetween(SPRINT.start, today));
  const total = daysBetween(SPRINT.start, '2026-08-25');

  const withV = entries.filter(e => typeof e.visitors === 'number');
  const last7 = withV.slice(-7);
  const avg7 = last7.length ? Math.round(last7.reduce((s, e) => s + e.visitors, 0) / last7.length) : null;
  const prev7 = withV.slice(-14, -7);
  const avgPrev7 = prev7.length ? Math.round(prev7.reduce((s, e) => s + e.visitors, 0) / prev7.length) : null;
  const latest = withV[withV.length - 1] || null;

  const ceilToday = interp(SPRINT.ceilingVisitors, dayN);
  const floorToday = interp(SPRINT.floorVisitors, dayN);

  let status, ratio = null;
  if (avg7 == null) status = '⬜ 데이터 부족 — 방문자를 며칠 기록해 주세요';
  else {
    ratio = avg7 / ceilToday;
    if (avg7 >= ceilToday) status = '🚀 최고 상향 페이스 도달';
    else if (avg7 >= floorToday) status = '🟢 현실 베이스 이상 (상향까지 가속)';
    else status = '🟡 베이스 미달 — 발행·키워드 가속 필요';
  }

  const ms = [[31, 'M1 (6/25)'], [61, 'M2 (7/25)'], [92, 'M3 (8/25)']].find(m => dayN <= m[0]) || [92, 'M3 (8/25)'];
  const msVis = interp(SPRINT.ceilingVisitors, ms[0]);
  const msRev = interp(SPRINT.ceilingRevenue, ms[0]);

  const revLatest = [...entries].reverse().find(e => typeof e.revenue === 'number') || null;
  const revCeilToday = interp(SPRINT.ceilingRevenue, dayN);

  const trend = (avg7 != null && avgPrev7 != null)
    ? (avg7 > avgPrev7 ? `▲ +${avg7 - avgPrev7}` : avg7 < avgPrev7 ? `▼ ${avg7 - avgPrev7}` : '→ 0')
    : '—';
  const pvMonthly = avg7 != null ? Math.round(avg7 * SPRINT.pvPerVisitor * 30) : null;

  return { today, dayN, total, avg7, avgPrev7, latest, ceilToday, floorToday,
    status, ratio, msName: ms[1], msVis, msRev, revLatest, revCeilToday, trend, pvMonthly };
}

// ── CLI 대시보드 (박스) ─────────────────────────────────────────────────────
function dashboard(entries) {
  const m = computeSprint(entries);
  const bar = '═'.repeat(52);
  const lines = [];
  lines.push(bar);
  lines.push(`📊 머니브리핑 성장 스프린트  |  D+${m.dayN} / ${m.total}일  (~2026-08-25)`);
  lines.push(bar);
  lines.push(`방문자 baseline 120  ·  지금까지 peak ${SPRINT.peakSoFar}`);
  lines.push('');
  lines.push(`최근 기록일      : ${m.latest ? m.latest.date : '없음'}  (일 방문 ${m.latest ? m.latest.visitors : '-'})`);
  lines.push(`7일 평균 방문    : ${m.avg7 ?? '-'}   (직전7일 대비 ${m.trend})`);
  lines.push(`오늘 목표 페이스 : 최고상향 ${m.ceilToday} / 현실베이스 ${m.floorToday}`);
  lines.push(`상태             : ${m.status}${m.ratio != null ? `  (상향 대비 ${Math.round(m.ratio * 100)}%)` : ''}`);
  lines.push('');
  lines.push(`다음 관문 ${m.msName} : 일 방문 ${m.msVis}  ·  애드포스트 월 ${won(m.msRev)}`);
  lines.push(`애드포스트 수익  : 최근 ${m.revLatest ? won(m.revLatest.revenue) + ` (${m.revLatest.date})` : '미기록'}  /  오늘 목표 ${won(m.revCeilToday)}`);
  if (m.pvMonthly != null) lines.push(`추정 월 페이지뷰 : ~${m.pvMonthly.toLocaleString('ko-KR')} PV  (일방문×${SPRINT.pvPerVisitor}×30)`);
  lines.push(bar);
  lines.push('기록: node scripts/kpi-log.js <방문자> [--pv n --revenue 원 --date YYYY-MM-DD]');
  return lines.join('\n');
}

// ── 주간 리포트용 마크다운 (weekly-strategist 가 self-diagnosis/REPORT 에 주입) ──
function buildSprintReportMd(entries) {
  if (!entries) entries = loadEntries();
  const m = computeSprint(entries);
  return [
    `## 방문자 추세 vs 목표 (스프린트 D+${m.dayN}/${m.total})`,
    '',
    `- 최근 기록: ${m.latest ? `${m.latest.date} · 일 방문 ${m.latest.visitors}` : '없음'} (7일 평균 ${m.avg7 ?? '-'}, 직전7일 대비 ${m.trend})`,
    `- 오늘 목표 페이스: 최고상향 ${m.ceilToday} / 현실베이스 ${m.floorToday}`,
    `- 상태: ${m.status}${m.ratio != null ? ` (상향 대비 ${Math.round(m.ratio * 100)}%)` : ''}`,
    `- 다음 관문 ${m.msName}: 일 방문 ${m.msVis} · 애드포스트 월 ${won(m.msRev)}`,
    `- 애드포스트(North Star): 최근 ${m.revLatest ? `${won(m.revLatest.revenue)} (${m.revLatest.date})` : '미기록'} / 오늘 목표 ${won(m.revCeilToday)}`,
    m.pvMonthly != null ? `- 추정 월 페이지뷰: ~${m.pvMonthly.toLocaleString('ko-KR')} PV` : '',
    '',
    `> 데이터 출처: data/blog_metrics/sprint-log.json (수동 적재). 비어있으면 \`node scripts/kpi-log.js <방문자>\` 로 채울 것.`,
  ].filter(l => l !== '').join('\n');
}

function listTable(entries) {
  const rows = entries.slice(-14);
  if (!rows.length) return '(기록 없음)';
  const head = '날짜         방문자   PV     이웃    수익(월)     메모';
  const body = rows.map(e =>
    `${e.date}   ${String(e.visitors ?? '-').padStart(5)}  ${String(e.pv ?? '-').padStart(5)}  ${String(e.neighbors ?? '-').padStart(5)}  ${String(e.revenue != null ? won(e.revenue) : '-').padStart(10)}  ${e.note ?? ''}`
  ).join('\n');
  return head + '\n' + body;
}

// ── CLI 실행 (직접 실행할 때만) ──────────────────────────────────────────────
function runCli() {
  const a = parseArgs(process.argv.slice(2));
  const entries = loadEntries();

  if (a.report) {
    console.log(buildSprintReportMd(entries));
  } else if (a.list) {
    console.log(listTable(entries));
  } else if (a.show || (a.visitors === undefined && a.revenue === undefined && a.pv === undefined && a.neighbors === undefined)) {
    console.log(dashboard(entries));
  } else {
    const e = upsert(entries, a);
    saveEntries(entries);
    console.log(`✅ 기록: ${e.date} — ${JSON.stringify(e)}`);
    console.log('');
    console.log(dashboard(entries));
  }
}

if (require.main === module) runCli();

module.exports = { computeSprint, buildSprintReportMd, dashboard, loadEntries, SPRINT };
