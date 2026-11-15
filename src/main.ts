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
    <aside class="map-tools" aria-label="地図ツール">
      <div class="tools-heading">
        <button id="tools-toggle" class="tools-toggle" type="button" aria-expanded="true" aria-controls="tools-content" aria-label="パネルを折り畳む" title="パネルを折り畳む">
          <span aria-hidden="true">−</span>
        </button>
      </div>
      <div class="tools-content" id="tools-content">
      <div class="generation-status" id="generation-status" role="status" aria-live="polite">
        <span class="status-dot"></span>
        <span id="generation-message">ズーム15以上で道路域を生成します</span>
      </div>
      <label class="interval-control" for="contour-interval">
        <span>等高線間隔</span>
        <select id="contour-interval">
          <option value="1">1 m</option>
          <option value="2">2 m</option>
          <option value="2.5">2.5 m</option>
          <option value="5" selected>5 m</option>
        </select>
      </label>
      <div class="download-heading">レイヤごとに保存 <span>GeoJSON</span></div>
      <div class="download-list">
        <button type="button" data-export="contours">等高線（主曲線）を保存</button>
        <button type="button" data-export="index-contours">等高線（計曲線）を保存</button>
        <button type="button" data-export="formlines">等高線（補助曲線）を保存</button>
        <button type="button" data-export="paved-area">道路域を保存</button>
        <button type="button" data-export="road-edges">道路縁を保存</button>
      </div>
      </div>
    </aside>
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
  center: [138.3822, 35.8782],
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

const generationMessage = document.querySelector<HTMLElement>(
  "#generation-message"
)!;
const generationStatus =
  document.querySelector<HTMLElement>("#generation-status")!;
const toolsPanel = document.querySelector<HTMLElement>(".map-tools")!;
const toolsToggle = document.querySelector<HTMLButtonElement>("#tools-toggle")!;
const intervalSelect =
  document.querySelector<HTMLSelectElement>("#contour-interval")!;
let contourInterval = Number(intervalSelect.value);
let mapLoaded = false;

toolsToggle.addEventListener("click", () => {
  const expanded = toolsToggle.getAttribute("aria-expanded") === "true";
  toolsToggle.setAttribute("aria-expanded", String(!expanded));
  toolsToggle.setAttribute(
    "aria-label",
    expanded ? "パネルを展開" : "パネルを折り畳む"
  );
  toolsToggle.title = expanded ? "パネルを展開" : "パネルを折り畳む";
  toolsToggle.querySelector("span")!.textContent = expanded ? "+" : "−";
  toolsPanel.classList.toggle("is-collapsed", expanded);
});

function setGenerationStatus(
  message: string,
  kind: "normal" | "error" | "working" = "normal"
): void {
  generationMessage.textContent = `${message}（現在 ${map.getZoom().toFixed(1)}）`;
  generationStatus.dataset.state = kind;
}

function addContourLayers(): void {
  if (map.getLayer("form-lines")) map.removeLayer("form-lines");
  if (map.getLayer("contour-lines")) map.removeLayer("contour-lines");
  if (map.getSource("contours")) map.removeSource("contours");

  map.addSource("contours", {
    type: "vector",
    tiles: [
      demSource.contourProtocolUrl({
        thresholds: { 15: [contourInterval, contourInterval * 5] },
        formlines: true,
      }),
    ],
    minzoom: 15,
    maxzoom: 18,
    attribution:
      "<a href='https://tiles.gsj.jp/tiles/elev2/index.html#h_mixed' target='_blank'>産総研シームレス標高タイル 統合DEM</a>",
  });
  map.addLayer(
    {
      id: "contour-lines",
      type: "line",
      source: "contours",
      "source-layer": "contours",
      paint: {
        "line-color": "#BE7A54",
        "line-width": ["match", ["get", "level"], 1, 1.7, 1],
      },
    },
    "road-edge-lines"
  );
  map.addLayer(
    {
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
    },
    "road-edge-lines"
  );
}

intervalSelect.addEventListener("change", () => {
  contourInterval = Number(intervalSelect.value);
  if (!mapLoaded) return;
  addContourLayers();
  setGenerationStatus(`等高線間隔を ${contourInterval} m に変更しました`);
});

