import React, { useMemo, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ReactPhotoSphereViewer } from "react-photo-sphere-viewer";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import { AutorotatePlugin } from "@photo-sphere-viewer/autorotate-plugin";
import { Cache } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "./VirtualTour.css";
import tourData from "./tourData.json";

Cache.enabled = true;
Cache.ttl = 300;
Cache.maxItems = 3;

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
  const yaw = Math.atan2(-z, x) * (180 / Math.PI);
  const pitch = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);
  return { pitch, yaw };
}

function pitchYawToCoords(pitchDeg: number, yawDeg: number): Coords {
  const pitchRad = pitchDeg * (Math.PI / 180);
  const yawRad = yawDeg * (Math.PI / 180);
  const r = 2000;
  const y = r * Math.sin(pitchRad);
  const r_xz = r * Math.cos(pitchRad);
  const x = r_xz * Math.cos(yawRad);
  const z = -r_xz * Math.sin(yawRad);
  return { x, y, z };
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
    ${title ? `<div style="background:rgba(0,0,0,0.65); padding:4px 10px; border-radius:12px; border: 1px solid rgba(255,255,255,0.2); color:white; font-size:13px; font-weight:600; white-space:nowrap; pointer-events:none; text-shadow: 0 1px 2px rgba(0,0,0,0.8); backdrop-filter: blur(4px);">${title}</div>` : ""}
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
        html: hotspotHTML(hs.title ?? ""),
        size: { width: 140, height: 100 },
        tooltip: { content: hs.title ?? "", position: "top center" },
        data: { targetSceneId: hs.targetSceneId },
        anchor: "center center",
      };
    })
    .filter(Boolean);
}

const DEFAULT_SCENE_ID = "5Pd9XFNOX";

