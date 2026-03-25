import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ReactPhotoSphereViewer } from 'react-photo-sphere-viewer';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/markers-plugin/index.css';
import './VirtualTour.css';
import tourData from './tourData.json';

export interface VirtualTourProps {
  sceneId?: string | null;
  className?: string;
  onSceneChange?: (sceneId: string) => void;
}

interface Coords {
  x: number;
  y: number;
  z: number;
}

// Exact geometric proof of Three.js SphereGeometry mapped to Photo Sphere Viewer:
// Three.js puts U=0.5 (center of image) at +X. PSV places it at yaw=0.
// This directly maps to yaw = atan2(-z, x).
function coordsToPitchYaw(sceneCoords: Coords) {
  const { x, y, z } = sceneCoords;
  const yaw = Math.atan2(-z, x) * (180 / Math.PI);
  const pitch = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);
  const distance = Math.sqrt(x * x + y * y + z * z);
  return { pitch, yaw, distance };
}

export const VirtualTour: React.FC<VirtualTourProps> = ({
  sceneId,
  className = 'w-full h-full',
  onSceneChange,
}) => {
  const defaultSceneId = tourData.length > 0 ? tourData[0].id : null;
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(sceneId || defaultSceneId);
  const [overlayPhase, setOverlayPhase] = useState<'hidden' | 'fade-in' | 'visible' | 'fade-out'>(
    'hidden'
  );
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSceneRef = useRef<string | null>(null);
  const viewerRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, []);

  // External sceneId prop change — animate then switch
  useEffect(() => {
    if (sceneId && sceneId !== currentSceneId) {
      triggerTransition(sceneId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

  const triggerTransition = useCallback((targetId: string) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    pendingSceneRef.current = targetId;

    // Phase 1: start fade-in of overlay
    setOverlayPhase('fade-in');

    // Phase 2: after overlay is fully visible, swap the scene
    overlayTimerRef.current = setTimeout(() => {
      setOverlayPhase('visible');
      setCurrentSceneId(targetId);
    }, 350); // matches CSS fade-in duration
  }, []);

  const handleHotspotClick = useCallback(
    (targetSceneId: string | null) => {
      if (!targetSceneId || targetSceneId === currentSceneId) return;
      triggerTransition(targetSceneId);
      if (onSceneChange) onSceneChange(targetSceneId);
    },
    [currentSceneId, onSceneChange, triggerTransition]
  );

  const handleViewerReady = useCallback(
    (instance: any) => {
      viewerRef.current = instance;

      // Fade out the overlay once the scene is ready
      if (overlayPhase === 'visible' || overlayPhase === 'fade-in') {
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => {
          setOverlayPhase('fade-out');
          overlayTimerRef.current = setTimeout(() => {
            setOverlayPhase('hidden');
          }, 500);
        }, 80);
      }
    },
    [overlayPhase]
  );

  const currentScene = useMemo(() => {
    return tourData.find((s) => s.id === currentSceneId) || tourData[0];
  }, [currentSceneId]);

  // Build PSV markers from hotspots
  const markers = useMemo(() => {
    if (!currentScene) return [];
    return currentScene.hotspots
      .filter((hotspot) => hotspot.targetSceneId && hotspot.targetSceneId !== currentScene.id)
      .map((hotspot, idx) => {
        const rawCoords = hotspot.coords?.plane || hotspot.coords?.scene;
        if (!rawCoords) return null;

        const { pitch, yaw } = coordsToPitchYaw(rawCoords);

        return {
          id: hotspot.id || `hs-${idx}`,
          position: { yaw: `${yaw}deg`, pitch: `${pitch}deg` },
          image: '/virtual-tour/public/hotspot-icon-white-thumb.png',
          width: 70,
          height: 70,
          tooltip: {
            content: hotspot.title,
            position: 'top center',
          },
          data: { targetSceneId: hotspot.targetSceneId },
        };
      })
      .filter(Boolean);
  }, [currentScene]);

  if (!currentScene) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-900 text-white">
        No Tour Data Found
      </div>
    );
  }

  return (
    <div className={`relative ${className} vt-root`}>
      <ReactPhotoSphereViewer
        key={currentScene.id}
        ref={viewerRef}
        src={currentScene.url}
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
            {
              markers,
            },
          ],
        ]}
        onReady={(instance: any) => {
          handleViewerReady(instance);

          // Wire up marker click → scene transition
          const markersPlugin = instance.getPlugin(MarkersPlugin);
          if (markersPlugin) {
            markersPlugin.addEventListener('select-marker', (e: any) => {
              const targetSceneId = e.marker?.data?.targetSceneId;
              if (targetSceneId) handleHotspotClick(targetSceneId);
            });
          }
        }}
      />

      {/* Smooth scene-transition overlay — fades in to hide loading, then fades out */}
      <div className={`vt-transition-overlay ${overlayPhase}`} aria-hidden="true" />

      {/* Floating Info Overlay */}
      <div className="absolute top-6 left-6 z-50 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10 shadow-2xl pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-400">
          <span className="text-white font-bold text-xs">360</span>
        </div>
        <div>
          <h3 className="text-white font-bold text-sm tracking-wide">{currentScene.title}</h3>
          <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">
            Select nodes to navigate
          </p>
        </div>
      </div>
    </div>
  );
};
