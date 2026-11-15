import "./style.css";
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import mlcontour from "maplibre-contour-formlines";
import type { RoadSurfaceOptions, RoadSurfaceResult } from "optbv-roadpolylgon";

setWorkerUrl(workerUrl);

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="map-shell">
    <div id="map" aria-label=""></div>
    <div class="map-caption"><span class="caption-line"></span><span></span><span class="caption-sub"></span></div>
  </main>
`;

const demSource = new mlcontour.DemSource({
  url: "https://gbank.gsj.jp/seamless/elev2/mixed/{z}/{x}/{y}.webp",
  encoding: "gsi",
  maxzoom: 18,
  id: "terrain",
});
demSource.setupMaplibre(maplibregl);

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: [138.73, 35.246],
  zoom: 15,
  minZoom: 5,
  maxZoom: 18,
  maxBounds: [
    [122, 20],
    [154.2, 46],
  ],
  hash: true,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));

map.on("load", () => {
  map.addSource("contours", {
    type: "vector",
    tiles: [
      demSource.contourProtocolUrl({
        thresholds: { 15: [5, 25] },
        formlines: true,
      }),
    ],
    minzoom: 15,
    maxzoom: 18,
    attribution:
      "<a href='https://tiles.gsj.jp/tiles/elev2/index.html' target='_blank'>産総研シームレス標高タイル</a>",
  });
  map.addSource("road-surface", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution:
      "<a href='https://github.com/gsi-cyberjapan/optimal_bvmap' target='_blank'>国土地理院 最適化ベクトルタイル</a>",
  });
  map.addSource("road-edges", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "road-surface-fill",
    type: "fill",
    source: "road-surface",
    paint: {
      "fill-color": "#F0C8B0",
    },
  });
  map.addLayer({
    id: "contour-lines",
    type: "line",
    source: "contours",
    "source-layer": "contours",
    paint: {
      "line-color": "#BE7A54",
      "line-width": ["match", ["get", "level"], 1, 1.7, 1],
    },
  });
  map.addLayer({
    id: "form-lines",
    type: "line",
    source: "contours",
    "source-layer": "formlines",
    layout: { "line-cap": "butt" },
    paint: {
      "line-color": "#BE7A54",
      "line-width": 0.7,
      "line-dasharray": [10, 2],
    },
  });
  map.addLayer({
    id: "road-edge-lines",
    type: "line",
    source: "road-edges",
    paint: {
      "line-color": "#000000",
      "line-width": 0.5,
    },
  });

  scheduleRoadSurfaceGeneration();
});

let roadWorker: Worker | null = null;
let generationTimer: ReturnType<typeof setTimeout> | null = null;
let generationId = 0;

function scheduleRoadSurfaceGeneration(): void {
  if (generationTimer) clearTimeout(generationTimer);
  if (map.getZoom() < 15) {
    generationId++;
    roadWorker?.terminate();
    roadWorker = null;
    const source = map.getSource("road-surface") as
      maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
    const edges = map.getSource("road-edges") as
      maplibregl.GeoJSONSource | undefined;
    edges?.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  generationTimer = setTimeout(() => {
    generationTimer = null;
    generateRoadSurfaceForView();
  }, 350);
}

function generateRoadSurfaceForView(): void {
  const source = map.getSource("road-surface") as
    maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  const bounds = map.getBounds();
  const clipToBbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ] as const;
  const padX = (clipToBbox[2] - clipToBbox[0]) * 0.05;
  const padY = (clipToBbox[3] - clipToBbox[1]) * 0.05;
  const options: RoadSurfaceOptions = {
    bbox: [
      clipToBbox[0] - padX,
      clipToBbox[1] - padY,
      clipToBbox[2] + padX,
      clipToBbox[3] + padY,
    ],
    clipToBbox: [...clipToBbox],
    pmtilesUrl:
      "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles",
    zoom: Math.min(16, Math.floor(map.getZoom())),
    includeArtifacts: false,
    includeInputEdges: true,
  };

  roadWorker?.terminate();
  const requestId = ++generationId;
  const worker = new Worker(
    new URL("./road-surface.worker.ts", import.meta.url),
    { type: "module" }
  );
  roadWorker = worker;
  worker.onmessage = (
    event: MessageEvent<{
      id: number;
      result?: RoadSurfaceResult;
      error?: string;
    }>
  ) => {
    if (event.data.id !== generationId) return;
    if (event.data.error) {
      console.error("Road surface generation failed", event.data.error);
    } else if (event.data.result) {
      source.setData(event.data.result);
      const edges = map.getSource("road-edges") as
        maplibregl.GeoJSONSource | undefined;
      edges?.setData(event.data.result.artifacts["input-rd-edg"]);
    }
    worker.terminate();
    if (roadWorker === worker) roadWorker = null;
  };
  worker.onerror = (event) => {
    console.error("Road surface generation worker failed", event.message);
    worker.terminate();
    if (roadWorker === worker) roadWorker = null;
  };
  worker.postMessage({ id: requestId, options });
}

map.on("moveend", scheduleRoadSurfaceGeneration);

map.on("error", (event) => {
  console.error("Map data error", event.error);
});

window.addEventListener("beforeunload", () => {
  if (generationTimer) clearTimeout(generationTimer);
  roadWorker?.terminate();
});
