// ---------- 1. 기본 설정 ----------
const DEST = { lat: 37.563729, lng: 126.936898 };

// ODsay가 IP 화이트리스트로 서버를 제한해서 Render 등 원격 배포에서 호출 불가 —
// 배포 환경에서도 항상 사용자의 로컬 백엔드를 바라봄
const API_BASE = 'http://localhost:8000';

function showBackendOfflineBanner() {
  const banner = document.createElement('div');
  banner.className = 'backend-offline-banner';
  banner.innerHTML = `
    <strong>경로 조회 기능은 로컬 백엔드 실행이 필요합니다.</strong>
    <span>지도·필터·토글은 백엔드 없이도 정상 동작합니다.</span>
  `;
  document.body.appendChild(banner);
}

// 로컬 백엔드 상태 확인 — 응답이 없으면 안내 배너 표시
fetch(`${API_BASE}/health`)
  .then(res => { if (!res.ok) throw new Error('unhealthy'); })
  .catch(() => showBackendOfflineBanner());

const DATA_URL = "data/data.json";

let MODE = 'time';
let DATA = null;
let EFF_BREAKS = null;

let mapInstance = null;
let POINTS = [];
let markerLayer = null;
let clusterLayer = null;
let routeLayer = null;
let selectedPoint = null;
let FILTER_LIMIT = 60; // 60이면 '전체'로 간주

const CLUSTER_THRESHOLD = 3000;
const CLUSTER_ZOOM_ON   = 15;
const MAX_SLIDER_VAL = 60;

const ICON_HOME = `
  <div class="home-marker">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </svg>
  </div>
`;

// ---------- 2. 유틸리티 ----------
function setStatus(text) {
  console.log("Status:", text);
}
function fmt(n, d=0) { return (n == null || n === '' || isNaN(+n)) ? '-' : (+n).toFixed(d); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
