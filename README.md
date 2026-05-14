# Naver Blog Orchestrator v5.0

Claude Code 기반 네이버 블로그 자동화. 무료 도구만으로 매일 5개 초안을 자동 생성합니다.

## 빠른 설치
1. `git clone <this-repo>`
2. `cd naver-blog-orchestrator && npm install`
3. `cp .env.example .env` 후 API 키 입력
4. Claude Code 실행 후 `/setup` 명령
5. `/daily-run` 으로 첫 실행

자세한 설치는 INSTALL.md 참조.

## 기능
- 무료 키워드 추출 (네이버 DataLab + 자동완성)
- 5개 초안 자동 생성 (v4.0 모바일 친화 톤)
- 6-gram Jaccard 중복 검사
- Nano Banana Pro 이미지 프롬프트
- Obsidian 자동 동기화

## 라이선스
MIT
