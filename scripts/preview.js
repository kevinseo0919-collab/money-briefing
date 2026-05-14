const fs = require('fs');
const path = require('path');
function preview(folder) {
  const md = fs.readFileSync(path.join(folder, 'post.md'), 'utf8');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title>
<style>body{max-width:600px;margin:auto;padding:20px;font-family:'Apple SD Gothic Neo',sans-serif;line-height:1.8}blockquote{border-left:4px solid #FFD23F;padding-left:12px;color:#555}</style>
</head><body>${md.replace(/\n\n/g,'</p><p>').replace(/^>(.+)$/gm,'<blockquote>$1</blockquote>')}</body></html>`;
  fs.writeFileSync(path.join(folder, 'post.html'), html);
  console.log('Preview:', path.join(folder, 'post.html'));
}
if (require.main === module) preview(process.argv[2]);
module.exports = { preview };
