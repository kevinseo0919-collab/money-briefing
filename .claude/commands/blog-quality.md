---
description: 초안의 v4.0 모바일 가독성 품질 검사 + 중복 검사를 실행하고 개선안을 제시
argument-hint: <초안.md | output/디렉터리>
allowed-tools: Bash(node:*), Read, Edit
---

# /blog-quality — 품질·중복 검사

검사 대상: **$ARGUMENTS** (파일 또는 디렉터리)

## 진행 순서

1. 대상이 비어 있으면 가장 최근 `output/<날짜>/drafts/` 를 기본값으로 제안한다.
2. **품질 검사** — `node scripts/quality-check.js $ARGUMENTS` 실행.
   항목별 점수(친근체 / 인용구 소제목 / 빈 줄 호흡 / 자연 줄바꿈 /
   손실 회피 카피 / 1인칭 / 분량)를 표로 정리한다.
3. **중복 검사** — 파일 각각에 `node scripts/duplicate-check.js <파일>` 실행.
   feed-pool·output 대비 최대 유사도와 가장 닮은 글을 보여준다.
4. **개선안** — 미달 항목마다 구체적으로 어떻게 고칠지 제안한다.
   사용자가 "고쳐줘" 라고 하면 Edit 으로 직접 수정하고 재검사한다.
5. 80점 이상 + 중복 25% 이하면 "feed-pool 적재 가능" 으로 안내한다.

## 판정 기준

- 품질: 100점 만점, **80점 이상** 통과
- 중복: 6-gram Jaccard **25% 이하** 통과
- 둘 중 하나라도 미달이면 통과로 보고하지 말 것.
