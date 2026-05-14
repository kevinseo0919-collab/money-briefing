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

function checkDuplicate(targetFile, poolDir, threshold=0.25) {
  const target = ngrams(fs.readFileSync(targetFile, 'utf8'));
  if (!fs.existsSync(poolDir)) return { passed: true, max_similarity: 0 };
  const files = fs.readdirSync(poolDir).filter(f => f.endsWith('.md'));
  let maxSim = 0, maxFile = '';
  for (const f of files) {
    const sim = jaccard(target, ngrams(fs.readFileSync(path.join(poolDir, f), 'utf8')));
    if (sim > maxSim) { maxSim = sim; maxFile = f; }
  }
  return { passed: maxSim < threshold, max_similarity: maxSim, similar_file: maxFile };
}

if (require.main === module) {
  const [, , target, pool] = process.argv;
  console.log(JSON.stringify(checkDuplicate(target, pool || 'feed-pool'), null, 2));
}

module.exports = { checkDuplicate };
