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

const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
let totalReplaced = 0;
const unmapped = new Set();
const perFile = [];

files.forEach(f => {
  const fp = path.join(dir, f);
  let c = fs.readFileSync(fp, 'utf8');
  let n = 0;
  c = c.replace(/PLACEHOLDER_([^)\s]+\.md)/g, (m, fname) => {
    const v = mapping[fname];
    if (v && String(v).trim()) { n++; return String(v).trim(); }
    unmapped.add(fname);
    return m;
  });
  if (n > 0) { fs.writeFileSync(fp, c); totalReplaced += n; perFile.push(`${f}: ${n}개 치환`); }
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
