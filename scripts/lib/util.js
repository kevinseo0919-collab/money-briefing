// scripts/lib/util.js
// 모든 스크립트가 공유하는 유틸리티: 환경변수, 경로, 네이버 API, 로깅, 알림.
'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dayjs = require('dayjs');

// .env 로드 (프로젝트 루트 기준)
const ROOT = path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

// ---------------------------------------------------------------------------
// 경로
// ---------------------------------------------------------------------------
const PATHS = {
  root: ROOT,
  knowledge: path.join(ROOT, 'knowledge'),
  keywordBank: path.join(ROOT, 'keyword-bank'),
  templates: path.join(ROOT, 'templates'),
  output: path.join(ROOT, 'output'),
  feedPool: path.join(ROOT, 'feed-pool'),
  data: path.join(ROOT, 'data'),
  dailyKeywords: path.join(ROOT, 'data', 'daily_keywords'),
  blogMetrics: path.join(ROOT, 'data', 'blog_metrics'),
  analysisLogs: path.join(ROOT, 'data', 'analysis_logs'),
};

// ---------------------------------------------------------------------------
// 날짜 / 파일 헬퍼
// ---------------------------------------------------------------------------
const today = () => dayjs().format('YYYY-MM-DD');
const stamp = () => dayjs().format('YYYY-MM-DD_HHmmss');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return file;
}

// ---------------------------------------------------------------------------
// 로깅 (콘솔 + data/analysis_logs/YYYY-MM-DD.log)
// ---------------------------------------------------------------------------
function log(...args) {
  const line = `[${dayjs().format('HH:mm:ss')}] ${args.join(' ')}`;
  console.log(line);
  try {
    ensureDir(PATHS.analysisLogs);
    fs.appendFileSync(path.join(PATHS.analysisLogs, `${today()}.log`), line + '\n');
  } catch {
    /* 로그 파일 실패는 무시 */
  }
}

function warn(...args) {
  log('⚠️ ', ...args);
}

// ---------------------------------------------------------------------------
// 네이버 Open API
// ---------------------------------------------------------------------------
const NAVER_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || '';

function hasNaverKeys() {
  return Boolean(NAVER_ID && NAVER_SECRET);
}

// 검색 API: type = blog | news | webkr | cafearticle ...
async function naverSearch(type, query, opts = {}) {
  if (!hasNaverKeys()) {
    warn('네이버 API 키가 없어 검색을 건너뜁니다:', query);
    return { items: [], total: 0 };
  }
  const { display = 20, start = 1, sort = 'sim' } = opts;
  const url = `https://openapi.naver.com/v1/search/${type}.json`;
  const res = await axios.get(url, {
    params: { query, display, start, sort },
    headers: {
      'X-Naver-Client-Id': NAVER_ID,
      'X-Naver-Client-Secret': NAVER_SECRET,
    },
    timeout: 10000,
  });
  return res.data;
}

// DataLab 검색어 트렌드 API
async function naverDatalab(keywordGroups, opts = {}) {
  if (!hasNaverKeys()) {
    warn('네이버 API 키가 없어 DataLab을 건너뜁니다.');
    return null;
  }
  const {
    startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
    endDate = today(),
    timeUnit = 'date',
  } = opts;
  const res = await axios.post(
    'https://openapi.naver.com/v1/datalab/search',
    { startDate, endDate, timeUnit, keywordGroups },
    {
      headers: {
        'X-Naver-Client-Id': NAVER_ID,
        'X-Naver-Client-Secret': NAVER_SECRET,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  return res.data;
}

// 네이버 자동완성 (키 불필요, 비공식 엔드포인트)
async function naverAutocomplete(query) {
  try {
    const res = await axios.get('https://ac.search.naver.com/nx/ac', {
      params: { q: query, st: 100, r_format: 'json', q_enc: 'UTF-8', frm: 'nv', ans: 2 },
      timeout: 8000,
    });
    const groups = res.data && res.data.items ? res.data.items : [];
    // items 는 그룹 배열, 각 항목의 0번째가 텍스트
    return groups
      .flat()
      .map((row) => (Array.isArray(row) ? row[0] : row))
      .filter((v) => typeof v === 'string' && v && v !== query);
  } catch (err) {
    warn('자동완성 실패:', query, '-', err.message);
    return [];
  }
}

// HTML 태그 제거 (네이버 검색 결과는 <b> 등이 섞여 있음)
function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// 텔레그램 알림 (선택)
// ---------------------------------------------------------------------------
async function telegramNotify(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text: message, parse_mode: 'Markdown' },
      { timeout: 8000 }
    );
    return true;
  } catch (err) {
    warn('텔레그램 알림 실패:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 기타
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  PATHS,
  today,
  stamp,
  ensureDir,
  readJson,
  writeJson,
  log,
  warn,
  hasNaverKeys,
  naverSearch,
  naverDatalab,
  naverAutocomplete,
  stripTags,
  telegramNotify,
  sleep,
};
