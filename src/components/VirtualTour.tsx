import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Pannellum } from 'pannellum-react';
// import 'pannellum-react/lib/pannellum/css/pannellum.css';
import './';
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

// Exact geometric proof of Three.js SphereGeometry mapped to Pannellum:
// Three.js puts U=0.5 (center of image) at +X. Pannellum places it at yaw=0.
// This directly maps to yaw = atan2(-z, x).
function coordsToPitchYaw(sceneCoords: Coords) {
  const { x, y, z } = sceneCoords;
  const yaw = Math.atan2(-z, x) * (180 / Math.PI);
  const distance = Math.sqrt(x * x + y * y + z * z);
  const pitch = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);
  return { pitch, yaw, distance };
}

function renderCustomTooltip(hotSpotDiv: HTMLElement, args: any) {
  if (!hotSpotDiv.querySelector('.pnlm-tooltip')) {
    const arrowImg = document.createElement('img');
    arrowImg.src = '/virtual-tour/public/hotspot-icon-white-thumb.png';
    arrowImg.className = 'simple-arrow-icon';
    arrowImg.alt = 'navigate';
    hotSpotDiv.appendChild(arrowImg);

    const span = document.createElement('span');
    span.innerHTML = args.text;
    span.className = 'pnlm-tooltip';
    hotSpotDiv.appendChild(span);
  }
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

  const panRef = useRef<any>(null);

  const handlePannellumLoad = useCallback(() => {
    console.log(`Pannellum loaded scene`);

    // Improve smoothness by increasing friction if viewer is accessible
    if (panRef.current) {
      const viewer = panRef.current.getViewer();
      if (viewer && viewer.getConfig()) {
        // Pannellum doesn't have a public setFriction, but we can try to nudge it
        // and adjust other runtime settings for smoothness
        const config = viewer.getConfig();
        config.friction = 0.8; // High friction = smoother, more controlled stop
        config.touchPanSpeed = 0.6; // Reduce touch sensitivity
      }
    }

    // Only fade out if we are currently showing the overlay due to a transition
    if (overlayPhase === 'visible' || overlayPhase === 'fade-in') {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      // Small delay so the scene is actually rendered before we reveal it
      overlayTimerRef.current = setTimeout(() => {
        setOverlayPhase('fade-out');
        overlayTimerRef.current = setTimeout(() => {
          setOverlayPhase('hidden');
        }, 500); // matches CSS fade-out duration
      }, 80);
    }
  }, [overlayPhase]);

  const currentScene = useMemo(() => {
    return tourData.find((s) => s.id === currentSceneId) || tourData[0];
  }, [currentSceneId]);

  if (!currentScene) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-900 text-white">
        No Tour Data Found
      </div>
    );
  }

  return (
    <div className={`relative ${className} vt-root`}>
      <Pannellum
        key={currentScene.id}
        ref={panRef}
        width="100%"
        height="100%"
        image={`/virtual-tour/${currentScene.url}`}
        pitch={0}
        yaw={0}
        hfov={90}
        autoLoad
        crossOrigin="anonymous"
        autoRotate={-1}
        compass={false}
        showZoomCtrl={false}
        showFullscreenCtrl={false}
        mouseZoom={false}
        onLoad={handlePannellumLoad}
      >
        {currentScene.hotspots.map((hotspot, idx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const AnyHotspot = Pannellum.Hotspot as any;
          if (!hotspot.targetSceneId || hotspot.targetSceneId === currentScene.id) return null;

          const rawCoords = hotspot.coords?.plane || hotspot.coords?.scene;
          if (!rawCoords) return null;

          const { pitch, yaw, distance } = coordsToPitchYaw(rawCoords);
          const scale = Math.max(0.3, Math.min(1.2, 500 / distance));

          return (
            <AnyHotspot
              key={hotspot.id || idx}
              type="custom"
              pitch={pitch}
              yaw={yaw}
              cssClass={hotspot.targetSceneId ? 'custom-arrow-hotspot' : 'custom-info-hotspot'}
              tooltip={renderCustomTooltip}
              tooltipArg={{ text: hotspot.title, scale, icon: hotspot.targetSceneId ? '↑' : 'i' }}
              handleClick={() => handleHotspotClick(hotspot.targetSceneId)}
            />
          );
        })}
      </Pannellum>

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
