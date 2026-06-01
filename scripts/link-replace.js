#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const dir = 'feed-pool';
const mappingFile = path.join(dir, 'url-mapping.json');
if (!fs.existsSync(mappingFile)) {
  console.error(`❌ Mapping file not found: ${mappingFile}`);
  process.exit(1);
}
const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

// feed-pool 하위 폴더(주차별 보관 등)까지 재귀적으로 .md 수집
const listMd = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? listMd(p) : (e.name.endsWith('.md') ? [p] : []);
});
const files = listMd(dir);
let totalReplaced = 0;
const unmapped = new Set();
const perFile = [];

files.forEach(fp => {
  let c = fs.readFileSync(fp, 'utf8');
  let n = 0;
  c = c.replace(/PLACEHOLDER_([^)\s]+\.md)/g, (m, fname) => {
    const v = mapping[fname];
    if (v && String(v).trim()) { n++; return String(v).trim(); }
    unmapped.add(fname);
    return m;
  });
  if (n > 0) { fs.writeFileSync(fp, c); totalReplaced += n; perFile.push(`${path.relative(dir, fp)}: ${n}개 치환`); }
});

console.log('\n=== link-replace 결과 ===\n');
console.log(`치환된 링크: ${totalReplaced}개`);
console.log(`변경된 파일: ${perFile.length}개`);
perFile.forEach(p => console.log(`  - ${p}`));
if (unmapped.size > 0) {
  console.log(`\n⚠️ 미매핑 파일 (url-mapping.json 에 빈 값 또는 누락):`);
  [...unmapped].sort().forEach(f => console.log(`  - ${f}`));
} else if (totalReplaced > 0) {
  console.log('\n✅ 모든 placeholder 치환 완료.');
}
console.log();
