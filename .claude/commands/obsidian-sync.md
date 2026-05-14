---
description: feed-pool 의 발행 대기 초안을 Obsidian Vault 로 동기화
argument-hint: [--force]
allowed-tools: Bash(node:*), Read
---

# /obsidian-sync — Obsidian 동기화

인자: `$ARGUMENTS` (`--force` 시 기존 노트도 갱신)

## 진행 순서

1. `.env` 의 `OBSIDIAN_VAULT_PATH` 가 설정돼 있는지 확인한다.
   비어 있으면 글로벌 CLAUDE.md 의 Vault 경로
   (`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Kevin-OB`)
   를 쓸지 사용자에게 물어본다.
2. `node scripts/obsidian-sync.js $ARGUMENTS` 를 실행한다.
   - 기본 동작: `feed-pool/*.md` 중 **신규 파일만** Vault 의
     `네이버블로그/` 폴더로 복사 (기존 노트는 덮어쓰지 않음).
   - frontmatter 가 없는 초안에는 생성일·태그·상태 메타를 자동으로 붙인다.
3. 동기화된 파일 / 건너뛴 파일 목록을 그대로 사용자에게 보고한다.

## 주의

- `--force` 는 기존 Vault 노트를 덮어쓴다. 사용 전 사용자에게 어떤 파일이
  덮어써지는지 먼저 보여주고 확인받을 것.
- 대량 변경(여러 파일 일괄 갱신)은 임의 실행 금지 — 승인 후 진행.
