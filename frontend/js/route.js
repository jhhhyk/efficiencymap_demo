// ---------- 5. 경로 로직 (백엔드 /api/route 경유) ----------
function clearRouteOverlays() {
  if (routeLayer) routeLayer.clearLayers();
}

function refreshRoute() {
  if (window.currentMarker) requestRoute(window.currentMarker);
}

function drawWalkOnlyRoute(originCoord) {
  if (!mapInstance) return;
  clearRouteOverlays();
  const destLatLng = [DEST.lat, DEST.lng];
  const originLatLng = [originCoord.lat, originCoord.lng];
  L.polyline([originLatLng, destLatLng], {
    color: cssVar('--color-text-primary'), opacity: 0.8, dashArray: '4 6', weight: 2
  }).addTo(routeLayer);
  fitMapToBounds([originLatLng, destLatLng]);
}

// [핵심] 백엔드(/api/route) 경유 — searchPubTransPathT/loadLane 호출과 경로 선택 로직은 backend/main.py에 있음
async function requestRoute(marker) {
  const p = marker.__props || {};
  const coord = marker.__coord || {};

  if ((p.ride || '').toLowerCase().startsWith('walk')) {
    drawWalkOnlyRoute(coord);
    return;
  }

  setStatus("경로를 불러오는 중...");

  try {
    const params = new URLSearchParams({
      from_lat: coord.lat,
      from_lng: coord.lng,
      ride:  p.ride  || '',
      board: p.board || '',
      drop:  p.drop  || ''
    });
    const res = await fetch(`${API_BASE}/api/route?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const laneData = await res.json();
    drawRouteFromLane(laneData, coord, p);
  } catch (e) {
    console.error("Route error:", e);
    setStatus("경로 호출 실패: " + e.message);
    drawWalkOnlyRoute(coord);
  }
}

function drawRouteFromLane(data, originCoord, props) {
  if (!mapInstance) return;
  clearRouteOverlays();

  if (!data || !data.result || !Array.isArray(data.result.lane)) {
    drawWalkOnlyRoute(originCoord);
    return;
  }

  const result = data.result;
  const polyPaths = [];
  const stationLatLngs = [];
  const stationNames   = [];
  const allStations = [];

  let allPointsForBounds = [];
  const originLatLng = [originCoord.lat, originCoord.lng];
  const destLatLng   = [DEST.lat, DEST.lng];
  allPointsForBounds.push(originLatLng, destLatLng);

  let firstRoutePoint = null;
  let lastRoutePoint  = null;

  for (const lane of result.lane) {
    const sections = lane.section || [];
    for (const section of sections) {
      const graphPos = section.graphPos || [];
      const path = [];

      for (const gp of graphPos) {
        const x = Number(gp.x);
        const y = Number(gp.y);
        if (isNaN(x) || isNaN(y)) continue;
        const latlng = [y, x];
        path.push(latlng);
        allPointsForBounds.push(latlng);

        if (!firstRoutePoint) firstRoutePoint = latlng;
        lastRoutePoint = latlng;
      }

      if (path.length >= 2) polyPaths.push(path);
    }
  }

  // 정류장 마커: 1순위 백엔드가 붙여준 data.stations (searchPubTransPathT의 passStopList 기반),
  // 2순위 loadLane의 section.station (폴백). 둘 다 없으면 정류장 마커 없이 경로선만 표시.
  const backendStations = Array.isArray(data.stations) ? data.stations : [];
  if (backendStations.length) {
    for (const st of backendStations) {
      const sx = Number(st.x);
      const sy = Number(st.y);
      if (isNaN(sx) || isNaN(sy)) continue;
      const latlng = [sy, sx];
      stationLatLngs.push(latlng);
      stationNames.push(st.stationName || '');
      allStations.push({ latlng, name: st.stationName || '' });
    }
  } else {
    for (const lane of result.lane) {
      const sections = lane.section || [];
      for (const section of sections) {
        const stations = section.station || [];
        for (const st of stations) {
          const sx = Number(st.x);
          const sy = Number(st.y);
          if (isNaN(sx) || isNaN(sy)) continue;
          const latlng = [sy, sx];
          stationLatLngs.push(latlng);
          stationNames.push(st.stationName || '');
          allStations.push({ latlng, name: st.stationName || '' });
        }
      }
    }
  }

  for (const path of polyPaths) {
    L.polyline(path, { color: cssVar('--color-brand-primary'), weight: 3, opacity: 0.9 }).addTo(routeLayer);
  }

  for (let i = 0; i < stationLatLngs.length; i++) {
    L.marker(stationLatLngs[i], {
      icon: L.divIcon({ className: '', html: '<div class="stop-dot"></div>', iconSize: [8,8], iconAnchor: [4,4] }),
      title: stationNames[i]
    }).addTo(routeLayer);
  }

  let boardLatLng = firstRoutePoint;
  let dropLatLng  = lastRoutePoint;
  let finalBoardName = (props?.board || '').trim();
  let finalDropName  = (props?.drop || '').trim();

  if (allStations.length) {
    if (finalBoardName) {
      const foundBoard = allStations.find(s => (s.name || '').includes(finalBoardName));
      if (foundBoard) {finalBoardName = foundBoard.name;}
    }
    if (finalDropName) {
      const rev = [...allStations].reverse();
      const foundDrop = rev.find(s => (s.name || '').includes(finalDropName));
      if (foundDrop) {finalDropName = foundDrop.name;}
    }
  }

  if (boardLatLng) {
    L.polyline([originLatLng, boardLatLng], {
      color: cssVar('--color-text-primary'), opacity: 0.8, dashArray: '4 6', weight: 2
    }).addTo(routeLayer);
    L.marker(boardLatLng, {
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: '',
        html: `
            <div class="station-root-dot station-root-dot--board">
                <div class="station-label board">${finalBoardName} 승차</div>
            </div>
        `,
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(routeLayer);
  }

  if (dropLatLng) {
    L.polyline([dropLatLng, destLatLng], {
      color: cssVar('--color-text-primary'), opacity: 0.8, dashArray: '4 6', weight: 2
    }).addTo(routeLayer);
    L.marker(dropLatLng, {
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: '',
        html: `
            <div class="station-root-dot station-root-dot--drop">
                <div class="station-label drop">${finalDropName} 하차</div>
            </div>
        `,
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(routeLayer);
  }
  fitMapToBounds(allPointsForBounds);
  setStatus("경로 표시 완료");
}
