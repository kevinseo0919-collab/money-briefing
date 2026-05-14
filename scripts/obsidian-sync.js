require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

function sync(draftPath) {
  const vault = process.env.OBSIDIAN_VAULT_PATH;
  if (!vault) throw new Error('OBSIDIAN_VAULT_PATH not set');
  const today = dayjs().format('YYYY-MM-DD');
  const dest = path.join(vault, '03_실행/피드로그/_초안풀', `${today}_${path.basename(draftPath)}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(draftPath, dest);

  // 홈.md 업데이트 — 마커 사이의 자동 로그만 갱신(최근 50줄), 그 외 본문은 보존
  const homePath = path.join(vault, '00_대시보드/홈.md');
  if (fs.existsSync(homePath)) {
    const START = '<!-- AUTO-LOG:start -->';
    const END = '<!-- AUTO-LOG:end -->';
    const raw = fs.readFileSync(homePath, 'utf8');
    const newLine = `${today} [[${path.basename(draftPath, '.md')}]] (자동생성·v5.0)`;
    let updated;
    if (raw.includes(START) && raw.includes(END)) {
      const head = raw.slice(0, raw.indexOf(START) + START.length);
      const tail = raw.slice(raw.indexOf(END));
      const logLines = raw
        .slice(raw.indexOf(START) + START.length, raw.indexOf(END))
        .split('\n')
        .filter((l) => l.trim());
      const merged = [newLine, ...logLines].slice(0, 50); // 최근 50줄만 유지
      updated = `${head}\n${merged.join('\n')}\n${tail}`;
    } else {
      // 마커가 없으면 기존 내용을 절대 건드리지 않고 맨 위에 로그 블록을 새로 추가
      updated = `${START}\n${newLine}\n${END}\n\n${raw}`;
    }
    fs.writeFileSync(homePath, updated);
  }
  return dest;
}

if (require.main === module) {
  console.log('Synced:', sync(process.argv[2]));
}
module.exports = { sync };
