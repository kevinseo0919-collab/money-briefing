# 주간 자동 실행 설정 가이드 (launchd)

매주 일요일 21:00 자동으로 `npm run weekly` 를 실행하는 macOS LaunchAgent 설정.

## 1. plist 파일 작성

경로: `~/Library/LaunchAgents/com.kevin.naver-blog-weekly.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.kevin.naver-blog-weekly</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>scripts/weekly-run.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/maegmini/naver-blog-orchestrator</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>0</integer>
    <key>Hour</key>
    <integer>21</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>RunAtLoad</key>
  <false/>

  <key>StandardOutPath</key>
  <string>/Users/maegmini/naver-blog-orchestrator/output/weekly.out.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/maegmini/naver-blog-orchestrator/output/weekly.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
```

launchd 의 `Weekday` 는 0=일요일, 1=월요일, ..., 6=토요일.

## 2. 등록

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kevin.naver-blog-weekly.plist
```

## 3. 상태 확인

```bash
launchctl print gui/$(id -u)/com.kevin.naver-blog-weekly
```

`state = waiting`, `last exit code = 0` 이면 정상 대기.

## 4. 수동 즉시 실행 (테스트용)

```bash
launchctl kickstart -k gui/$(id -u)/com.kevin.naver-blog-weekly
```

## 5. 등록 해제

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.kevin.naver-blog-weekly.plist
```

## 첫 실행은 반드시 수동으로

자동화 적용 전에 아래 순서로 테스트한 뒤 launchd 에 등록할 것.

```bash
npm run weekly -- --dry-run   # 단계 미리보기 (분석 실행 안 함)
npm run weekly                # 1단계 자동 진단 실제 실행
```

정상 동작 확인 후 위 1·2번 단계 등록.

## 동작 범위 정리

- `scripts/weekly-run.js` 는 **1단계(자체 블로그 진단)만 자동 처리**합니다.
- 2~6단계(트렌드 분석/격차 분석/액션 플랜/자동 적용/리포트)는 Claude Code 세션에서 `weekly-strategist` 에이전트가 수행합니다.
- launchd 트리거 시 자동으로 placeholder 파일이 생성되어, 다음 날 사용자가 Claude Code 를 열어 에이전트를 호출하면 그 폴더를 이어받아 분석을 마무리합니다.
- 로그는 `output/weekly.out.log` / `output/weekly.err.log` 에 적재됩니다.

## 관련 파일

- `.claude/agents/weekly-strategist.md` — 에이전트 지시문
- `scripts/weekly-run.js` — 오케스트레이터
- `output/weekly-analysis/<YYYY-MM-DD>/` — 주차별 분석 결과

## ✅ 첫 1단계 실행 검증 완료 (2026-05-18)

- Phase 1 dry-run: 6단계 모두 출력, 파일 생성 0개 ✓
- Phase 2 `WEEKLY_STAGE_LIMIT=1`: 1단계만 실행 후 2단계 진입 전 정상 종료 ✓
- 산출물: `output/weekly-analysis/2026-05-18/self-diagnosis.md` (13개 글 진단)
- 포함 항목: 본문 길이 · 키워드 밀도 · 키워드 등장 · 내부 링크 · 카테고리 배지 · 도입부 패턴 · 인간미 요소 3종 (감정/시공간/구체숫자)
- 평균값 요약(본문 2146자, 키워드 밀도 1.12%, 내부 링크 0.0개, 인간미 1.92/3)도 함께 산출됨
