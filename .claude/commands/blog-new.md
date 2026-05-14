---
description: 키워드 하나로 네이버 블로그 초안 1개를 생성하고 품질·중복 검사까지 수행
argument-hint: "키워드"
allowed-tools: Bash(node:*), Read, Write, Task, Glob
---

# /blog-new — 단일 글 생성

대상 키워드: **$ARGUMENTS**

## 진행 순서

1. 키워드가 비어 있으면 사용자에게 물어본다.
2. **리서치** — `node scripts/research.js "$ARGUMENTS"` 를 실행해
   `output/<오늘>/research/` 에 브리프를 만들고 그 내용을 읽는다.
3. **초안 작성** — `blog-writer` 서브에이전트(Task)에 다음을 전달해 초안을 받는다:
   - 리서치 브리프 경로
   - `knowledge/brand-facts.md` 의 브랜드 팩트
   - `templates/blog-post.md` 형식
   - CLAUDE.md 톤 가이드 (친근체 100%, 1인칭, 인용구 소제목, 손실 회피 카피)
   초안은 `output/<오늘>/drafts/<순번>-<키워드>.md` 로 저장한다.
4. **품질 검사** — `node scripts/quality-check.js <초안파일>`.
   80점 미만이면 미달 항목을 `blog-writer` 에 피드백하고 1회 재작성.
5. **중복 검사** — `node scripts/duplicate-check.js <초안파일>`.
   25% 초과면 소재/구성을 바꿔 재작성.
6. 둘 다 통과하면 `feed-pool/` 로 복사하고, 미리보기(`node scripts/preview.js <파일>`)
   링크와 함께 결과를 요약한다.

## 주의

- 인물·텍스트 없는 일러스트 이미지 프롬프트(Nano Banana Pro 1회 생성용)를
  초안 끝에 함께 제안한다 — `templates/image-prompt.md` 참고.
- 발행은 사용자 몫. 이 명령은 검수 통과한 초안을 feed-pool 에 넣는 데서 끝낸다.
