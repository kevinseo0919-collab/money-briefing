const fs = require('fs');
const path = require('path');
const { extractBody, isStructural } = require('./quality-check');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 입력 파일(.md) 또는 폴더(folder/post.md) 모두 허용
function resolveInput(input) {
  if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
    return { mdPath: path.join(input, 'post.md'), outDir: input };
  }
  return { mdPath: input, outDir: path.dirname(input) };
}

function buildHtml(md) {
  const lines = md.split('\n');

  // 4줄 이상 연속 prose 라인 인덱스 표시 (paragraph_density)
  const dense = new Set();
  let runStart = -1, run = 0;
  const flush = () => { if (run >= 4) for (let i = runStart; i < runStart + run; i++) dense.add(i); };
  lines.forEach((l, i) => {
    if (l.trim() !== '' && !isStructural(l)) {
      if (run === 0) runStart = i;
      run++;
    } else { flush(); run = 0; }
  });
  flush();

  const htmlLines = lines.map((line, i) => {
    // 이미지 자리 마커
    if (/^\s*\[이미지 자리/.test(line)) {
      return `<div class="imgph">🖼 ${esc(line.trim())}</div>`;
    }
    if (line.trim() === '') return '';

    let cls = [];
    const prose = !isStructural(line);
    if (prose && line.length > 60) cls.push('long');   // 60자 초과 → 빨강
    if (dense.has(i)) cls.push('dense');               // 밀집 단락 → 노랑

    let html = esc(line);
    // 인용구/콜아웃
    if (/^\s*>/.test(line)) html = `<blockquote>${esc(line.replace(/^\s*>\s?/, ''))}</blockquote>`;
    // 헤더
    else if (/^\s*##\s/.test(line)) html = `<h3>${esc(line.replace(/^\s*##\s/, ''))}</h3>`;
    // 「」 강조 → 형광펜 + 굵게
    html = html.replace(/「([^」]*)」/g, '<mark class="emph">「$1」</mark>');

    const lenBadge = prose && line.length > 60 ? `<span class="len">${line.length}자</span>` : '';
    return `<div class="ln ${cls.join(' ')}">${html}${lenBadge}</div>`;
  });

  return htmlLines.join('\n');
}

function counters(md) {
  const body = extractBody(md);
  const proseOnly = body.replace(/\[이미지 자리[^\]]*\]/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const chars = proseOnly.replace(/\s/g, '').length;
  const emph = (body.match(/「[^」]*」/g) || []).length;
  const imgs = (body.match(/\[이미지 자리/g) || []).length;
  const paras = body.trim().split(/\n\s*\n/).filter(p => p.trim()).length;
  return { chars, emph, imgs, paras };
}

function preview(input) {
  const { mdPath, outDir } = resolveInput(input);
  const md = fs.readFileSync(mdPath, 'utf8');
  const body = buildHtml(md);
  const c = counters(md);

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>모바일 미리보기</title>
<style>
  body { margin:0; background:#e9ecef; font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif; }
  .phone {
    max-width:375px; margin:24px auto; background:#fff; min-height:90vh;
    padding:18px 16px; line-height:1.85; font-size:16px; color:#222;
    box-shadow:0 4px 24px rgba(0,0,0,.15); border-radius:12px;
  }
  .ln { white-space:pre-wrap; word-break:break-all; position:relative; padding:1px 0; }
  .long { background:#ffe3e3; }            /* 60자 초과 → 빨강 */
  .dense { background:#fff3bf; }           /* 4줄 이상 연속 단락 → 노랑 */
  .len { font-size:11px; color:#e03131; margin-left:6px; vertical-align:super; }
  .imgph {
    border:2px dashed #adb5bd; background:#f1f3f5; color:#868e96;
    text-align:center; padding:14px; margin:10px 0; border-radius:8px; font-size:13px;
  }
  mark.emph { background:#ffec99; font-weight:700; padding:0 2px; border-radius:3px; }
  blockquote { border-left:4px solid #FFD23F; padding-left:12px; margin:8px 0; color:#555; }
  h3 { font-size:18px; color:#1c7ed6; margin:18px 0 8px; }
  .counter {
    position:fixed; top:16px; right:16px; background:#212529; color:#fff;
    padding:12px 14px; border-radius:10px; font-size:13px; line-height:1.7;
    box-shadow:0 2px 12px rgba(0,0,0,.25); z-index:10; font-family:monospace;
  }
  .counter b { color:#ffd43b; }
  .legend { max-width:375px; margin:0 auto 0; font-size:11px; color:#868e96; text-align:center; padding:8px; }
</style></head><body>
<div class="counter">
  📊 검증 카운터<br>
  글자수 <b>${c.chars}</b> / 1800~2200<br>
  「」강조 <b>${c.emph}</b> / 6+<br>
  이미지자리 <b>${c.imgs}</b> / 4+<br>
  단락수 <b>${c.paras}</b>
</div>
<div class="phone">
${body}
</div>
<div class="legend">🔴 60자 초과 · 🟡 4줄+ 연속단락 · ⬜ 이미지 자리 · 🟨 「」강조</div>
</body></html>`;

  const outPath = path.join(outDir, 'post.html');
  fs.writeFileSync(outPath, html);
  console.log('Preview:', outPath);
  console.log('Counters:', JSON.stringify(c));
  return outPath;
}

if (require.main === module) preview(process.argv[2]);
module.exports = { preview };
