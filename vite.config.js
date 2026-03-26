import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import fs from "fs";
import path from "path";

function saveHotspotPlugin() {
  return {
    name: "save-hotspot-plugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/api/save-hotspot" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              const { sceneId, hotspot } = data;
              const jsonPath = path.resolve(
                __dirname,
                "src/components/tourData.json",
              );
              const tourData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

              const scene = tourData.find((s) => s.id === sceneId);
              if (scene) {
                scene.hotspots = scene.hotspots || [];
                scene.hotspots.push(hotspot);
                fs.writeFileSync(
                  jsonPath,
                  JSON.stringify(tourData, null, 2),
                  "utf8",
                );
                res.setHeader("Content-Type", "application/json");
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              } else {
                res.setHeader("Content-Type", "application/json");
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "Scene not found" }));
              }
            } catch (e) {
              res.setHeader("Content-Type", "application/json");
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    ViteImageOptimizer({
      jpg: {
        quality: 60,
      },
      png: {
        quality: 60,
      },
      webp: {
        quality: 60,
      },
      avif: {
        quality: 80,
      },
    }),
    saveHotspotPlugin(),
  ],
});
