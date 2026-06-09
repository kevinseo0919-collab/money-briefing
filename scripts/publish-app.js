// publish-app.js — feed-pool 글을 '네이버 복붙용'으로 정리해 복사 버튼 웹앱(HTML)을 생성한다.
//   사용법: node scripts/publish-app.js [날짜(YYYY-MM-DD) | 번호범위 like 196-205 | 파일경로...]
//   인자 없으면 feed-pool 최상위 .md 전부.
// 정리 규칙(복사 본문):
//   - 프론트매터 / "## 이미지 프롬프트" 섹션 / "---" 구분선 / "[이미지 자리]" 마커 제거
//   - 콜아웃("> 📋", "> 📊", "> - ", "> ①") → ">" 제거(네이버에서 ">" 노출 방지)
//   - 인용구 소제목("> 질문?")은 ">" 유지(섹션 구분용 — 사용자 요청)
//   - "## 헤더" → "##" 제거(텍스트만)
//   - 「」 강조는 그대로(네이버에서 직접 볼드/색상)
//   - "## 썸네일 후킹 멘트"는 본문에서 분리해 별도 복사칸으로
const fs = require('fs');
const path = require('path');

function listTop(dir) {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_')).map(f => path.join(dir, f))
    : [];
}

// 인자 해석 → 대상 파일 목록
function resolveTargets(args) {
  if (!args.length) return listTop('feed-pool').sort();
  const out = [];
  for (const a of args) {
    if (fs.existsSync(a) && a.endsWith('.md')) { out.push(a); continue; }
    const range = a.match(/^(\d+)-(\d+)$/);
    const all = listTop('feed-pool');
    if (range) {
      const [lo, hi] = [+range[1], +range[2]];
      out.push(...all.filter(f => { const n = +path.basename(f).match(/^\d+/)[0]; return n >= lo && n <= hi; }));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      out.push(...all.filter(f => fs.readFileSync(f, 'utf8').includes(`date: "${a}"`)));
    }
  }
  return [...new Set(out)].sort();
}

