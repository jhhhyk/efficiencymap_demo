// ---------- 1. 기본 설정 ----------
const DEST = { lat: 37.563729, lng: 126.936898 };

const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : 'https://YOUR-APP.onrender.com';

// 콜드스타트 방지 — 페이지 로드 즉시 서버 깨우기
fetch(`${API_BASE}/health`).catch(() => {});

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