map.on("load", () => {
  map.addSource("paved-area", {
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
    id: "paved-area-fill",
    type: "fill",
    source: "paved-area",
    paint: {
      "fill-color": "#F0C8B0",
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

  mapLoaded = true;
  addContourLayers();
  scheduleRoadSurfaceGeneration();
});

let roadWorker: Worker | null = null;
let generationTimer: ReturnType<typeof setTimeout> | null = null;
let generationId = 0;

function scheduleRoadSurfaceGeneration(): void {
  if (generationTimer) clearTimeout(generationTimer);
  generationId++;
  if (map.getZoom() < 15) {
    generationId++;
    roadWorker?.terminate();
    roadWorker = null;
    const source = map.getSource("paved-area") as
      maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
    const edges = map.getSource("road-edges") as
      maplibregl.GeoJSONSource | undefined;
    edges?.setData({ type: "FeatureCollection", features: [] });
    setGenerationStatus("道路域はズーム15以上で表示します");
    return;
  }

  setGenerationStatus("道路域を生成する準備中…", "working");
  generationTimer = setTimeout(() => {
    generationTimer = null;
    generateRoadSurfaceForView();
  }, 350);
}

function generateRoadSurfaceForView(): void {
  const source = map.getSource("paved-area") as
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
    // The optimized basemap's source features are stored at z16 even when
    // the display zoom is 15. Keep fetch zoom independent from map zoom.
    zoom: 16,
    includeArtifacts: false,
    includeInputEdges: true,
  };

  roadWorker?.terminate();
  const requestId = ++generationId;
  setGenerationStatus("道路域を生成しています…", "working");
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
      console.error("Paved area generation failed", event.data.error);
      setGenerationStatus(
        `道路域の生成に失敗しました: ${event.data.error}`,
        "error"
      );
    } else if (event.data.result) {
      source.setData(event.data.result);
      const edges = map.getSource("road-edges") as
        maplibregl.GeoJSONSource | undefined;
      const edgeData = event.data.result.artifacts["input-rd-edg"];
      edges?.setData(edgeData);
      const surfaceCount = event.data.result.features.length;
      const inputEdgeCount = event.data.result.meta.edgeCount;
      const returnedEdgeCount = edgeData.features.length;
      const problems: string[] = [];
      if (inputEdgeCount === 0) {
        problems.push("道路縁の入力が0本のため、道路域を生成できませんでした");
      } else if (surfaceCount === 0) {
        problems.push(
          `道路縁 ${inputEdgeCount} 本が入力されましたが、道路域を生成できませんでした`
        );
      }
      if (inputEdgeCount > 0 && returnedEdgeCount === 0) {
        problems.push("道路生成ライブラリから道路縁が返されませんでした");
      } else if (returnedEdgeCount > 0 && returnedEdgeCount < inputEdgeCount) {
        problems.push(
          "道路生成ライブラリから返された道路縁が一部不足しています"
        );
      }
      if (!event.data.result.meta.ok) problems.push("品質に疑いあり");
      const hasProblem = problems.length > 0;
      setGenerationStatus(
        hasProblem
          ? `道路域 ${surfaceCount} 件（${problems.join("。")}）`
          : `道路域 ${surfaceCount} 件を表示中`,
        hasProblem ? "error" : "normal"
      );
    }
    worker.terminate();
    if (roadWorker === worker) roadWorker = null;
  };
  worker.onerror = (event) => {
    console.error("Paved area generation worker failed", event.message);
    setGenerationStatus(
      `道路域の生成 Worker に失敗しました: ${event.message}`,
      "error"
    );
    worker.terminate();
    if (roadWorker === worker) roadWorker = null;
  };
  worker.postMessage({ id: requestId, options });
}

map.on("moveend", scheduleRoadSurfaceGeneration);

map.on("error", (event) => {
  console.error("Map data error", event.error);
  setGenerationStatus(
    `地図データの読み込みに失敗しました: ${event.error.message}`,
    "error"
  );
});

type ExportKind =
  "contours" | "index-contours" | "formlines" | "paved-area" | "road-edges";

const exportSources: Record<
  ExportKind,
  { source: string; sourceLayer?: string; filename: string }
> = {
  contours: {
    source: "contours",
    sourceLayer: "contours",
    filename: "contours.geojson",
  },
  "index-contours": {
    source: "contours",
    sourceLayer: "contours",
    filename: "index-contours.geojson",
  },
  formlines: {
    source: "contours",
    sourceLayer: "formlines",
    filename: "form-lines.geojson",
  },
  "paved-area": {
    source: "paved-area",
    filename: "paved-area.geojson",
  },
  "road-edges": {
    source: "road-edges",
    filename: "paved-area-bounding-line.geojson",
  },
};

function collectSourceFeatures(sourceId: string, sourceLayer?: string) {
  const queried = map.querySourceFeatures(
    sourceId,
    sourceLayer ? { sourceLayer } : {}
  );
  const seen = new Set<string>();
  return queried
    .map((feature) => feature.toJSON())
    .filter((feature) => {
      const key = JSON.stringify([feature.geometry, feature.properties]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function downloadLayer(kind: ExportKind): void {
  const spec = exportSources[kind];
  if (!map.getSource(spec.source)) {
    setGenerationStatus("地図データの準備が完了してから保存してください");
    return;
  }
  let features = collectSourceFeatures(spec.source, spec.sourceLayer);
  if (kind === "index-contours") {
    features = features.filter(
      (feature) => Number(feature.properties?.level) >= 1
    );
  }
  if (features.length === 0) {
    setGenerationStatus("このレイヤには保存できるデータがありません");
    return;
  }

  const blob = new Blob(
    [JSON.stringify({ type: "FeatureCollection", features }, null, 2)],
    { type: "application/geo+json" }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = spec.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setGenerationStatus(
    `${spec.filename} を保存しました（${features.length} 件）`
  );
}

document
  .querySelectorAll<HTMLButtonElement>("button[data-export]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      downloadLayer(button.dataset.export as ExportKind);
    });
  });

window.addEventListener("beforeunload", () => {
  if (generationTimer) clearTimeout(generationTimer);
  roadWorker?.terminate();
});
