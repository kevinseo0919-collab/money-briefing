// feed-pool 초안을 네이버 PC HTML 모드 붙여넣기용 .txt 로 내보낸다.
// 원본 마크다운(**굵게** 등)은 보존하고, 발행 시점에만 HTML 로 변환한다.
const fs = require('fs');
const path = require('path');

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    data[kv[1]] = v;
  }
  return { data, body: raw.slice(m[0].length) };
}

function section(body, name) {
  const re = new RegExp('^## ' + name + '[ \\t]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |(?![\\s\\S]))', 'm');
  const m = body.match(re);
  return m ? m[1].trim() : '';
}

// 마크다운 → 네이버 HTML 모드 호환 HTML (정규식 기반)
function convert(md, s) {
  let h = md;
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => (s.a++, `<a href="${u}">${t}</a>`));
  h = h.replace(/\*\*([^*]+?)\*\*/g, (_, t) => (s.b++, `<b>${t}</b>`));
  h = h.replace(/^### (.+)$/gm, (_, t) => (s.h4++, `<h4>${t}</h4>`));
  h = h.replace(/^## (.+)$/gm, (_, t) => (s.h3++, `<h3>${t}</h3>`));
  h = h.replace(/^(>[ \t]*)?- (.+)$/gm, (_, q, t) => (s.li++, `${q || ''}• ${t}`));
  h = h.replace(/^>[^\n]*(?:\r?\n>[^\n]*)*/gm, (blk) => {
    s.bq++;
    const inner = blk.split(/\r?\n/).map(l => l.replace(/^>[ \t]?/, '')).join('\n');
    return `<blockquote>${inner}</blockquote>`;
  });
  return h.trim();
}

function main() {
  const input = process.argv[2];
  if (!input) { console.error('사용법: node scripts/export-publish.js <md파일경로>'); process.exit(1); }
  const { data, body } = parseFrontmatter(fs.readFileSync(input, 'utf8'));
  const title = data.title || path.basename(input, '.md');
  const tagsLine = Array.isArray(data.tags) ? data.tags.map(t => '#' + t).join(' ') : '(frontmatter 태그 없음 — 아래 해시태그 참조)';
  const hashtags = section(body, '해시태그').replace(/\r?\n/g, ' ').trim();
  const imgPrompt = section(body, '이미지 프롬프트').replace(/```/g, '').trim();
  const thumb = section(body, '썸네일 후킹 멘트');
  const mainBody = body.split(/^## 해시태그/m)[0].trim();

  const s = { b: 0, h3: 0, h4: 0, bq: 0, li: 0, a: 0, hr: 0 };
  const htmlBody = convert(mainBody, s);
  const bar = '═'.repeat(43);

  const out = [
    '[블로그 발행용 - PC HTML 모드]',
    `제목: ${title}`,
    `카테고리: ${data.category || '(없음)'}`,
    `태그: ${tagsLine}`,
    bar,
    '[본문 - HTML 모드에 붙여넣기]',
    '',
    htmlBody,
    '',
    bar,
    '[해시태그 - 본문 끝에 추가]',
    hashtags,
    bar,
    '[참고용 - 발행에는 사용하지 않음]',
    `이미지 프롬프트: ${imgPrompt}`,
    `썸네일 후킹 멘트: ${thumb}`,
    bar,
    '[변환 통계]',
    `** → <b> 변환: ${s.b}건`,
    `## → <h3> 변환: ${s.h3}건`,
    `### → <h4> 변환: ${s.h4}건`,
    `> → <blockquote> 변환: ${s.bq}건`,
    `- → • 변환: ${s.li}건`,
    `[링크](url) → <a> 변환: ${s.a}건`,
    `--- → <hr> 변환: ${s.hr}건`,
  ].join('\n') + '\n';

  const outDir = path.join('output', 'publish');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, path.basename(input, '.md') + '.txt');
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`✅ 저장: ${outPath}`);
  console.log(`** → <b> 변환: ${s.b}건, ## → <h3> 변환: ${s.h3}건, > → <blockquote> 변환: ${s.bq}건, - → • 변환: ${s.li}건`);
}

main();
