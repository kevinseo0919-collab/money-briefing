const fs = require('fs');
const path = require('path');
const { check } = require('./quality-check');
const { autoFix } = require('./auto-fix');

const QUARANTINE = path.join('feed-pool', '_quarantine');

// 입력 폴더의 직속 .md 활성 초안만 (밑줄 _ 시작 파일/폴더·아카이브 제외 → 보관본 보호)
function listActive(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .map(e => path.join(dir, e.name));
}

function failedKeys(result) {
  return Object.entries(result)
    .filter(([k, v]) => k !== 'overall_passed' && v && v.passed === false)
    .map(([k]) => k);
}

// 검사 → 실패 시 auto-fix 1회 → 재검사 → 여전히 실패면 격리
function gate(dir, { dryRun = false } = {}) {
  const out = { passed: [], fixed: [], quarantined: [] };
  if (!fs.existsSync(dir)) { console.error('경로 없음:', dir); return out; }
  const files = listActive(dir);

  for (const file of files) {
    const name = path.basename(file);
    const r1 = check(file);
    if (r1.overall_passed) { out.passed.push(name); continue; }

    if (dryRun) {
      // 수정/이동 없이 실패 항목만 기록 (실제 처리 시 fixed 또는 quarantined 로 갈림)
      out.quarantined.push({ file: name, failed: failedKeys(r1), note: 'dry-run: 미처리' });
      continue;
    }

    autoFix(file);              // 1회 자동 수정
    const r2 = check(file);     // 재검사
    if (r2.overall_passed) {
      out.fixed.push(name);
    } else {
      if (!fs.existsSync(QUARANTINE)) fs.mkdirSync(QUARANTINE, { recursive: true });
      const dest = path.join(QUARANTINE, name);
      fs.renameSync(file, dest);
      out.quarantined.push({ file: name, failed: failedKeys(r2) });
    }
  }
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dir = args.find(a => !a.startsWith('--')) || 'feed-pool';
  const result = gate(dir, { dryRun });
  console.log(JSON.stringify({
    dir, dryRun,
    counts: {
      passed: result.passed.length,
      fixed: result.fixed.length,
      quarantined: result.quarantined.length
    },
    ...result
  }, null, 2));
}
module.exports = { gate };
