# keyword-bank/

카테고리별 **시드 키워드** 풀. `daily-run.js` 가 이 폴더의 `*.yml` 을 읽어
무작위로 10개를 뽑고, 각 키워드를 `keyword-free.js` 로 분석한다.

## 파일 형식

`<카테고리>.yml` 로 자유롭게 만든다. 예: `home-cafe.yml`

```yaml
category: 홈카페
keywords:
  - 홈카페
  - 원두 보관
  - 핸드드립
  - 에스프레소 머신
# 이미 충분히 다룬 키워드는 지우거나 아래로 옮겨 메모
covered:
  - 홈카페 인테리어   # 2026-05-01 발행
```

- `keywords:` 배열만 추출에 사용된다.
- `category`, `covered` 등 다른 키는 사람이 관리용으로 쓰는 메모일 뿐 무시된다.
- **확장자는 반드시 `.yml`** — `daily-run.js` 가 `*.yml` 만 읽는다.

## 사용
```bash
# 전체 파이프라인 — keyword-bank/*.yml 에서 10개 샘플 → 분석 → top5 저장
node scripts/daily-run.js

# 키워드 1개만 직접 분석 (자동완성 + DataLab + 경쟁도)
node scripts/keyword-free.js "홈카페"
```

`*.yml` 시드 파일이 하나도 없으면 `daily-run.js` 의 키워드 후보가 비어
`keywords.json` 이 빈 배열로 저장된다. 최소 1개는 만들어 둘 것.
`seeds.yml` 이 기본 예시로 들어 있다.
