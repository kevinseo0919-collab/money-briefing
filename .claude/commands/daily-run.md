---
description: 전체 파이프라인 실행 — 키워드 추출부터 feed-pool 적재·Obsidian 동기화까지
argument-hint: [--count N] [--keywords "a,b,c"]
allowed-tools: Bash(node:*), Read, Write, Edit, Task, Glob
---

# /daily-run — 일일 파이프라인 (대화형)

cron(06:00) 은 `node scripts/daily-run.js` 를 headless 로 돌리지만,
이 명령은 Claude Code 세션 안에서 같은 파이프라인을 **에이전트로** 실행한다.

인자: `$ARGUMENTS` (없으면 하루 10개 = 급상승 4 + 시드 6 기본).

## 진행 순서

1. **키워드 추출** — `node scripts/daily-run.js` 실행(또는 cron이 만든
   `output/<오늘>_daily/keywords.json` 사용). 하루 10개 = DataLab 트렌드 상승폭 상위 4개(급상승)
   + 시드 풀 6개. 각 항목의 `source`("급상승"/"시드")로 구분된다.
   (`--keywords` 가 주어지면 그 목록을 그대로 사용)
2. **리서치** — 각 키워드에 `node scripts/research.js "<키워드>"` 를 실행해
   `output/<오늘>/research/` 에 브리프를 만든다.
3. **초안 생성** — 키워드마다 `blog-writer` 서브에이전트(Task)를 띄워
   리서치 브리프 + `templates/blog-post.md` + CLAUDE.md 톤 가이드로
   초안을 `output/<오늘>/drafts/` 에 작성한다.
4. **품질·중복 검사** — 각 초안에:
   - `node scripts/quality-check.js <파일>` (80점 이상 통과)
   - `node scripts/duplicate-check.js <파일>` (25% 이하 통과)
   둘 다 통과한 초안만 `feed-pool/` 로 복사한다.
   미달 초안은 `blog-writer` 에 피드백을 주고 1회 재작성을 시도한다.
5. **Obsidian 동기화** — `node scripts/obsidian-sync.js` 실행.
6. **KPI 수집** — `.env` 에 `BLOG_ID` 가 있으면 `node scripts/kpi-collector.js`.
7. **요약** — 키워드 수 / 초안 수 / 통과·탈락 / 동기화 결과를 표로 보고한다.

## 주의

- 각 단계의 스크립트 출력(통과/탈락 사유)을 그대로 사용자에게 보여줄 것.
- 최종 발행은 사용자가 수동으로 한다. 이 명령은 feed-pool 적재까지만 한다.
