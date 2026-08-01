// ---------- 3. 지도 초기화 / 마커 / 그리드 클러스터링 ----------
function colorForTime(t) {
  if (t == null || isNaN(+t)) return 'dot--na';
  if (t <= 10) return 'dot--1'; if (t <= 15) return 'dot--2';
  if (t <= 20) return 'dot--3'; if (t <= 25) return 'dot--4';
  if (t <= 30) return 'dot--5'; return 'dot--6';
}

function colorForEff(eff) {
  if (eff == null || isNaN(+eff)) return 'dot--na';
  if (!EFF_BREAKS || EFF_BREAKS.length !== 4) return 'dot--6';
  const [q1,q2,q3,q4] = EFF_BREAKS;
  if (eff <= q1) return 'dot--1'; if (eff <= q2) return 'dot--2';
  if (eff <= q3) return 'dot--3'; if (eff <= q4) return 'dot--4';
  return 'dot--5';
}

function computeEffBreaks(geo) {
  const vals = [];
  for (const f of geo.features || []) {
    const v = Number(f.properties?.efficiency);
    if (!isNaN(v) && isFinite(v)) vals.push(v);
  }
  if (!vals.length) return null;
  vals.sort((a,b)=>a-b);
  const q = p => vals[Math.floor(p*(vals.length-1))];
  return [q(0.2), q(0.4), q(0.6), q(0.8)];
}

function fitMapToBounds(coords) {
  if (!mapInstance || !coords || coords.length === 0) return;
  const bounds = L.latLngBounds(coords);
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  const isMobile = winWidth < 768;
  let topPad = 50, rightPad = 50, bottomPad = 50, leftPad = 50;

  if (isMobile) {
    const sheetHeight = winHeight * 0.45;
    bottomPad = Math.min(sheetHeight + 40, winHeight * 0.6);
  } else {
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar && sidebar.classList.contains('active');
    if (isOpen) {
      const targetPad = 320 + 50;
      leftPad = Math.min(targetPad, winWidth * 0.45);
    }
  }

  mapInstance.flyToBounds(bounds, {
    paddingTopLeft: [leftPad, topPad],
    paddingBottomRight: [rightPad, bottomPad]
  });
}

