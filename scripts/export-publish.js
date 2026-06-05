// feed-pool 초안을 발행용 .txt 로 내보낸다. 본문 마크다운은 변환 없이 그대로 보존한다.
// frontmatter 분리 + 해시태그/이미지프롬프트/썸네일 섹션 분리만 수행. (feed-pool 원본은 수정하지 않음)
const fs = require('fs');
const path = require('path');

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const t = kv[2].trim();
    data[kv[1]] = /^\[.*\]$/.test(t)
      ? t.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : t.replace(/^["']|["']$/g, '');
  }
  return { data, body: raw.slice(m[0].length) };
}

function section(body, name) {
  const m = body.match(new RegExp('^## ' + name + '[ \\t]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |(?![\\s\\S]))', 'm'));
  return m ? m[1].trim() : '';
}

const input = process.argv[2];
if (!input) { console.error('사용법: node scripts/export-publish.js <md파일경로>'); process.exit(1); }
const { data, body } = parseFrontmatter(fs.readFileSync(input, 'utf8'));
const tags = Array.isArray(data.tags) ? data.tags.map(t => '#' + t).join(' ') : '(frontmatter 태그 없음 — 아래 해시태그 참조)';
const bar = '═'.repeat(43);
// 이미지 자리 마커는 발행 출력에 노출하지 않는다 (게이트용으로 feed-pool 원본 .md 에만 남김).
const bodyText = body.split(/^## 해시태그/m)[0]
  .replace(/^\[이미지 자리[^\n]*\r?\n?/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
const out = `[블로그 발행용]
제목: ${data.title || path.basename(input, '.md')}
카테고리: ${data.category || '(없음)'}
태그: ${tags}
${bar}
[본문]

${bodyText}

${bar}
[해시태그]
${section(body, '해시태그').replace(/\r?\n/g, ' ').trim()}
${bar}
[참고용]
썸네일 후킹 멘트: ${section(body, '썸네일 후킹 멘트')}
`;
// 발행용 .txt 에는 이미지 프롬프트를 넣지 않는다 (이미지 생성용 프롬프트는 feed-pool 원본 .md 에만 보관).

const outDir = path.join('output', 'publish');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, path.basename(input, '.md') + '.txt');
fs.writeFileSync(outPath, out, 'utf8');
console.log(`✅ 저장: ${outPath} (본문 마크다운 그대로 보존)`);