// "## <header>" 줄부터 다음 "## " 또는 끝까지 섹션 제거(줄 기반 — JS 정규식 \Z 미지원 회피)
function stripSection(text, header) {
  const lines = text.split('\n'); const out = []; let skip = false;
  for (const l of lines) {
    if (l.replace(/\s+$/, '') === '## ' + header) { skip = true; continue; }
    if (skip && /^## /.test(l)) skip = false;
    if (!skip) out.push(l);
  }
  return out.join('\n');
}

function parse(raw) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const title = (fm && fm[1].match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || '(제목 없음)';
  let body = fm ? raw.slice(fm[0].length) : raw;
  // 썸네일 후킹 멘트 분리(맨 끝 섹션)
  const thumbM = body.match(/^## 썸네일 후킹 멘트\s*\r?\n([\s\S]*)$/m);
  const thumb = thumbM ? thumbM[1].trim() : '';
  if (thumbM) body = body.slice(0, thumbM.index);
  // 이미지 프롬프트 섹션 완전 제거
  body = stripSection(body, '이미지 프롬프트');
  return { title, body, thumb };
}

// 콜아웃/헤더/마커 정리 → 네이버 복붙용 평문
function cleanBody(body) {
  const lines = body.split('\n');
  const out = [];
  for (let line of lines) {
    if (/^\s*\[이미지 자리/.test(line)) continue;          // 이미지 마커 제거
    if (/^\s*---\s*$/.test(line)) continue;                 // 구분선 제거
    // 콜아웃 박스: "> 📋/📊" 헤더, "> - " 불릿, "> ①/숫자" → ">" 제거
    if (/^\s*>\s*[📋📊]/.test(line)) { out.push(line.replace(/^\s*>\s?/, '')); continue; }
    if (/^\s*>\s*[-*]\s/.test(line)) { out.push(line.replace(/^\s*>\s?/, '')); continue; }
    if (/^\s*>\s*([①-⑩]|\d+[.)])\s/.test(line)) { out.push(line.replace(/^\s*>\s?/, '')); continue; }
    // 그 외 인용구 소제목("> 질문?")은 ">" 유지(사용자 요청: 섹션 구분용)
    // 마크다운 헤더 "## X" → "X"
    if (/^\s*#{1,3}\s/.test(line)) { out.push(line.replace(/^\s*#{1,3}\s/, '')); continue; }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function attr(s) { return s.replace(/"/g, '&quot;').replace(/&/g, '&amp;'); }

const targets = resolveTargets(process.argv.slice(2));
if (!targets.length) { console.error('대상 글이 없습니다.'); process.exit(1); }

const cards = targets.map((f, i) => {
  const { title, body, thumb } = parse(fs.readFileSync(f, 'utf8'));
  const cleanedBody = cleanBody(body);
  const num = path.basename(f).match(/^\d+/)[0];
  const chars = cleanedBody.replace(/\s/g, '').length;
  return `
  <section class="card">
    <div class="head"><span class="num">${num}</span>
      <input class="title" id="t${i}" value="${attr(title)}" readonly>
      <button onclick="cp('t${i}',this)">제목 복사</button>
    </div>
    <div class="row">
      <div class="label">본문 (네이버 복붙용 · 공백제외 ${chars}자)</div>
      <button onclick="cp('b${i}',this)">본문 복사</button>
    </div>
    <textarea id="b${i}" rows="14" readonly>${esc(cleanedBody)}</textarea>
    ${thumb ? `<div class="row"><div class="label">썸네일 후킹 멘트</div><button onclick="cp('th${i}',this)">썸네일 복사</button></div>
    <textarea id="th${i}" rows="3" readonly>${esc(thumb)}</textarea>` : ''}
  </section>`;
}).join('\n');

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>머니브리핑 발행 도우미</title>
<style>
 body{margin:0;background:#f1f3f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#212529}
 header{position:sticky;top:0;background:#212529;color:#fff;padding:14px 20px;font-weight:700;z-index:5}
 header small{font-weight:400;color:#adb5bd;margin-left:8px}
 .wrap{max-width:760px;margin:18px auto;padding:0 14px}
 .card{background:#fff;border-radius:12px;padding:16px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
 .head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
 .num{background:#e7f5ff;color:#1c7ed6;font-weight:700;border-radius:6px;padding:2px 8px;font-size:13px}
 .title{flex:1;font-size:16px;font-weight:600;border:1px solid #dee2e6;border-radius:8px;padding:8px 10px}
 .row{display:flex;align-items:center;justify-content:space-between;margin:10px 0 6px}
 .label{font-size:12px;color:#868e96}
 textarea{width:100%;box-sizing:border-box;border:1px solid #dee2e6;border-radius:8px;padding:10px;font-size:14px;line-height:1.7;white-space:pre-wrap;background:#fcfcfc;resize:vertical}
 button{background:#1c7ed6;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
 button:hover{background:#1971c2}
 button.ok{background:#2f9e44}
</style></head><body>
<header>📋 머니브리핑 발행 도우미 <small>${targets.length}건 · 이미지프롬프트·콜아웃 ">" 자동 제거 · 「」는 네이버에서 직접 강조</small></header>
<div class="wrap">${cards}</div>
<script>
function cp(id,btn){const el=document.getElementById(id);navigator.clipboard.writeText(el.value).then(()=>{const o=btn.textContent;btn.textContent='✓ 복사됨';btn.classList.add('ok');setTimeout(()=>{btn.textContent=o;btn.classList.remove('ok')},1200)})}
</script></body></html>`;

const outDir = 'output/publish';
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'index.html');
fs.writeFileSync(outPath, html);
console.log(`✅ 발행 도우미 생성: ${outPath} (${targets.length}건)`);
console.log(`   열기: open ${outPath}`);
