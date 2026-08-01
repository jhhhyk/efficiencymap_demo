# Frontend

정적 사이트입니다. 별도 빌드 과정 없이 `index.html`을 브라우저로 열거나, 아무 정적 파일 서버로 `frontend/` 디렉터리를 서빙하면 됩니다.

```
frontend/
├── index.html
├── css/
│   ├── tokens.css   # Figma에서 디자인 변수를 내보내면 여기에 채워 넣을 자리 (현재 비어있음)
│   └── style.css    # 실제 스타일
├── js/
│   ├── config.js    # 상수 / 전역 상태 / 공용 유틸
│   ├── map.js       # Leaflet 지도 초기화, 마커, 그리드 클러스터링, 데이터 로드
│   ├── route.js     # 백엔드(/api/route) 경로 조회 및 폴리라인 렌더링
│   └── ui.js        # 사이드바, 범례, 모드 토글, 필터 슬라이더
└── data/
    └── data.json
```

`js/config.js`, `js/map.js`, `js/route.js`, `js/ui.js`는 일반 `<script>` (non-module)로 순서대로 로드되며, 서로의 최상위 `let`/`const`/`function`을 그대로 참조합니다. Leaflet(CDN)이 이 네 파일보다 먼저 로드되어야 `L` 전역이 준비되고, 네 파일이 모두 로드된 뒤 마지막에 `initMap()`을 직접 호출합니다.

## API 연동

`js/config.js`의 `API_BASE`가 가리키는 백엔드(`backend/main.py`, `/api/route`)를 통해 ODsay를 호출합니다. ODsay API 키는 더 이상 프론트엔드 코드에 없으며 `backend/.env`(gitignore 처리됨)에만 존재합니다. `API_BASE`의 배포 주소(`https://YOUR-APP.onrender.com`)는 실제 배포 URL로 바꿔야 합니다.
