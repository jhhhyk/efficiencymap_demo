// ---------- 6. UI 제어 (사이드바 / 범례 / 모드 토글 / 필터) ----------
function applyMode() {
  updateLegend();
  document.getElementById('btn-time').classList.toggle('active', MODE==='time');
  document.getElementById('btn-eff').classList.toggle('active',  MODE==='eff');
  updateVisibleMarkers();
}

function updateLegend() {
  const rows = document.getElementById('legend-rows');
  const title = document.getElementById('legend-title');
  rows.innerHTML = '';
  if (MODE === 'time') {
    title.textContent = '소요시간 (분)';
    const labels = ['0-10','10-15','15-20','20-25','25-30','30+'];
    labels.forEach((label, i) => {
      rows.innerHTML += `<div class="lg-row"><span class="swatch dot--${i+1}"></span><span>${label}</span></div>`;
    });
  } else {
    title.textContent = '효율';
    const b = EFF_BREAKS || [];
    const labels = b.length===4 ? ['매우 좋음','좋음','보통','나쁨','매우 나쁨'] : ['1','2','3','4','5'];
    labels.forEach((label, i) => {
      rows.innerHTML += `<div class="lg-row"><span class="swatch dot--${i+1}"></span><span>${label}</span></div>`;
    });
  }
}

function openSidebar(marker) {
  const filterCtrl = document.getElementById('filter-control');
  if (filterCtrl) filterCtrl.classList.add('hidden-ui');

  const p = marker.__props || {};
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('sidebar-content');

  let rentDisplay = esc(p.rent || '-');
  if (p.rent && p.rent.includes('@')) {
    const parts = p.rent.split('@');
    if (parts.length === 2) {
      rentDisplay = `보증금 ${esc(parts[0])} / 월세 ${esc(parts[1])}`;
    }
  }

  const rideMode = (p.ride || '').toString().trim().toLowerCase();
  let routeDetailHtml = '';

  if (rideMode === 'walk' || rideMode === 'walk_only') {
    routeDetailHtml = `<span>🚶 도보 ${fmt(p.exp_time)}분</span>`;
  } else {
    routeDetailHtml = `
        <span>🚶 ${fmt(p.w1)}분</span>
        <span class="sb-muted">→</span>
        <span>🚌 ${fmt(p.t1)}분</span>
        <span class="sb-muted">→</span>
        <span>🚶 ${fmt(p.w2)}분</span>
    `;
  }

  content.innerHTML = `
    <div class="sb-header">
      <div class="sb-title">${esc(p.name || '건물 정보')}</div>
      <button class="sb-close" onclick="closeSidebar()">×</button>
    </div>
    <div class="sb-body">
      <div class="sb-row"><span class="sb-badge">${esc(p.usage || '용도미상')}</span></div>
      <div class="sb-row"><b>주소:</b> ${esc(p.address || '-')}</div>
      <div class="sb-row"><b>가격:</b> ${rentDisplay} <span class="sb-muted">|</span> <b>면적:</b> ${fmt(p.area,1)}㎡</div>
      <hr class="sb-divider">
      <div class="sb-row"><b>이동수단:</b> ${esc(p.ride || '정보 없음')}</div>

      <div class="sb-row sb-route-row">
        ${routeDetailHtml}
      </div>

      <div class="sb-row sb-highlight">
         배차간격을 고려한 기대소요시간: ${fmt(p.exp_time)}분
      </div>
        <div class="sb-row sb-caption">
          효율지수: ${fmt(p.efficiency, 3)} (낮을수록 좋음)
    </div>
  `;
  sidebar.classList.add('active');
  window.currentMarker = marker;
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('active');
  const filterCtrl = document.getElementById('filter-control');
  if (filterCtrl) filterCtrl.classList.remove('hidden-ui');
  clearRouteOverlays();
  if (selectedPoint) {
    selectedPoint = null;
    updateVisibleMarkers();
  }
}

function initUIControls() {
  document.getElementById('btn-time').addEventListener('click', ()=>{ MODE='time'; applyMode(); });
  document.getElementById('btn-eff').addEventListener('click', ()=>{ MODE='eff'; applyMode(); });

  const filterCtrl = document.getElementById('filter-control');
  const slider = document.getElementById('time-slider');
  const label = document.getElementById('filter-val-label');

  if (filterCtrl && slider) {
    filterCtrl.addEventListener('click', (e) => {
       if (e.target === slider) return;
       filterCtrl.classList.toggle('expanded');
    });
    slider.addEventListener('input', (e) => {
       const val = Number(e.target.value);
       FILTER_LIMIT = val;
       label.textContent = (val === 60) ? '전체' : `${val}분`;
       updateVisibleMarkers();
    });
  }
}
