const fs = require('fs');
const { checkDuplicate } = require('./duplicate-check');

function check(file) {
  const text = fs.readFileSync(file, 'utf8');
  const banned = ['최고의', '최저가', '확실히', '100%', '보장'];
  const len = text.replace(/\s/g,'').length;
  const faqCount = (text.match(/^Q\d/gm) || []).length;
  const hasGreeting = /안녕하세요|반갑습니다/.test(text.slice(0, 200));
  const hasBanned = banned.filter(w => text.includes(w));
  const dup = checkDuplicate(file, 'feed-pool');

  const result = {
    length: { value: len, passed: len >= 1500 && len <= 2500 },
    faq_count: { value: faqCount, passed: faqCount >= 6 },
    greeting: { passed: hasGreeting },
    banned_words: { found: hasBanned, passed: hasBanned.length === 0 },
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
