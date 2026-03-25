import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReactPhotoSphereViewer } from 'react-photo-sphere-viewer';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin';
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
  return `<div class="vt-hotspot-marker" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; cursor:pointer;" title="${title}">
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
    ${title ? `<div style="background:rgba(0,0,0,0.65); padding:4px 10px; border-radius:12px; border: 1px solid rgba(255,255,255,0.2); color:white; font-size:13px; font-weight:600; white-space:nowrap; pointer-events:none; text-shadow: 0 1px 2px rgba(0,0,0,0.8); backdrop-filter: blur(4px);">${title}</div>` : ''}
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
        size: { width: 140, height: 100 }, // Increased size to properly fit the icon and text label underneath
        tooltip: { content: hs.title ?? '', position: 'top center' },
        data: { targetSceneId: hs.targetSceneId },
        anchor: 'center center',
      };
    })
    .filter(Boolean);
}

const DEFAULT_SCENE_ID =  "5Pd9XFNOX";

export const VirtualTour: React.FC<VirtualTourProps> = ({
  className = 'w-full h-full',
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // URL defines the source of truth for the target scene
  const urlSceneId = searchParams.get('sceneId') || DEFAULT_SCENE_ID;
  
  // We use local state to track what is *currently* displayed while transitioning
  const [uiSceneId, setUiSceneId] = useState<string>(urlSceneId);

  const viewerRef         = useRef<any>(null);
  const markersPluginRef  = useRef<any>(null);
  const isTransitioningRef = useRef(false);

  const uiScene = useMemo(
    () => tourData.find((s) => s.id === uiSceneId) ?? tourData[0],
    [uiSceneId]
  );
  
  // Run this effect when the URL changes (from Back button or our own push)
  useEffect(() => {
    if (urlSceneId !== uiSceneId && !isTransitioningRef.current && viewerRef.current) {
      const targetScene = tourData.find((s) => s.id === urlSceneId);
      if (targetScene) {
        performTransition(targetScene);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSceneId]);

  const performTransition = (targetScene: typeof tourData[0]) => {
    if (!viewerRef.current || !markersPluginRef.current || isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    // Remove current markers right before transition for a cleaner visually
    markersPluginRef.current.clearMarkers();

    // Use PSV's native smooth crossfade. We provide a large transition value (e.g. 500ms) 
    viewerRef.current.setPanorama(targetScene.url, { 
      transition: 500, // 500ms crossfade
      showLoader: false,
      zoomTo: 50
    }).then(() => {
      // Transition done: update markers and local UI badge state
      markersPluginRef.current.setMarkers(buildMarkers(targetScene) as any);
      setUiSceneId(targetScene.id);
      isTransitioningRef.current = false;
    }).catch((e: any) => {
      console.error("PSV transition failed:", e);
      isTransitioningRef.current = false;
    });
  };

  // Click handler triggered from PSV markers
  const handleHotspotClickRef = useRef<(sceneId: string) => void>(() => {});
  useEffect(() => {
    handleHotspotClickRef.current = (targetId: string) => {
      if (!targetId || targetId === urlSceneId || isTransitioningRef.current) return;
      // Push the new URL parameter. The useEffect above will catch the URL change and trigger `performTransition`
      // This ensures back/forward browser buttons use the exact same logic as clicking markers.
      setSearchParams({ sceneId: targetId }, { replace: true });
    };
  });

  if (!uiScene) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-900 text-white">
        No Tour Data Found
      </div>
    );
  }

  const [initialSceneUrl] = useState(() => tourData.find((s) => s.id === urlSceneId)?.url || tourData[0].url);

  return (
    <div className={`relative ${className} vt-root`}>
      {/* 
        We freeze the src prop to the VERY FIRST scene it mounts with.
        ReactPhotoSphereViewer wrapper internally monitors changes to `src` (prop). 
        To avoid the wrapper automatically calling `setPanorama` and conflicting with our manual 
        smooth transition call, we use `initialSceneUrl` which never changes.
      */}
      <ReactPhotoSphereViewer
        src={initialSceneUrl}
        height="100%"
        width="100%"
        defaultYaw={0}
        defaultPitch={0}
        defaultZoomLvl={50}
        navbar={false}
        touchmoveTwoFingers={false}
        mousewheelCtrlKey={false}
        moveInertia={true}
        moveSpeed={0.8}
        zoomSpeed={0}
        plugins={[
          [
            AutorotatePlugin,
            { 
              autostartDelay: 2500, // 2.5s delay before rotating rotates like pendulum
              autorotateSpeed: '1.5rpm',
              autorotatePitch: 0,
            }
          ],
          [
            MarkersPlugin,
            // Initial markers only. We manage updates manually.
            { markers: buildMarkers(uiScene) },
          ],
        ]}
        onReady={(instance: any) => {
          viewerRef.current = instance;
          const markersPlugin = instance.getPlugin(MarkersPlugin);
          markersPluginRef.current = markersPlugin;
          
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

          // If URL changed before ready due to some weird race
          if (urlSceneId !== uiSceneId && !isTransitioningRef.current) {
            const targetScene = tourData.find((s) => s.id === urlSceneId);
            if (targetScene) performTransition(targetScene);
          }
        }}
      />

      {/* Floating scene badge */}
      <div className="absolute top-6 left-6 z-50 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10 shadow-2xl pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-400">
          <span className="text-white font-bold text-xs">360</span>
        </div>
        <div>
          <h3 className="text-white font-bold text-sm tracking-wide">{uiScene.title}</h3>
          <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">
            Select nodes to navigate
          </p>
        </div>
      </div>
    </div>
  );
};
