'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  BasemapType,
  GeoJSONGridFeature,
  WaterGateStation,
  EvacuationCenter,
  TimeHorizon,
} from '@/data/types';
import { getDenseHeatPoints } from '@/data/floodData';
import { JAKARTA_ADMIN_BOUNDARY } from '@/data/jakartaBoundary';
import 'leaflet.heat';

interface LeafletMapProps {
  features: GeoJSONGridFeature[];
  markerPosition: [number, number] | null;
  basemap: BasemapType;
  timeHorizon: TimeHorizon;
  layers: {
    heatmap: boolean;
    waterGates: boolean;
    evacuation: boolean;
    radarPulse: boolean;
  };
  waterGates: WaterGateStation[];
  evacuationCenters: EvacuationCenter[];
  activeRainThreshold: number | null;
  onSelectGrid: (gridId: string, position?: [number, number]) => void;
}

const isPointInRing = (lng: number, lat: number, ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const isPointInPolygon = (lng: number, lat: number, rings: number[][][]): boolean =>
  isPointInRing(lng, lat, rings[0]) &&
  !rings.slice(1).some((ring) => isPointInRing(lng, lat, ring));

const isPointInBoundary = (
  lng: number,
  lat: number,
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][][] | number[][][];
  }
): boolean => {
  if (geometry.type === 'Polygon') {
    return isPointInPolygon(lng, lat, geometry.coordinates as number[][][]);
  }

  return geometry.coordinates.some((polygon) =>
    isPointInPolygon(lng, lat, polygon as number[][][])
  );
};

const getFeatureDistance = (
  lng: number,
  lat: number,
  feature: GeoJSONGridFeature
): number => {
  const ring = feature.geometry.coordinates[0];
  const center = ring.reduce(
    (result, [featureLng, featureLat]) => ({
      lng: result.lng + featureLng / ring.length,
      lat: result.lat + featureLat / ring.length,
    }),
    { lng: 0, lat: 0 }
  );
  return (center.lng - lng) ** 2 + (center.lat - lat) ** 2;
};

