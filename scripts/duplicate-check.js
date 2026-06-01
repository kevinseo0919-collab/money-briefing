const fs = require('fs');
const path = require('path');

function ngrams(text, n=6) {
  const clean = text.replace(/\s+/g, '');
  const set = new Set();
  for (let i=0; i<=clean.length-n; i++) set.add(clean.slice(i, i+n));
  return set;
}

function jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// poolDir 하위 폴더(주차별 보관 등)까지 재귀적으로 .md 경로 수집
function listMd(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listMd(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

function checkDuplicate(targetFile, poolDir, threshold=0.25) {
  const target = ngrams(fs.readFileSync(targetFile, 'utf8'));
  if (!fs.existsSync(poolDir)) return { passed: true, max_similarity: 0 };
  const targetAbs = path.resolve(targetFile);
  const files = listMd(poolDir); // 보관 폴더 포함 재귀 스캔
  let maxSim = 0, maxFile = '';
  for (const fp of files) {
    if (path.resolve(fp) === targetAbs) continue; // 자기 자신 제외
    const sim = jaccard(target, ngrams(fs.readFileSync(fp, 'utf8')));
    if (sim > maxSim) { maxSim = sim; maxFile = path.relative(poolDir, fp); }
  }
  return { passed: maxSim < threshold, max_similarity: maxSim, similar_file: maxFile };
}

if (require.main === module) {
  const [, , target, pool] = process.argv;
  console.log(JSON.stringify(checkDuplicate(target, pool || 'feed-pool'), null, 2));
}

module.exports = { checkDuplicate };
