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
  selectedGridId: string | null;
  basemap: BasemapType;
  theme: 'light' | 'dark';
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
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  features,
  selectedGridId,
  basemap,
  theme,
  timeHorizon,
  layers,
  waterGates,
  evacuationCenters,
  activeRainThreshold,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const jakartaBoundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const waterGatesLayerRef = useRef<L.LayerGroup | null>(null);
  const evacLayerRef = useRef<L.LayerGroup | null>(null);
  const radarCircleLayerRef = useRef<L.LayerGroup | null>(null);

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
    });

    mapInstanceRef.current = map;

    // Layer groups for stations and evacuation centers
    waterGatesLayerRef.current = L.layerGroup().addTo(map);
    evacLayerRef.current = L.layerGroup().addTo(map);
    radarCircleLayerRef.current = L.layerGroup().addTo(map);
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

    return () => {
      window.removeEventListener('pawang:zoomin', handleZoomIn);
      window.removeEventListener('pawang:zoomout', handleZoomOut);
      window.removeEventListener('pawang:reset', handleReset);
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
      case 'positron':
        // Standard OSM Light
        tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        subdomains = '';
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

    if (heatLayerRef.current && map.hasLayer(heatLayerRef.current)) {
      heatLayerRef.current.setLatLngs(filteredPoints);
    } else {
      heatLayerRef.current = null;
      heatLayerRef.current = L.heatLayer(filteredPoints, {
        radius: 25,
        blur: 15,
        minOpacity: 0.18,
        max: 1.0,
        gradient: {
          0.4: 'yellow',
          0.6: 'orange',
          0.8: 'red',
          1.0: 'purple',
        },
      }).addTo(map);
    }

    jakartaBoundaryLayerRef.current?.bringToFront();
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
            ${
              isSiaga
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
          <div style="font-weight: 800; font-size: 13px; color: ${theme === 'dark' ? '#F8FAFC' : '#0F172A'};">
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
  }, [layers.waterGates, waterGates, theme]);

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

  // 8. Pan smoothly to selected region when selected externally
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedGridId) return;

    const selectedFeature = features.find((f) => f.properties.grid_id === selectedGridId);
    if (selectedFeature && selectedFeature.geometry.coordinates[0]) {
      const coords = selectedFeature.geometry.coordinates[0];
      const lats = coords.map((c) => c[1]);
      const lngs = coords.map((c) => c[0]);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

      map.flyTo([centerLat, centerLng], 13, {
        duration: 0.9,
      });
    }
  }, [selectedGridId, features]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
};
