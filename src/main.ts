import "./style.css";
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import mlcontour from "maplibre-contour-formlines";
import { registerRoadSurfaceProtocol } from "optbv-roadpolylgon";

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

const roadProtocol = registerRoadSurfaceProtocol(maplibregl, {
  pmtilesUrl:
    "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles",
  includeArtifacts: false,
  onQualityWarning: ({ z, x, y }) => {
    console.warn(`[road-surface] quality warning ${z}/${x}/${y}`);
  },
});

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
        thresholds: { 11: [50, 200], 12: [20, 100], 13: [10, 50], 14: [5, 25] },
        formlines: true,
      }),
    ],
    minzoom: 11,
    maxzoom: 18,
    attribution:
      "<a href='https://tiles.gsj.jp/tiles/elev2/index.html' target='_blank'>産総研シームレス標高タイル</a>",
  });
  map.addSource("road-surface", {
    type: "vector",
    tiles: [roadProtocol.tiles],
    minzoom: 15,
    maxzoom: 16,
    attribution:
      "<a href='https://github.com/gsi-cyberjapan/optimal_bvmap' target='_blank'>国土地理院 最適化ベクトルタイル</a>",
  });
  map.addLayer({
    id: "road-surface-fill",
    type: "fill",
    source: "road-surface",
    "source-layer": "road-surface",
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

});

map.on("error", (event) => {
  console.error("Map data error", event.error);
});

window.addEventListener("beforeunload", () => roadProtocol.unregister());
