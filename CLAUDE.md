# Naver Blog Orchestrator v5.0

## 프로젝트 개요
네이버 블로그 자동화 시스템. 매일 06:00 launchd가 `scripts/daily-run.js` 를 실행해 **키워드 Top 5 추출까지** 자동으로 수행한다(`output/<날짜>_daily/keywords.json`). 그 뒤 초안 생성·품질 검사·Obsidian 동기화는 Claude Code 세션에서 `/daily-run` 을 호출해야 진행된다. 최종 발행은 사용자가 수동으로 진행.

## 스케줄러
- LaunchAgent: `~/Library/LaunchAgents/com.kevin.naver-blog-daily.plist`
- 실행 시각: 매일 06:00
- 로그: `output/launchd.out.log`, `output/launchd.err.log`
- 수동 재실행: `launchctl kickstart -k gui/$(id -u)/com.kevin.naver-blog-daily`
- daily-run.js 는 `feed-pool/` 의 기존 파일명을 읽어 이미 작성된 키워드를 자동 제외한다.

## 핵심 원칙
1. 블랙키위 미사용. 네이버 DataLab + 자동완성 + Google Trends 무료 도구만 사용.
2. 모든 글은 v4.0 모바일 가독성 규칙 준수 (자연 줄바꿈, 인용구 소제목, 친근체).
3. 이미지는 Nano Banana Pro 1회 생성 + Canva 텍스트 합성. 인물/텍스트 없는 일러스트.
4. 6-gram Jaccard 중복 검사 25% 이하 통과만 저장.
5. brand-facts.md는 절대 git에 포함 금지 (.gitignore 처리).

## 톤 가이드
친근체 100%, 1인칭 사용, 인용구(>) 소제목, 빈 줄 4-5개로 호흡, 손실 회피 카피 ("~안 하면 ~못 받아요").

## 블로그 본문 출력 규칙
블로그 본문 내용을 (복붙용으로) 출력할 때는 항상 아래를 따른다.
1. 모바일 가독성 우선 배치 — 짧은 문장, 잦은 줄바꿈, 빈 줄로 호흡.
2. 소제목은 마크다운 헤더(`##`)로 표기해 헤드라인 색상이 들어가게 한다.
3. 본문 중 핵심 문장은 「 」 로 감싸 강조 표시한다 (네이버에서 볼드/색상은 사용자가 직접 적용).
4. `**` 마크다운(별표 볼드)은 사용 금지 — 복붙 시 별표가 그대로 남기 때문.

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
