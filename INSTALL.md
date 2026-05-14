# 설치 가이드

## 사전 요구
- macOS
- Node.js 20+
- Claude Code CLI 설치

## 1단계: 의존성 설치
```bash
npm install
```

## 2단계: API 키 발급 (모두 무료)
1. **네이버 Open API**: https://developers.naver.com/apps 에서 검색 API 등록 (일 25,000회 무료)
2. **Gemini API**: https://aistudio.google.com/apikey (Nano Banana Pro 포함)
3. **Telegram Bot** (선택): @BotFather 에서 봇 생성

## 3단계: .env 작성
`cp .env.example .env` 후 발급받은 키 입력.

## 4단계: 초기 설정
Claude Code 실행 후:
```
/setup
```
5분 인터뷰로 brand-facts.md 자동 생성.

## 5단계: 매일 06:00 자동 실행 (macOS)
`crontab -e` 후 아래 줄 추가:
```
0 6 * * * cd /path/to/project && /usr/local/bin/node scripts/daily-run.js >> daily.log 2>&1
```
- `node` 경로는 `which node`로 확인 후 절대경로로 입력 (Homebrew는 보통 `/opt/homebrew/bin/node`).
- `cron`이 06:00에 깨어 있도록 시스템 설정 → 배터리 → "예약된 시간에 깨우기" 또는 `pmset`로 wake 스케줄을 잡아둘 것.
- 로그는 프로젝트 루트의 `daily.log`에 누적됨 (`.gitignore`의 `*.log`로 제외).

### 대안: launchd
cron 대신 `~/Library/LaunchAgents/`에 plist를 두고 `launchctl load` 하는 방식도 가능. 절전 중에도 복귀 후 실행이 보장되는 장점이 있음.