export const VirtualTour: React.FC<VirtualTourProps> = ({
  className = "w-full h-full",
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSceneId = searchParams.get("sceneId") || DEFAULT_SCENE_ID;
  const [uiSceneId, setUiSceneId] = useState<string>(urlSceneId);

  const viewerRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);
  const isTransitioningRef = useRef(false);
  // Development only tools map editing
  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = useRef(false);
  const [modalData, setModalData] = useState<{
    pitch: number;
    yaw: number;
  } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTargetSceneId, setNewTargetSceneId] = useState("");
  const uiScene = useMemo(
    () => tourData.find((s) => s.id === uiSceneId) ?? tourData[0],
    [uiSceneId],
  );

  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (!uiScene?.hotspots) return;

    const neededUrls = new Set<string>();
    uiScene.hotspots.forEach((hs: any) => {
      if (hs.targetSceneId && hs.targetSceneId !== uiScene.id) {
        const targetScene = tourData.find((s) => s.id === hs.targetSceneId);
        if (targetScene?.url) {
          neededUrls.add(targetScene.url);
        }
      }
    });

    const cache = imageCacheRef.current;

    // Remove images that are no longer needed
    for (const [url, img] of cache.entries()) {
      if (!neededUrls.has(url)) {
        img.src = ""; // Free memory
        cache.delete(url);
      }
    }

    // Preload new images
    for (const url of neededUrls) {
      if (!cache.has(url)) {
        const img = new Image();
        img.src = url;
        cache.set(url, img);
      }
    }
  }, [uiScene]);

  useEffect(() => {
    if (
      urlSceneId !== uiSceneId &&
      !isTransitioningRef.current &&
      viewerRef.current
    ) {
      const targetScene = tourData.find((s) => s.id === urlSceneId);
      if (targetScene) {
        // Immediately cancel preloading of ANY images that are not the new target scene.
        // This frees up the browser's network queue to download the target image ASAP.
        const targetUrl = targetScene.url;
        const cache = imageCacheRef.current;
        for (const [url, img] of cache.entries()) {
          if (url !== targetUrl) {
            img.src = ""; // Setting src to empty aborts the pending request
            cache.delete(url);
          }
        }

        performTransition(targetScene);
      }
    }
  }, [urlSceneId]);

  const performTransition = (targetScene: (typeof tourData)[0]) => {
    if (
      !viewerRef.current ||
      !markersPluginRef.current ||
      isTransitioningRef.current
    )
      return;
    isTransitioningRef.current = true;
    markersPluginRef.current.clearMarkers();

    viewerRef.current
      .setPanorama(targetScene.url, {
        transition: 500,
        showLoader: false,
        zoomTo: 70,
      })
      .then(() => {
        markersPluginRef.current.setMarkers(buildMarkers(targetScene) as any);
        setUiSceneId(targetScene.id);
        isTransitioningRef.current = false;
      })
      .catch((e: any) => {
        console.error("PSV transition failed:", e);
        isTransitioningRef.current = false;
      });
  };

  const handleHotspotClickRef = useRef<(sceneId: string) => void>(() => {});
  useEffect(() => {
    handleHotspotClickRef.current = (targetId: string) => {
      if (!targetId || targetId === urlSceneId || isTransitioningRef.current)
        return;
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

  const [initialSceneUrl] = useState(
    () => tourData.find((s) => s.id === urlSceneId)?.url || tourData[0].url,
  );

  return (
    <div className={`relative ${className} vt-root`}>
      {true && (
        <button
          className="absolute top-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-lg border border-white/20 font-semibold"
          onClick={() => {
            isEditModeRef.current = !isEditModeRef.current;
            setIsEditMode(isEditModeRef.current);
          }}
        >
          {isEditMode ? "Disable Edit Mode" : "Enable Edit Mode"}
        </button>
      )}

      {modalData && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl text-black flex flex-col gap-4 w-80 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-800">Add New Hotspot</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Title
              </label>
              <input
                className="border border-gray-300 rounded p-2 w-full text-black outline-none focus:border-indigo-500"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Main Gate"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">
                Target Scene ID
              </label>
              <input
                className="border border-gray-300 rounded p-2 w-full text-black outline-none focus:border-indigo-500"
                value={newTargetSceneId}
                onChange={(e) => setNewTargetSceneId(e.target.value)}
                placeholder="e.g. 5Pd9XFNOX"
              />
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <button
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
                onClick={() => setModalData(null)}
              >
                Cancel
              </button>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                onClick={() => {
                  const c = pitchYawToCoords(modalData.pitch, modalData.yaw);
                  const newHotspot = {
                    id: "hs_" + Math.random().toString(36).substr(2, 6),
                    title: newTitle,
                    targetSceneId: newTargetSceneId,
                    coords: {
                      plane: c,
                      scene: c,
                    },
                  };

                  console.log(
                    "================ NEW HOTSPOT JSON ================",
                  );
                  console.log(
                    `Add this inside hotspots array of scene "${uiSceneId}" in tourData.json:`,
                  );
                  console.log(JSON.stringify(newHotspot, null, 2));
                  console.log(
                    "==================================================",
                  );

                  markersPluginRef.current.addMarker({
                    id: newHotspot.id,
                    position: {
                      yaw: `${modalData.yaw}deg`,
                      pitch: `${modalData.pitch}deg`,
                    },
                    html: hotspotHTML(newHotspot.title),
                    size: { width: 140, height: 100 },
                    tooltip: {
                      content: newHotspot.title,
                      position: "top center",
                    },
                    data: { targetSceneId: newHotspot.targetSceneId },
                    anchor: "center center",
                  });

                  fetch("/api/save-hotspot", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sceneId: uiSceneId,
                      hotspot: newHotspot,
                    }),
                  })
                    .then((res) => res.json())
                    .then((data) => {
                      if (data.success) {
                        alert("Hotspot saved automatically to tourData.json!");
                      } else {
                        alert(
                          "Failed to save automatically. Check server logs. JSON logged to console.",
                        );
                      }
                    })
                    .catch((e) => {
                      console.error(e);
                      alert("Error saving hotspot. JSON logged to console.");
                    });

                  setModalData(null);
                  setNewTitle("");
                  setNewTargetSceneId("");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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
              autostartDelay: 2500,
              autorotateSpeed: "1.5rpm",
              autorotatePitch: 0,
            },
          ],
          [MarkersPlugin, { markers: buildMarkers(uiScene) }],
        ]}
        onReady={(instance: any) => {
          viewerRef.current = instance;
          const markersPlugin = instance.getPlugin(MarkersPlugin);
          markersPluginRef.current = markersPlugin;

          if (markersPlugin) {
            markersPlugin.addEventListener("select-marker", (e: any) => {
              if (isEditModeRef.current) return;
              const targetSceneId =
                e.marker?.data?.targetSceneId ??
                e.marker?.config?.data?.targetSceneId;
              if (targetSceneId) {
                handleHotspotClickRef.current(targetSceneId);
              }
            });
          }

          instance.addEventListener("click", ({ data }: any) => {
            if (!isEditModeRef.current) return;
            const pitchDeg = data.pitch * (180 / Math.PI);
            const yawDeg = data.yaw * (180 / Math.PI);
            setModalData({ pitch: pitchDeg, yaw: yawDeg });
          });

          if (urlSceneId !== uiSceneId && !isTransitioningRef.current) {
            const targetScene = tourData.find((s) => s.id === urlSceneId);
            if (targetScene) performTransition(targetScene);
          }
        }}
      />

      <div className="absolute top-6 left-6 z-50 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/10 shadow-2xl pointer-events-none">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-400">
          <span className="text-white font-bold text-xs">360</span>
        </div>
        <div>
          <h3 className="text-white font-bold text-sm tracking-wide">
            {uiScene.title}
          </h3>
          <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">
            Select nodes to navigate
          </p>
        </div>
      </div>
    </div>
  );
};
