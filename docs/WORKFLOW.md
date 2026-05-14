# 워크플로우

## 최초 1회
1. `npm install`
2. `cp .env.example .env` → API 키 입력 (INSTALL.md 참고)
3. Claude Code 에서 `/setup` → `knowledge/brand-facts.md` 생성
4. `keyword-bank/` 에 시드 yaml 1개 이상 작성 (`keyword-bank/README.md` 형식)
5. cron 등록 (INSTALL.md 5단계)

## 매일 (자동)
06:00 cron 이 `daily-run.js` 를 실행 → 키워드 5개 → 초안 5개 →
품질·중복 통과분만 `feed-pool/` → Obsidian 동기화 → 텔레그램 요약 도착.

## 매일 (사람이 하는 일)
1. 텔레그램 요약 확인
2. Claude Code 에서 `feed-pool/` 의 초안 검토
   - 더 다듬고 싶으면 `/blog-quality feed-pool/<파일>` 으로 재검수·수정
   - 미리보기: `node scripts/preview.js feed-pool/<파일>`
3. 이미지: 초안의 `## 이미지 프롬프트` 로 Nano Banana Pro 1회 생성 → Canva 텍스트 합성
4. 네이버 블로그에 **수동 발행**
5. 발행한 초안은 `feed-pool/` 에서 빼고, 키워드는 `keyword-bank` 의 `covered:` 로 이동

## 단발성 작업
- 특정 키워드로 한 편만: `/blog-new "키워드"`
- 초안 검수만: `/blog-quality <파일 또는 디렉터리>`
- 수동 동기화: `/obsidian-sync`
- 키워드만 뽑기: `npm run keyword` 또는 `npm run keyword 시드1 시드2`

## 주간 점검
- `data/blog_metrics/` 의 KPI 추이로 발행 주기·반응 확인
- `data/analysis_logs/` 에서 파이프라인 오류 로그 확인
- `keyword-bank/` 시드 갱신 — 반응 좋았던 주제 계열 보강

## 문제 해결
| 증상 | 원인 / 조치 |
|---|---|
| 키워드가 안 뽑힘 | `keyword-bank/*.yaml` 없음 → 시드 작성 |
| 초안 생성 건너뜀 | `claude` CLI 미설치 → 설치하거나 `/daily-run` 으로 대화형 실행 |
| DataLab/검색 결과 없음 | `.env` 의 네이버 키 확인 |
| 동기화 안 됨 | `.env` 의 `OBSIDIAN_VAULT_PATH` 확인 |
| 텔레그램 알림 없음 | `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` (선택 항목) |
