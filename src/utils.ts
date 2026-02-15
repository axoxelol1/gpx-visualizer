import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export function setupMap() {
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/fiord",
    center: [-80.19, 25.775],
    zoom: 14,
    pitch: 30,
    bearing: -15,
  });

  map.on("load", async () => {
    map.getStyle().layers.forEach((layer) => {
      if (layer.type === "symbol") map.removeLayer(layer.id);
    });
  });
  return map;
}

export type Run = {
  points: { lat: number; lon: number; time: Date; millisecond: number }[];
};

export function parseGpx(gpx: string): Run {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpx, "application/xml");
  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    throw new Error("Invalid XML format");
  }
  const trkpts = xmlDoc.getElementsByTagName("trkpt");
  if (trkpts.length === 0) {
    throw new Error("No track points found in GPX file");
  }
  const run: Run = { points: [] };

  let firstTime: Date | null = null;
  for (let i = 0; i < trkpts.length; i++) {
    const trkpt = trkpts[i];
    const lat = parseFloat(trkpt.getAttribute("lat") || "0");
    const lon = parseFloat(trkpt.getAttribute("lon") || "0");
    const timeElement = trkpt.getElementsByTagName("time")[0];
    if (!timeElement || !timeElement.textContent) {
      throw new Error("Missing time element in trkpt");
    }
    const time = new Date(timeElement.textContent);
    if (isNaN(lat) || isNaN(lon) || isNaN(time.getTime())) {
      throw new Error("Invalid lat, lon, or time in trkpt");
    }
    if (firstTime == null) {
      firstTime = time;
    }
    run.points.push({
      lat,
      lon,
      time,
      millisecond: time.getTime() - firstTime.getTime(),
    });
  }

  return run;
}

function getPositionAndIndex(run: Run, currentTime: number) {
  const points = run.points;
  const nextPointIndex = points.findIndex((p) => p.millisecond > currentTime);

  if (nextPointIndex === 0) {
    return {
      coords: [points[0].lon, points[0].lat],
      index: 0,
    };
  }

  if (nextPointIndex === -1) {
    const last = points[points.length - 1];
    return {
      coords: [last.lon, last.lat],
      index: points.length - 1,
    };
  }

  const prevPoint = points[nextPointIndex - 1];
  const nextPoint = points[nextPointIndex];
  const segmentDuration = nextPoint.millisecond - prevPoint.millisecond;
  const progress = (currentTime - prevPoint.millisecond) / segmentDuration;

  const lon = prevPoint.lon + (nextPoint.lon - prevPoint.lon) * progress;
  const lat = prevPoint.lat + (nextPoint.lat - prevPoint.lat) * progress;

  return {
    coords: [lon, lat],
    index: nextPointIndex - 1,
  };
}

let animationId: number | null = null;
let startTime: number = 0;

export function mapRuns(
  map: maplibregl.Map,
  runs: Run[],
  speedMultiplier: number,
) {
  const sourceIds = ["runners-history", "runners-head"];

  sourceIds.forEach((id) => {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
  });

  if (!map.getLayer("trail-history")) {
    map.addLayer({
      id: "trail-history",
      type: "line",
      source: "runners-history",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#ff3333",
        "line-width": 3,
        "line-opacity": 0.8,
      },
    });
  }

  if (!map.getLayer("runner-head")) {
    map.addLayer({
      id: "runner-head",
      type: "circle",
      source: "runners-head",
      paint: {
        "circle-radius": 4,
        "circle-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ff3333",
      },
    });
  }

  if (animationId) cancelAnimationFrame(animationId);
  startTime = performance.now();

  function animate() {
    const elapsed = (performance.now() - startTime) * speedMultiplier;

    const historyFeatures: GeoJSON.Feature[] = [];
    const headFeatures: GeoJSON.Feature[] = [];

    runs.forEach((run, index) => {
      const { coords, index: lastIdx } = getPositionAndIndex(run, elapsed);

      const historyCoords = run.points
        .slice(0, lastIdx + 1)
        .map((p) => [p.lon, p.lat]);
      historyCoords.push(coords);

      historyFeatures.push({
        type: "Feature",
        properties: { id: index },
        geometry: {
          type: "LineString",
          coordinates: historyCoords,
        },
      });

      headFeatures.push({
        type: "Feature",
        properties: { id: index },
        geometry: {
          type: "Point",
          coordinates: coords,
        },
      });
    });

    (map.getSource("runners-history") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: historyFeatures,
    });

    (map.getSource("runners-head") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: headFeatures,
    });

    const maxDuration = Math.max(
      ...runs.map((r) => r.points[r.points.length - 1].millisecond),
    );
    if (elapsed > maxDuration + 2000) {
      startTime = performance.now();
    }

    animationId = requestAnimationFrame(animate);
  }

  animate();
}
