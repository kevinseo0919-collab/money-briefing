# Naver Blog Orchestrator v5.0

## 프로젝트 개요
네이버 블로그 자동화 시스템. 매일 06:00 자동 실행되어 키워드 추출 → 5개 초안 생성 → 품질 검사 → Obsidian 동기화까지 수행. 최종 발행은 사용자가 수동으로 진행.

## 핵심 원칙
1. 블랙키위 미사용. 네이버 DataLab + 자동완성 + Google Trends 무료 도구만 사용.
2. 모든 글은 v4.0 모바일 가독성 규칙 준수 (자연 줄바꿈, 인용구 소제목, 친근체).
3. 이미지는 Nano Banana Pro 1회 생성 + Canva 텍스트 합성. 인물/텍스트 없는 일러스트.
4. 6-gram Jaccard 중복 검사 25% 이하 통과만 저장.
5. brand-facts.md는 절대 git에 포함 금지 (.gitignore 처리).

## 톤 가이드
친근체 100%, 1인칭 사용, 인용구(>) 소제목, 빈 줄 4-5개로 호흡, 손실 회피 카피 ("~안 하면 ~못 받아요").

## 명령어
- `/setup` - 초기 인터뷰로 brand-facts.md 생성
- `/daily-run` - 전체 파이프라인 실행
- `/blog-new "키워드"` - 단일 글 생성
- `/blog-quality output/<폴더>` - 품질 검사
- `/obsidian-sync` - Obsidian 동기화

## 폴더 규칙
- knowledge/ : 브랜드 팩트, 톤 샘플 (수정 금지, /setup으로만 갱신)
- keyword-bank/ : 카테고리별 키워드 풀
- output/ : 날짜별 생성 결과 (git ignored)
- feed-pool/ : 발행 대기 초안 풀
