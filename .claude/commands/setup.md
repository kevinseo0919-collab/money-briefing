---
description: 초기 인터뷰로 knowledge/brand-facts.md 를 생성한다
argument-hint: (인자 없음 — 대화형 인터뷰)
allowed-tools: Read, Write, Bash(node:*), Bash(cp:*)
---

# /setup — 브랜드 초기 설정

`knowledge/brand-facts.md` 가 없으면 새로 만들고, 있으면 갱신할지 먼저 물어본다.
이 파일은 `.gitignore` 처리되어 git 에 올라가지 않는다 (절대 커밋하지 말 것).

## 진행 순서

1. `knowledge/brand-facts.md` 존재 여부를 확인한다.
   - 있으면: 현재 내용을 보여주고 "새로 작성 / 일부 수정 / 취소" 중 선택받는다.
2. `templates/brand-facts.template.md` 를 읽어 인터뷰 항목을 파악한다.
3. 아래 항목을 **한 번에 하나씩** 친근하게 질문한다 (5분 이내 목표):
   - 브랜드/블로그 이름, 한 줄 소개
   - 주요 분야·카테고리 (3~5개)
   - 타깃 독자 (연령대, 관심사, 고민)
   - 제공하는 제품/서비스/전문성 — 글에 녹일 "팩트"
   - 절대 쓰면 안 되는 표현·과장 금지 사항
   - 톤 선호 (CLAUDE.md 기본값: 친근체 100%, 1인칭, 인용구 소제목)
   - 경쟁 블로그 / 차별점
4. 답변을 정리해 `templates/brand-facts.template.md` 형식에 맞춰
   `knowledge/brand-facts.md` 로 저장한다.
5. 저장 후 `.gitignore` 에 `knowledge/brand-facts.md` 가 포함돼 있는지 확인하고
   결과를 요약한다.

## 주의

- 사용자가 답을 모르면 비워두고 "나중에 /setup 으로 보완 가능"이라고 안내한다.
- 기존 파일을 덮어쓰기 전 반드시 변경 전 내용을 보여주고 확인받는다.
