// feed-pool 초안을 네이버 발행용 .txt 로 내보낸다 (정규식 frontmatter 파싱, gray-matter 미사용)
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

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('사용법: node scripts/export-publish.js <md파일경로>');
    process.exit(1);
  }
  const raw = fs.readFileSync(input, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const title = data.title || path.basename(input, '.md');
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const hashtags = tags.map(t => '#' + t).join(' ');
  const out = `${title}\n\n${body.trim()}\n\n${hashtags}\n`;

  const outDir = path.join('output', 'publish');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, path.basename(input, '.md') + '.txt');
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`✅ 저장: ${outPath}`);
}

main();
