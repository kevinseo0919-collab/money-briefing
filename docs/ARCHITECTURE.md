# 아키텍처

## 개요
`naver-blog-orchestrator` 는 무료 도구만으로 네이버 블로그 초안을 자동 생성하는
파이프라인이다. **결정적 데이터 작업은 Node 스크립트**, **글쓰기/판단은 Claude
(슬래시 명령 + 서브에이전트)** 가 맡는다.

## 두 가지 실행 경로

### 1. cron (무인, 06:00)
```
cron → node scripts/daily-run.js
        └─ keyword-free.js → research.js → claude -p(초안)
           → quality-check.js → duplicate-check.js
           → feed-pool/ → obsidian-sync.js → kpi-collector.js → 텔레그램
```
`claude` CLI 가 없으면 초안 생성만 건너뛰고 키워드·리서치까지는 수행한다.

### 2. Claude Code 세션 (대화형)
```
/daily-run → keyword-free.js → keyword-researcher 에이전트
           → research.js → blog-writer 에이전트 (초안)
           → quality-reviewer 에이전트 (+ quality/duplicate 스크립트)
           → feed-pool/ → /obsidian-sync
```

## 파이프라인 단계

| 단계 | 스크립트 | 입력 | 출력 |
|---|---|---|---|
| 키워드 추출 | `keyword-free.js` | `keyword-bank/*.yaml` | `data/daily_keywords/<날짜>.json` |
| 리서치 | `research.js` | 키워드 | `output/<날짜>/research/*.json` |
| 초안 생성 | `blog-writer` / `claude -p` | 리서치 브리프 + 템플릿 + 브랜드 팩트 | `output/<날짜>/drafts/*.md` |
| 품질 검사 | `quality-check.js` | 초안 `.md` | 점수 (80점 통과) |
| 중복 검사 | `duplicate-check.js` | 초안 `.md` | 6-gram Jaccard (25% 이하 통과) |
| 미리보기 | `preview.js` | 초안 `.md` | 콘솔 + `output/<날짜>/preview/*.html` |
| 적재 | `daily-run.js` | 통과 초안 | `feed-pool/*.md` |
| 동기화 | `obsidian-sync.js` | `feed-pool/*.md` | Obsidian Vault `네이버블로그/` |
| KPI | `kpi-collector.js` | 블로그 RSS | `data/blog_metrics/<날짜>.json` |

## 무료 데이터 소스
- **네이버 자동완성** (`ac.search.naver.com`) — 키 불필요
- **Google Trends** (`google-trends-api`) — 키 불필요
- **네이버 Open API** — 검색/DataLab, 일 25,000회 무료
- **네이버 블로그 RSS** (`rss.blog.naver.com`) — KPI 수집

## 폴더
```
scripts/lib/util.js   공유 유틸 (env·경로·네이버 API·텔레그램)
knowledge/            브랜드 팩트·톤 샘플 (brand-facts.md 는 git 제외)
keyword-bank/         시드 키워드 yaml
templates/            blog-post / image-prompt / brand-facts 템플릿
output/               날짜별 생성물 (git 제외)
feed-pool/            검수 통과한 발행 대기 초안
data/                 키워드·KPI·로그 (git 제외)
.claude/commands/     슬래시 명령 5종
.claude/agents/       서브에이전트 3종
```

## 품질 게이트
초안은 **품질 80점 이상** AND **중복 25% 이하** 를 동시에 통과해야 `feed-pool/`
에 들어간다. 최종 발행은 항상 사람이 수동으로 한다.
