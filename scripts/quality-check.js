const fs = require('fs');
const { checkDuplicate } = require('./duplicate-check');

function check(file) {
  const text = fs.readFileSync(file, 'utf8');
  const banned = ['최고의', '최저가', '확실히', '100%', '보장'];

  // 본문 길이 = 프론트매터 제외 + 꼬리 섹션(함께 읽으면 좋은 글/해시태그/이미지/썸네일) 제외, 공백 제외
  const noFm = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const tailIdx = noFm.search(/^## (함께 읽으면 좋은 글|해시태그)/m);
  const body = tailIdx >= 0 ? noFm.slice(0, tailIdx) : noFm;
  const len = body.replace(/\s/g,'').length;

  const faqCount = (text.match(/^Q\d/gm) || []).length;
  const hasGreeting = /안녕하세요|반갑습니다/.test(text.slice(0, 200));
  const hasBanned = banned.filter(w => text.includes(w));
  const hasBold = text.includes('**'); // 별표 볼드 금지 (금액·날짜·%는 평문, 강조는 「 」)
  const dup = checkDuplicate(file, 'feed-pool');

  const result = {
    length: { value: len, passed: len >= 1500 && len <= 2000 },
    faq_count: { value: faqCount, passed: faqCount >= 6 },
    greeting: { passed: hasGreeting },
    banned_words: { found: hasBanned, passed: hasBanned.length === 0 },
    bold_markdown: { found: hasBold, passed: !hasBold },
    duplicate: dup,
    mobile_format: { passed: text.includes('>') && text.split('\n\n').length > 10 }
  };
  result.overall_passed = Object.values(result).every(v => v.passed !== false);
  return result;
}

if (require.main === module) {
  console.log(JSON.stringify(check(process.argv[2]), null, 2));
}
module.exports = { check };