function updateVisibleMarkers() {
  if (!mapInstance || !POINTS.length) return;
  const bounds = mapInstance.getBounds();
  const zoom = mapInstance.getZoom();
  if (!bounds) return;

  const viewportPoints = [];
  let activePt = null;
  const isFiltering = FILTER_LIMIT < MAX_SLIDER_VAL;

  for (const pt of POINTS) {
    const p = pt.props || {};
    const isSelected = selectedPoint && (pt.lat === selectedPoint.lat && pt.lng === selectedPoint.lng);
    if (isSelected) activePt = pt;

    if (!isSelected) {
        if (isFiltering && p.exp_time > FILTER_LIMIT) continue;
        if (MODE === 'eff') {
            if (p.exp_time > 30) continue;
            let monthlyRent = 0;
            if (p.rent && p.rent.toString().includes('@')) {
                const parts = p.rent.toString().split('@');
                if (parts.length > 1) {
                    monthlyRent = Number(parts[1]);
                }
            }
            if (monthlyRent > 65) continue;
        }
    }
    if (bounds.contains([pt.lat, pt.lng])) {
      viewportPoints.push(pt);
    }
  }

  markerLayer.clearLayers();
  clusterLayer.clearLayers();

  const pointsToCluster = viewportPoints.filter(pt => {
    if (!selectedPoint) return true;
    return pt.lat !== selectedPoint.lat || pt.lng !== selectedPoint.lng;
  });

  const useCluster = !isFiltering && (pointsToCluster.length > CLUSTER_THRESHOLD || zoom <= CLUSTER_ZOOM_ON);

  if (activePt) {
    const marker = L.marker([activePt.lat, activePt.lng], {
      zIndexOffset: 9999,
      icon: L.divIcon({ className: '', html: ICON_HOME, iconSize: [36,36], iconAnchor: [18,18] })
    });
    marker.__props = activePt.props;
    marker.__coord = { lat: activePt.lat, lng: activePt.lng };
    marker.on('click', () => {
       openSidebar(marker);
       requestRoute(marker);
    });
    marker.addTo(markerLayer);
  }

  if (useCluster) {
    const clusterMap = new Map();
    const gridSize = 80;

    for (const pt of pointsToCluster) {
      const pixel = mapInstance.latLngToContainerPoint([pt.lat, pt.lng]);
      const k = `${Math.floor(pixel.x/gridSize)}_${Math.floor(pixel.y/gridSize)}`;
      if (!clusterMap.has(k)) clusterMap.set(k, { pts:[], sumLat:0, sumLng:0 });
      const c = clusterMap.get(k);
      c.pts.push(pt); c.sumLat+=pt.lat; c.sumLng+=pt.lng;
    }

    clusterMap.forEach(c => {
      const count = c.pts.length;
      const center = [c.sumLat/count, c.sumLng/count];
      if (count === 1) {
        createDotMarker(c.pts[0]);
      } else {
        const cm = L.marker(center, {
          icon: L.divIcon({
            className: '',
            html: `<div class="cluster-marker">${count}</div>`,
            iconSize: [32,32], iconAnchor: [16,16]
          })
        });
        cm.on('click', () => {
          const nextZoom = Math.min(mapInstance.getZoom() + 2, 17);
          mapInstance.flyTo(center, nextZoom);
        });
        cm.addTo(clusterLayer);
      }
    });
  } else {
    pointsToCluster.forEach(pt => createDotMarker(pt));
  }
  const statusText = isFiltering ? `필터: ${FILTER_LIMIT}분 이내 (${viewportPoints.length}개)` : `총 ${POINTS.length.toLocaleString()}개 / 화면 ${viewportPoints.length}개`;
  setStatus(statusText);
}

function createDotMarker(pt) {
  const props = pt.props || {};
  const colorClass = (MODE === 'time') ? colorForTime(props.exp_time) : colorForEff(props.efficiency);

  const m = L.marker([pt.lat, pt.lng], {
    icon: L.divIcon({ className: '', html: `<div class="dot ${colorClass}"></div>`, iconSize: [10,10], iconAnchor: [5,5] })
  });
  m.__props = props;
  m.__coord = { lat: pt.lat, lng: pt.lng };
  m.on('click', () => {
    selectedPoint = { lat: pt.lat, lng: pt.lng };
    updateVisibleMarkers();
    openSidebar(m);
    requestRoute(m);
  });
  m.addTo(markerLayer);
}

// ---------- 4. 로드 및 초기화 ----------
async function loadData() {
  try {
    const res = await fetch(DATA_URL);
    const json = await res.json();
    DATA = json;
    EFF_BREAKS = computeEffBreaks(DATA);
    POINTS = [];
    (DATA.features||[]).forEach(f => {
      if(f.geometry?.type==='Point') {
        const [lng, lat] = f.geometry.coordinates;
        const props = {...f.properties, lat, lng};
        if(props.exp_time && props.price_per_py_m && !props.efficiency) {
          props.efficiency = props.exp_time / props.price_per_py_m;
        }
        POINTS.push({lat, lng, props});
      }
    });
    applyMode();
  } catch(e) {
    console.error(e);
    setStatus("데이터 로드 실패");
  }
}

function initMap() {
  const map = L.map('map', {
    center: [DEST.lat, DEST.lng],
    zoom: 14,
  });
  mapInstance = map;

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  clusterLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  L.marker([DEST.lat, DEST.lng], {
    title: '도서관',
    icon: L.divIcon({ className: '', html: '<div style="font-size:20px;">🏫</div>', iconSize: [20,20], iconAnchor: [10,10] })
  }).addTo(map);

  map.on('moveend', updateVisibleMarkers);
  map.on('zoomend', updateVisibleMarkers);
  map.on('click', () => { closeSidebar(); });

  initUIControls();
  loadData();
}
