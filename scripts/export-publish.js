// feed-pool 초안을 네이버 PC 에디터에 그대로 붙여넣을 수 있는 일반 텍스트(.txt)로 내보낸다.
// 마크다운 마커(**, ##, >, - 등)를 모두 제거한다. 굵게/소제목/인용구는 붙여넣은 뒤 네이버 서식 도구로 직접 적용.
// 원본 마크다운은 보존(이 스크립트는 feed-pool 을 수정하지 않음).
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

// 마크다운 마커 제거 → 네이버 에디터 붙여넣기용 일반 텍스트 (정규식 기반)
function convert(md, s) {
  let h = md;
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `${t} (${u})`);
  h = h.replace(/\*\*([^*]+?)\*\*/g, (_, t) => (s.b++, t));
  h = h.replace(/^#{2,3} (.+)$/gm, (_, t) => (s.h++, t));
  h = h.replace(/^(>[ \t]*)?- (.+)$/gm, (_, q, t) => (s.li++, `${q || ''}• ${t}`));
  h = h.replace(/^---+\s*$/gm, '');
  h = h.replace(/^>[^\n]*(?:\r?\n>[^\n]*)*/gm, (blk) => {
    s.bq++;
    return blk.split(/\r?\n/).map(l => l.replace(/^>[ \t]?/, '')).join('\n');
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

  const s = { b: 0, h: 0, bq: 0, li: 0 };
  const textBody = convert(mainBody, s);
  const bar = '═'.repeat(43);

  const out = [
    '[블로그 발행용 - PC 네이버 에디터]',
    `제목: ${title}`,
    `카테고리: ${data.category || '(없음)'}`,
    `태그: ${tagsLine}`,
    bar,
    '[본문 - 네이버 에디터에 그대로 붙여넣기]',
    '',
    textBody,
    '',
    bar,
    '[해시태그 - 본문 끝에 추가]',
    hashtags,
    bar,
    '[참고용 - 발행에는 사용하지 않음]',
    `이미지 프롬프트: ${imgPrompt}`,
    `썸네일 후킹 멘트: ${thumb}`,
    bar,
    '[수동 서식 적용 가이드]',
    `원본 파일(${input})에서 굵게/소제목/인용박스 위치를 참고하여`,
    '네이버 에디터에서 해당 부분을 드래그한 후 서식 버튼으로 적용:',
    '- **굵게** 표시된 부분 → B 버튼',
    '- ## 으로 시작한 줄 → 소제목(H3) 버튼',
    '- > 로 시작한 줄 → 인용구(") 버튼',
    bar,
    '[변환 통계]',
    `굵게 마커 제거: ${s.b}건`,
    `소제목 마커 제거: ${s.h}건`,
    `인용박스 마커 제거: ${s.bq}건`,
    `리스트 마커 변환: ${s.li}건`,
  ].join('\n') + '\n';

  const outDir = path.join('output', 'publish');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, path.basename(input, '.md') + '.txt');
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`✅ 저장: ${outPath}`);
  console.log(`굵게 ${s.b} / 소제목 ${s.h} / 인용박스 ${s.bq} / 리스트 ${s.li} 마커 처리`);
}

main();
