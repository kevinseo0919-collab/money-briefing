require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const dayjs = require('dayjs');

async function collectKPI(blogId) {
  // 네이버 블로그 RSS 활용 (무료)
  const { data } = await axios.get(`https://rss.blog.naver.com/${blogId}.xml`);
  const today = dayjs().format('YYYY-MM-DD');
  const out = `data/blog_metrics/${today}_metrics.json`;
  fs.mkdirSync('data/blog_metrics', { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ collected_at: new Date().toISOString(), rss_size: data.length }, null, 2));
  return out;
}

if (require.main === module) {
  collectKPI(process.env.BLOG_ID).then(p => console.log('Saved:', p));
}
module.exports = { collectKPI };
