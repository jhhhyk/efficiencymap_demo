# Backend

ODsay 대중교통 API를 중계하고, 매물별 상세 경로를 가공해 프론트엔드에 전달하는 API 서버입니다.

---

## 목차

- [역할](#역할)
- [왜 백엔드가 필요한가](#왜-백엔드가-필요한가)
- [기술 스택](#기술-스택)
- [파일 구조](#파일-구조)
- [API 명세](#api-명세)
- [요청 처리 흐름](#요청-처리-흐름)
- [경로 선택 알고리즘](#경로-선택-알고리즘)
- [정류장 좌표 추출](#정류장-좌표-추출)
- [캐시](#캐시)
- [실행 및 배포](#실행-및-배포)

---

## 역할

프론트엔드에서 매물 마커를 클릭하면, 해당 매물에서 연세대학교 중앙도서관까지의 **실제 대중교통 경로**를 조회해 반환합니다.

반환되는 데이터는 두 가지입니다.

| 항목 | 용도 |
|---|---|
| 경로 그래픽 좌표 (`graphPos`) | 지도 위에 경로선을 그리는 데 사용 |
| 정류장 좌표 (`stations`) | 승차·하차 정류장 마커를 표시하는 데 사용 |

매물 데이터 자체는 정적 파일로 제공되므로, 백엔드는 경로 조회에만 관여합니다.

---

## 왜 백엔드가 필요한가

브라우저에서 ODsay API를 직접 호출할 수도 있지만, 세 가지 이유로 서버를 경유합니다.

### 1. API 키 보호

클라이언트에서 직접 호출하면 API 키가 브라우저 소스와 네트워크 요청에 그대로 노출됩니다. 서버를 경유하면 키가 서버 환경변수에만 존재합니다.

```
직접 호출:  브라우저 ──▶ ODsay        (키 노출)
서버 경유:  브라우저 ──▶ 백엔드 ──▶ ODsay  (키는 서버에만)
```

### 2. IP 화이트리스트 대응

ODsay는 사전 등록된 IP에서 오는 요청만 허용합니다. 클라이언트에서 직접 호출하면 방문자마다 IP가 달라 등록이 불가능합니다. 서버를 경유하면 등록해야 할 IP가 하나로 고정됩니다.

이 제약 때문에 배포 환경으로 서버리스 PaaS 대신 **고정 IP를 제공하는 VM**을 사용합니다.

### 3. 캐시 공유

브라우저 캐시는 사용자마다 독립적이라 중복 호출을 막지 못합니다. 서버에 캐시를 두면 모든 사용자가 동일한 캐시를 공유하므로, 같은 매물에 대한 반복 조회가 실제 API 호출로 이어지지 않습니다.

---

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 프레임워크 | FastAPI |
| HTTP 클라이언트 | httpx |
| ASGI 서버 | Uvicorn |
| 환경변수 | python-dotenv |
| 리버스 프록시 | Caddy (TLS 자동 발급) |
| 프로세스 관리 | systemd |

---

## 파일 구조

```
backend/
├── main.py            API 서버 본체
├── requirements.txt   의존성
└── .env               환경변수 (git에는 없음, 직접 생성)
```

---

## API 명세

### `GET /health`

서버 상태 확인용 엔드포인트입니다. 프론트엔드가 페이지 로드 시점에 호출해 서버 가용 여부를 판단하고, 백엔드가 응답하지 않으면 경로 조회 기능이 비활성화되었음을 안내합니다.

```json
{ "status": "ok" }
```

### `GET /api/route`

매물 좌표에서 목적지까지의 대중교통 경로를 조회합니다.

**요청 파라미터**

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `from_lat` | float | ✓ | 출발지 위도 |
| `from_lng` | float | ✓ | 출발지 경도 |
| `ride` | string | | 매물 데이터의 이용 노선 (예: `272,7737,606`) |
| `board` | string | | 승차 정류장명 |
| `drop` | string | | 하차 정류장명 |
| `full_stations` | bool | | `true`면 구간의 모든 경유 정류장 반환, 기본값 `false`(구간별 첫·마지막 정류장만) |

`ride` · `board` · `drop`은 선택값이지만, 제공하면 매물 데이터와 동일한 노선을 선택할 확률이 높아집니다.

**응답**

```json
{
  "result": {
    "lane": [
      {
        "section": [
          { "graphPos": [ { "x": 126.94, "y": 37.56 }, ... ] }
        ]
      }
    ]
  },
  "stations": [
    { "x": 126.946421, "y": 37.565364, "stationName": "이대부고" },
    { "x": 126.939161, "y": 37.560118, "stationName": "세브란스병원앞" }
  ]
}
```

`result`는 ODsay 노선 그래픽 응답을 그대로 전달하며, `stations`는 별도로 추출해 병합한 필드입니다.

**오류 응답**

| 상태 코드 | 상황 |
|---|---|
| 404 | 경로를 찾지 못함 |
| 500 | API 키 미설정, 또는 응답 형식이 예상과 다름 |
| 502 | ODsay 통신 실패(재시도 포함) 또는 ODsay가 오류를 반환 |

---

## 요청 처리 흐름

```
GET /api/route?from_lat=&from_lng=&ride=&board=&drop=
  │
  ├─ 1. 캐시 조회
  │     키: "{lat:.5f},{lng:.5f},{ride},{full_stations}"
  │     HIT → 즉시 반환 (ODsay 호출 없음)
  │
  ├─ 2. searchPubTransPathT 호출
  │     출발지 → 목적지의 대중교통 경로 후보 조회
  │
  ├─ 3. 경로 선택
  │     ride / board / drop 과의 매칭 점수를 계산해 최적 경로 결정
  │
  ├─ 4. loadLane 호출
  │     선택된 경로의 mapObj 로 그래픽 좌표 조회
  │
  ├─ 5. 정류장 좌표 추출
  │     2단계 응답의 passStopList 에서 승·하차 정류장 좌표 추출
  │
  └─ 6. 병합 후 반환 + 캐시 저장
```

ODsay API를 **두 번** 호출하는 구조입니다. `searchPubTransPathT`는 경로 후보와 정류장 정보를, `loadLane`은 지도에 그릴 좌표를 제공합니다. 두 호출 모두 8초 타임아웃으로 요청하고, 실패하면 한 번 더 재시도한 뒤에도 실패하면 502를 반환합니다.

---

## 경로 선택 알고리즘

ODsay는 하나의 출발지에 대해 여러 경로를 반환합니다. 그중 어떤 경로를 선택하느냐에 따라 지도에 표시되는 노선이 달라지므로, **매물 데이터에 기록된 노선과 일치하는 경로**를 고르는 것이 중요합니다.

### 점수 계산

각 경로 후보에 대해 다음과 같이 점수를 매깁니다.

| 조건 | 점수 |
|---|---|
| 이용 노선(`ride`)이 일치 | +10 |
| 승차 정류장(`board`)이 경유 정류장 목록에 존재 | +5 |
| 하차 정류장(`drop`)이 경유 정류장 목록에 존재 | +5 |

### 선택 규칙

```
1. 점수가 가장 높은 경로를 선택
2. 점수가 동일하면 총 소요시간이 짧은 경로를 선택
3. 모든 경로가 0점이면 ODsay 추천 1순위 경로로 폴백
4. ride / board / drop 이 모두 비어 있으면 추천 1순위 경로 사용
```

### 문자열 정규화

노선명과 정류장명은 표기가 일정하지 않으므로, 비교 전에 괄호·공백·"번"을 제거해 정규화합니다.

```
"(272번)" → "272"
"이대부고 " → "이대부고"
```

---

## 정류장 좌표 추출

| 데이터 | 출처 |
|---|---|
| 경로선 좌표 | `loadLane` → `section[].graphPos[]` |
| 정류장 좌표 | `searchPubTransPathT` → `passStopList.stations[]` |

### 추출 규칙

- `trafficType`이 1(지하철) 또는 2(버스)인 구간만 대상
- 각 구간의 **첫 정류장과 마지막 정류장**만 반환 (경유 정류장 전체를 표시하면 지도가 과밀해짐)
- 좌표 변환에 실패한 항목은 건너뜀
- `full_stations=true` 요청 시 첫·마지막이 아닌 구간의 모든 정류장을 반환 (기본값은 `false`)

프론트엔드는 `stations` 필드를 우선 사용하고, 비어 있는 경우 기존 `loadLane` 파싱으로 폴백합니다.

---

## 캐시

### 구조

| 항목 | 값 |
|---|---|
| 방식 | LRU (Least Recently Used) |
| 최대 크기 | 500건 |
| 키 | `{from_lat:.5f},{from_lng:.5f},{ride},{full_stations}` |
| 저장 대상 | 최종 병합 응답 (경로 좌표 + 정류장) |

### 효과

동일 매물을 반복 조회할 때 ODsay 호출이 발생하지 않습니다. 공개 배포 환경에서는 여러 사용자가 같은 매물을 조회하는 경우가 많아, 캐시 공유가 API 호출량을 크게 줄입니다.

캐시 히트·미스는 로그로 기록됩니다.

```
[cache] MISS 37.56440,126.95247,(272,7737,606,7024),False
[cache] HIT  37.56440,126.95247,(272,7737,606,7024),False
```

---

## 실행 및 배포

### 로컬 실행

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

nano .env                         # ODSAY_API_KEY=your_key_here 한 줄 작성
uvicorn main:app --reload --port 8000
```

확인:

```bash
curl http://localhost:8000/health
```

### 환경변수

`.env`

```
ODSAY_API_KEY=your_key_here
```

키가 설정되지 않아도 서버는 기동되며, 경고 로그를 출력합니다. 다만 `/api/route` 호출 시 500 오류를 반환합니다.

### CORS

허용 출처를 명시적으로 관리합니다.

```python
ALLOWED_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://jhhhyk.github.io",
]
```

### 배포 구성

고정 IP가 필요하므로 Oracle Cloud VM에 배포합니다.

```
인터넷
  │ HTTPS (443)
Caddy ── Let's Encrypt 인증서 자동 발급·갱신
  │ 프록시 (127.0.0.1:8000)
Uvicorn ── systemd 로 상시 실행
  │
ODsay API
```

**Caddyfile**

```
efficiencymap.duckdns.org {
    reverse_proxy localhost:8000
}
```

**systemd 서비스**

```ini
[Unit]
Description=Efficiency Map FastAPI backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/efficiencymap_demo/backend
Environment="PATH=/home/ubuntu/efficiencymap_demo/backend/venv/bin"
ExecStart=/home/ubuntu/efficiencymap_demo/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Uvicorn을 `127.0.0.1`에만 바인딩해 외부에서 직접 접근할 수 없도록 하고, 모든 외부 트래픽은 Caddy를 통해서만 들어오게 합니다.

> **주의** — 배포 후 VM의 공인 IP를 ODsay 콘솔의 허용 IP 목록에 등록해야 합니다. 등록하지 않으면 API가 오류를 반환합니다.
