# knowledge/

브랜드 지식 베이스. `blog-writer` 등 에이전트가 글을 쓸 때 참고한다.

| 파일 | 설명 | git |
|---|---|---|
| `tone-sample.md` | v4.0 톤 레퍼런스 (좋은/나쁜 예시) | 추적 |
| `brand-facts.md` | 브랜드 팩트 — `/setup` 으로 생성 | **제외** (.gitignore) |

## 주의
- `brand-facts.md` 는 개인/사업 정보가 들어가므로 **절대 커밋하지 않는다**.
  이미 `.gitignore` 에 `knowledge/brand-facts.md` 로 등록돼 있다.
- 이 폴더는 손으로 직접 고치지 말고 `/setup` 으로만 갱신한다 (CLAUDE.md 폴더 규칙).