export const LeafletMap: React.FC<LeafletMapProps> = ({
  features,
  markerPosition,
  basemap,
  timeHorizon,
  layers,
  waterGates,
  evacuationCenters,
  activeRainThreshold,
  onSelectGrid,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef(features);
  const onSelectGridRef = useRef(onSelectGrid);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const jakartaBoundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const waterGatesLayerRef = useRef<L.LayerGroup | null>(null);
  const evacLayerRef = useRef<L.LayerGroup | null>(null);
  const radarCircleLayerRef = useRef<L.LayerGroup | null>(null);
  const selectedLocationLayerRef = useRef<L.LayerGroup | null>(null);

  // Zoom-aware radius: grows gently with zoom to prevent fragmentation when zooming in,
  // but is capped so it never floods the entire screen with a single color.
  //   zoom 9  → ~14px radius
  //   zoom 11 → ~28px radius  (reference / default view)
  //   zoom 13 → ~55px radius
  //   zoom 15 → ~75px radius  (hard cap)
  const BASE_RADIUS = 28;
  const BASE_BLUR = 20;
  const REFERENCE_ZOOM = 11;
  const MAX_RADIUS = 75;
  const MAX_BLUR = 50;
  const getZoomRadius = (zoom: number) =>
    Math.round(Math.min(MAX_RADIUS, Math.max(8, BASE_RADIUS * Math.pow(1.4, zoom - REFERENCE_ZOOM))));
  const getZoomBlur = (zoom: number) =>
    Math.round(Math.min(MAX_BLUR, Math.max(5, BASE_BLUR * Math.pow(1.4, zoom - REFERENCE_ZOOM))));

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    onSelectGridRef.current = onSelectGrid;
  }, [onSelectGrid]);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on Jabodetabek / Jakarta: latitude: -6.2088, longitude: 106.8456, zoom: 11
    const map = L.map(mapContainerRef.current, {
      center: [-6.2088, 106.8456],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      minZoom: 9,
      maxZoom: 18,
      doubleClickZoom: false,
    });

    mapInstanceRef.current = map;

    // Layer groups for stations and evacuation centers
    waterGatesLayerRef.current = L.layerGroup().addTo(map);
    evacLayerRef.current = L.layerGroup().addTo(map);
    radarCircleLayerRef.current = L.layerGroup().addTo(map);
    selectedLocationLayerRef.current = L.layerGroup().addTo(map);
    jakartaBoundaryLayerRef.current = L.geoJSON(JAKARTA_ADMIN_BOUNDARY as GeoJSON.GeoJsonObject, {
      style: {
        color: 'red',
        weight: 2,
        fill: false,
        fillOpacity: 0,
      },
    }).addTo(map);

    // Custom window events for decoupled map controls
    const handleZoomIn = () => map.zoomIn();
    const handleZoomOut = () => map.zoomOut();
    const handleReset = () => map.flyTo([-6.2088, 106.8456], 11, { duration: 1 });

    window.addEventListener('pawang:zoomin', handleZoomIn);
    window.addEventListener('pawang:zoomout', handleZoomOut);
    window.addEventListener('pawang:reset', handleReset);

    let lastInspectionAt = 0;
    const inspectMapCoordinate = (event: L.LeafletMouseEvent) => {
      const now = Date.now();
      if (now - lastInspectionAt < 350) return;
      lastInspectionAt = now;

      const { lat, lng } = event.latlng;
      const isInsideJakarta = JAKARTA_ADMIN_BOUNDARY.features.some((feature) =>
        isPointInBoundary(lng, lat, feature.geometry)
      );
      if (!isInsideJakarta) return;

      const clickedFeature =
        featuresRef.current.find((feature) =>
          isPointInPolygon(lng, lat, feature.geometry.coordinates)
        ) ??
        featuresRef.current.reduce<GeoJSONGridFeature | null>(
          (nearest, feature) => {
            if (!nearest) return feature;
            return getFeatureDistance(lng, lat, feature) <
              getFeatureDistance(lng, lat, nearest)
              ? feature
              : nearest;
          },
          null
        );

      if (clickedFeature) {
        onSelectGridRef.current(clickedFeature.properties.grid_id, [lat, lng]);
      }
    };

    const handleMapDoubleClick = (event: L.LeafletMouseEvent) => {
      if (event.originalEvent.button !== 0) return;
      event.originalEvent.preventDefault();
      inspectMapCoordinate(event);
    };

    map.on('dblclick', handleMapDoubleClick);

    return () => {
      window.removeEventListener('pawang:zoomin', handleZoomIn);
      window.removeEventListener('pawang:zoomout', handleZoomOut);
      window.removeEventListener('pawang:reset', handleReset);
      map.off('dblclick', handleMapDoubleClick);
      if (heatLayerRef.current) {
        if (map.hasLayer(heatLayerRef.current)) {
          map.removeLayer(heatLayerRef.current);
        }
        heatLayerRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
      jakartaBoundaryLayerRef.current = null;
    };
  }, []);

  // 2. Basemap Switcher (100% Free OpenStreetMap & OpenTopoMap - ZERO API Key Required)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const container = mapContainerRef.current;
    if (!map || !container) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let tileUrl = '';
    let maxZoom = 19;
    let subdomains = 'abc';
    let isDarkTiles = false;

    switch (basemap) {
      case 'dark':
        // Standard OSM with high-contrast NOAA Dark Mode CSS Filter
        tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        subdomains = '';
        isDarkTiles = true;
        break;
      case 'topographic':
        // OpenTopoMap for hydrological contours and elevation
        tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
        subdomains = 'abc';
        maxZoom = 17;
        break;
      case 'osm':
      default:
        // Humanitarian OSM (HOT)
        tileUrl = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
        subdomains = 'abc';
        maxZoom = 19;
        break;
    }

    if (isDarkTiles) {
      container.classList.add('dark-tiles');
    } else {
      container.classList.remove('dark-tiles');
    }

    const newTileLayer = L.tileLayer(tileUrl, {
      subdomains,
      maxZoom,
      detectRetina: true,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [basemap]);

  // 3. Render the official leaflet.heat flood-probability layer.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!layers.heatmap) {
      if (heatLayerRef.current) {
        if (map.hasLayer(heatLayerRef.current)) {
          map.removeLayer(heatLayerRef.current);
        }
        heatLayerRef.current = null;
      }
      return;
    }

    const rawPoints = getDenseHeatPoints(timeHorizon);
    const filteredPoints = activeRainThreshold
      ? rawPoints.filter((p) => p[2] * 35 >= activeRainThreshold)
      : rawPoints;

    const zoom = map.getZoom();
    const currentRadius = getZoomRadius(zoom);
    const currentBlur = getZoomBlur(zoom);

    const heatOptions = {
      radius: currentRadius,
      blur: currentBlur,
      minOpacity: 0.18,
      max: 1.0,
      gradient: {
        0.35: '#22C55E',
        0.55: '#EAB308',
        0.75: '#FACC15',
        0.9: '#EF4444',
        1.0: '#B91C1C',
      },
    };

    if (heatLayerRef.current && map.hasLayer(heatLayerRef.current)) {
      heatLayerRef.current.setLatLngs(filteredPoints);
      heatLayerRef.current.setOptions(heatOptions);
    } else {
      heatLayerRef.current = null;
      heatLayerRef.current = L.heatLayer(filteredPoints, heatOptions).addTo(map);
    }

    jakartaBoundaryLayerRef.current?.bringToFront();

    // Keep radius in sync with zoom so heatmap stays geographically consistent.
    const onZoomEnd = () => {
      if (!heatLayerRef.current || !map.hasLayer(heatLayerRef.current)) return;
      const z = map.getZoom();
      heatLayerRef.current.setOptions({
        radius: getZoomRadius(z),
        blur: getZoomBlur(z),
      });
      jakartaBoundaryLayerRef.current?.bringToFront();
    };

    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [timeHorizon, layers.heatmap, activeRainThreshold]);

  // 4. River Water Gate Stations (Pintu Air / Stream Gauges)
  useEffect(() => {
    const group = waterGatesLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layers.waterGates) return;

    waterGates.forEach((gate) => {
      const isSiaga = gate.status === 'Siaga 1' || gate.status === 'Siaga 2';
      const markerColor = isSiaga ? '#EF4444' : gate.status === 'Siaga 3' ? '#F59E0B' : '#10B981';

      const customIcon = L.divIcon({
        className: 'custom-station-icon',
        html: `
          <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
            ${isSiaga
            ? `<span style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background-color: ${markerColor}; opacity: 0.4; animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>`
            : ''
          }
            <div style="width: 22px; height: 22px; border-radius: 50%; background: #1E293B; border: 2.5px solid ${markerColor}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${markerColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              </svg>
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([gate.lat, gate.lng], { icon: customIcon });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; padding: 2px;">
          <div style="font-weight: 800; font-size: 13px; color: #F8FAFC;">
            ${gate.name}
          </div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">${gate.river}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: rgba(0,0,0,0.06); padding: 6px; border-radius: 6px; margin-bottom: 6px;">
            <div>
              <span style="font-size: 9.5px; color: #64748B;">Tinggi Air:</span>
              <div style="font-weight: 700; font-size: 13px; color: ${markerColor};">${gate.currentLevelCm} cm</div>
            </div>
            <div>
              <span style="font-size: 9.5px; color: #64748B;">Status:</span>
              <div style="font-weight: 700; font-size: 11px; color: ${markerColor};">${gate.status}</div>
            </div>
          </div>
          <div style="font-size: 9.5px; color: #94A3B8; text-align: right;">
            Diperbarui: ${gate.updatedAt}
          </div>
        </div>
      `);

      group.addLayer(marker);
    });
  }, [layers.waterGates, waterGates]);

  // 6. Evacuation Centers (Posko Pengungsian)
  useEffect(() => {
    const group = evacLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layers.evacuation) return;

    evacuationCenters.forEach((evac) => {
      const evacIcon = L.divIcon({
        className: 'custom-evac-icon',
        html: `
          <div style="width: 24px; height: 24px; border-radius: 6px; background: #059669; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([evac.lat, evac.lng], { icon: evacIcon });
      marker.bindPopup(`
        <div style="font-size: 12px; padding: 2px;">
          <div style="font-weight: 800; color: #059669; font-size: 13px;">${evac.name}</div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 6px;">${evac.address}</div>
          <div style="font-size: 11px; margin-bottom: 4px;">
            <strong>Kapasitas:</strong> ${evac.capacity - evac.occupancy} tempat tidur tersedia
          </div>
          <div style="font-size: 11px; color: #0284C7; font-family: monospace;">
            📞 ${evac.contact}
          </div>
        </div>
      `);

      group.addLayer(marker);
    });
  }, [layers.evacuation, evacuationCenters]);

  // 7. Radar Pulse Rings
  useEffect(() => {
    const group = radarCircleLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (!layers.radarPulse) return;

    const center: [number, number] = [-6.2088, 106.8456];

    [8000, 16000, 24000].forEach((radius, idx) => {
      const circle = L.circle(center, {
        radius,
        color: '#006EFF',
        weight: 1,
        dashArray: '4, 8',
        fillColor: '#006EFF',
        fillOpacity: idx === 0 ? 0.05 : 0.02,
      });
      group.addLayer(circle);
    });
  }, [layers.radarPulse]);

  // 8. Keep the location marker independent from the selected analysis grid.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const selectedLayer = selectedLocationLayerRef.current;
    if (!map || !selectedLayer) return;

    selectedLayer.clearLayers();
    if (!markerPosition) return;

    const locationIcon = L.divIcon({
      className: 'selected-location-marker',
      html: `
        <div style="width: 24px; height: 31px; display: flex; align-items: flex-start; justify-content: center; filter: drop-shadow(0 1px 2px rgba(0,0,0,.55));">
          <svg width="24" height="31" viewBox="0 0 38 48" aria-hidden="true">
            <path d="M19 2C9.6 2 2 9.6 2 19c0 12.5 17 26 17 26s17-13.5 17-26C36 9.6 28.4 2 19 2Z" fill="#EF4444" stroke="#991B1B" stroke-width="3"/>
            <circle cx="19" cy="19" r="7" fill="#FEE2E2" stroke="#991B1B" stroke-width="3"/>
          </svg>
        </div>
      `,
      iconSize: [24, 31],
      iconAnchor: [12, 29],
    });
    selectedLayer.addLayer(L.marker(markerPosition, { icon: locationIcon }));
  }, [markerPosition]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
};
