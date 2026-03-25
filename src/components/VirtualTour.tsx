import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReactPhotoSphereViewer } from 'react-photo-sphere-viewer';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/markers-plugin/index.css';
import './VirtualTour.css';
import tourData from './tourData.json';

export interface VirtualTourProps {
  className?: string;
}

interface Coords {
  x: number;
  y: number;
  z: number;
}

function coordsToPitchYaw(coords: Coords) {
  const { x, y, z } = coords;
  const yaw   = Math.atan2(-z, x) * (180 / Math.PI);
  const pitch = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);
  return { pitch, yaw };
}

function getBestCoords(hotspot: any): Coords | null {
  const p = hotspot.coords?.plane;
  const s = hotspot.coords?.scene;
  if (p && (p.x !== 0 || p.z !== 0)) return p;
  if (s && (s.x !== 0 || s.z !== 0)) return s;
  return null;
}

function hotspotHTML(title: string) {
  return `<div class="vt-hotspot-marker" title="${title}">
    <img src="/virtual-tour/public/hotspot-icon-white-thumb.png"
         width="56" height="56"
         style="pointer-events:none;display:block;"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
         alt="" />
    <div class="vt-hotspot-fallback" style="display:none;pointer-events:none;">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
        <circle cx="24" cy="24" r="22" fill="rgba(30,100,240,0.82)" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"/>
        <path d="M24 14 l8 10 H16 z" fill="white" opacity="0.95"/>
        <circle cx="24" cy="34" r="3" fill="white" opacity="0.8"/>
      </svg>
    </div>
  </div>`;
}

function buildMarkers(scene: (typeof tourData)[number]) {
  return scene.hotspots
    .filter((hs) => hs.targetSceneId && hs.targetSceneId !== scene.id)
    .map((hs, idx) => {
      const coords = getBestCoords(hs);
      if (!coords) return null;
      const { pitch, yaw } = coordsToPitchYaw(coords);
      return {
        id: hs.id || `hs-${idx}`,
        position: { yaw: `${yaw}deg`, pitch: `${pitch}deg` },
        html: hotspotHTML(hs.title ?? ''),
        size: { width: 64, height: 64 },
        tooltip: { content: hs.title ?? '', position: 'top center' },
        data: { targetSceneId: hs.targetSceneId },
        anchor: 'center center',
      };
    })
    .filter(Boolean);
}

const DEFAULT_SCENE_ID = tourData.length > 0 ? tourData[0].id : '';

export const VirtualTour: React.FC<VirtualTourProps> = ({
  className = 'w-full h-full',
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // URL defines the source of truth for the current scene
  const urlSceneId = searchParams.get('sceneId') || DEFAULT_SCENE_ID;
  
  // We keep a local state for the *target* scene during transition
  const [activeSceneId, setActiveSceneId] = useState<string>(urlSceneId);
  const [overlayPhase, setOverlayPhase] = useState<
    'hidden' | 'fade-in' | 'visible' | 'fade-out'
  >('hidden');

  const overlayTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef         = useRef<any>(null);

  const activeScene = useMemo(
    () => tourData.find((s) => s.id === activeSceneId) ?? tourData[0],
    [activeSceneId]
  );

  // Sync URL changes to local active scene
  useEffect(() => {
    if (urlSceneId !== activeSceneId) {
       // Only trigger fade-in if we aren't already transitioning
       if (overlayPhase === 'hidden' || overlayPhase === 'fade-out') {
           setOverlayPhase('fade-in');
           if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
           overlayTimerRef.current = setTimeout(() => {
               setOverlayPhase('visible');
               setActiveSceneId(urlSceneId);
           }, 300);
       } else {
           setActiveSceneId(urlSceneId);
       }
    }
  }, [urlSceneId, activeSceneId, overlayPhase]);

  // Click handler
  const handleHotspotClickRef = useRef<(sceneId: string) => void>(() => {});
  useEffect(() => {
    handleHotspotClickRef.current = (targetId: string) => {
      if (!targetId || targetId === activeSceneId) return;
      // Fade out to black before pushing URL to trigger remount/src change safely
      setOverlayPhase('fade-in');
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => {
        setOverlayPhase('visible');
        setSearchParams({ sceneId: targetId }, { replace: true });
      }, 300);
    };
  });

  // When activeSceneId (and thus PSV src) has changed, wait a bit then fade out overlay
  useEffect(() => {
    if (overlayPhase === 'visible') {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      // Wait for PSV to load the new src
      overlayTimerRef.current = setTimeout(() => {
        setOverlayPhase('fade-out');
        overlayTimerRef.current = setTimeout(() => setOverlayPhase('hidden'), 500);
      }, 400); // give PSV time to load the image
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSceneId]);

  useEffect(() => () => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, []);

  if (!activeScene) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-900 text-white">
        No Tour Data Found
      </div>
    );
  }

  return (
    <div className={`relative ${className} vt-root`}>
      {/* ReactPhotoSphereViewer automatically reacts to src changes */}
      <ReactPhotoSphereViewer
        key={activeScene.id} // Full remount per scene is the safest way to avoid PSV plugin state bugs
        src={activeScene.url}
        height="100%"
        width="100%"
        defaultYaw={0}
        defaultPitch={0}
        defaultZoomLvl={50}
        navbar={false}
        touchmoveTwoFingers={false}
        mousewheelCtrlKey={false}
        moveInertia={true}
        moveSpeed={0.6}
        zoomSpeed={0}
        plugins={[
          [
            MarkersPlugin,
            { markers: buildMarkers(activeScene) },
          ],
        ]}
        onReady={(instance: any) => {
          viewerRef.current = instance;
          const markersPlugin = instance.getPlugin(MarkersPlugin);
          if (markersPlugin) {
            markersPlugin.addEventListener('select-marker', (e: any) => {
              const targetSceneId =
                e.marker?.data?.targetSceneId ??
                e.marker?.config?.data?.targetSceneId;
              if (targetSceneId) {
                handleHotspotClickRef.current(targetSceneId);
              }
            });
          }
        }}
      />

      {/* Smooth scene-transition overlay */}
      <div className={`vt-transition-overlay ${overlayPhase}`} aria-hidden="true" />

      {/* Floating scene badge */}
      <div className="absolute top-6 left-6 z-50 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10 shadow-2xl pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-400">
          <span className="text-white font-bold text-xs">360</span>
        </div>
        <div>
          <h3 className="text-white font-bold text-sm tracking-wide">{activeScene.title}</h3>
          <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">
            Select nodes to navigate
          </p>
        </div>
      </div>
    </div>
  );
};
