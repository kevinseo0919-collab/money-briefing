#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Usage: node scripts/diversity-check.js <file.md>'); process.exit(1); }
const stripBody = (c) => {
  const e = c.indexOf('\n---\n', 4);
  return (e > 0 ? c.slice(e + 5) : c).replace(/^##.*$/gm, '').replace(/```[\s\S]*?```/g, '').replace(/^>.*$/gm, '').replace(/[#*_`]/g, '').trim();
};
const content = fs.readFileSync(file, 'utf8');
const bodyText = stripBody(content);
const keyword = (content.match(/^keyword:\s*"([^"]+)"/m) || [])[1] || '';
const lenNoSpace = bodyText.replace(/\s/g, '').length;
const kwCount = keyword ? (bodyText.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 0;
const density = lenNoSpace > 0 ? (keyword.length * kwCount / lenNoSpace * 100) : 0;
const emotions = ['당황','한숨','안도','놀랐','두근','아쉬','후회','뿌듯','걱정','망설','부랴부랴','한참','정신없','조마조마','등에 땀'];
const places = ['지하철','출근길','새벽','아침','저녁','밤','집','카페','회사','사무실','퇴근','홈택스','복지로','주민센터'];
const hasNum = /\d{2,}(원|만원|일|시|분|개월|만 원|%)/.test(bodyText) || /\d+,\d{3}/.test(bodyText);
const hasEmo = emotions.some(e => bodyText.includes(e));
const hasPlace = places.some(p => bodyText.includes(p));
const intro = bodyText.split('\n').filter(l => l.trim()).slice(0, 3).join(' ').slice(0, 200);
const dir = path.dirname(file), today = Date.now();
const jaccard = (a, b) => {
  const sa = new Set(a.split(/\s+/).filter(w => w.length > 1));
  const sb = new Set(b.split(/\s+/).filter(w => w.length > 1));
  const i = [...sa].filter(x => sb.has(x)).length, u = new Set([...sa, ...sb]).size;
  return u > 0 ? i / u : 0;
};
let maxSim = 0, simFile = '';
fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== path.basename(file)).forEach(f => {
  if ((today - fs.statSync(path.join(dir, f)).mtime) / 86400000 > 7) return;
  const oi = stripBody(fs.readFileSync(path.join(dir, f), 'utf8')).split('\n').filter(l => l.trim()).slice(0, 3).join(' ').slice(0, 200);
  const s = jaccard(intro, oi);
  if (s > maxSim) { maxSim = s; simFile = f; }
});
const lenOK = lenNoSpace >= 1500 && lenNoSpace <= 2500;
const denOK = density >= 1.5 && density <= 2.5;
const humOK = [hasNum, hasEmo, hasPlace].filter(Boolean).length >= 3;
const intOK = maxSim < 0.8;
console.log(`\n=== Diversity Check: ${path.basename(file)} ===\n`);
console.log('| 검증 항목 | 결과 | 상세 |');
console.log('|---|---|---|');
console.log(`| 본문 길이 1500~2500자 | ${lenOK ? '✅' : '⚠️'} | ${lenNoSpace}자 |`);
console.log(`| 키워드 밀도 1.5~2.5% | ${denOK ? '✅' : '⚠️'} | ${density.toFixed(2)}% (${kwCount}회 등장) |`);
console.log(`| 인간미 요소 3개 이상 | ${humOK ? '✅' : '⚠️'} | 감정 ${hasEmo?'O':'X'} / 시공간 ${hasPlace?'O':'X'} / 구체숫자 ${hasNum?'O':'X'} |`);
console.log(`| 도입부 유사도 <80% (최근 7일) | ${intOK ? '✅' : '⚠️'} | ${(maxSim*100).toFixed(1)}% (${simFile||'N/A'}) |`);
console.log(`\n결과: ${lenOK && denOK && humOK && intOK ? '✅ 전체 통과' : '⚠️ 경고 항목 있음'}\n`);
