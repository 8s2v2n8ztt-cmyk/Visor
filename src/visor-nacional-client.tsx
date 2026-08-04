"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import systemsPart1 from "./data/ssr-oficiales-1.json";
import systemsPart2 from "./data/ssr-oficiales-2.json";
import systemsPart3 from "./data/ssr-oficiales-3.json";
import systemsPart4 from "./data/ssr-oficiales-4.json";
import areaServiceIds from "./data/area-service-ids.json";

type Location = { lat: number; lng: number };
type System = {
  id: string;
  name: string;
  region: string;
  province: string;
  commune: string;
  year: number | null;
  connections: number;
  beneficiaries: number;
  classification: string;
  pointType: string;
  settlementType: string;
  technicalCondition: string;
  generator: string;
  telemetry: string;
  utm: { east: number | null; north: number | null; zone: number | null };
  originalZone: number | null;
  location: Location | null;
  coordinateStatus: "VALIDADA_PARA_VISOR" | "AJUSTE_HUSO" | "REVISAR";
  sourceRow: number | null;
};
type AreaFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: string }
>;
type AreaCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: string }
>;
type AreaBounds = { id: string; b: [number, number, number, number] };
type UserLocation = { lat: number; lng: number; accuracy: number };
type LocationResult = { status: "inside" | "outside"; ids: string[] };

const systems = [
  ...systemsPart1,
  ...systemsPart2,
  ...systemsPart3,
  ...systemsPart4,
] as System[];
const systemsById = new Map(systems.map((item) => [item.id, item]));
const areaServiceIdSet = new Set(areaServiceIds as string[]);
const numberFormatter = new Intl.NumberFormat("es-CL");
const textKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const escapeHtml = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const regionPalette = [
  "#0f766e",
  "#0369a1",
  "#1d4ed8",
  "#4338ca",
  "#6d28d9",
  "#a21caf",
  "#be123c",
  "#c2410c",
  "#b45309",
  "#4d7c0f",
  "#15803d",
  "#047857",
  "#0e7490",
  "#475569",
  "#334155",
  "#115e59",
];

const regionOrder = [
  "ARICA Y PARINACOTA",
  "TARAPACÁ",
  "ANTOFAGASTA",
  "ATACAMA",
  "COQUIMBO",
  "VALPARAÍSO",
  "METROPOLITANA",
  "O'HIGGINS",
  "MAULE",
  "ÑUBLE",
  "BIOBÍO",
  "ARAUCANÍA",
  "LOS RÍOS",
  "LOS LAGOS",
  "AYSÉN",
  "MAGALLANES",
];
const areaFileByRegion: Record<string, string> = {
  "ARICA Y PARINACOTA": "arica-y-parinacota.geojson",
  TARAPACÁ: "tarapaca.geojson",
  ANTOFAGASTA: "antofagasta.geojson",
  ATACAMA: "atacama.geojson",
  COQUIMBO: "coquimbo.geojson",
  VALPARAÍSO: "valparaiso.geojson",
  METROPOLITANA: "metropolitana.geojson",
  "O'HIGGINS": "ohiggins.geojson",
  MAULE: "maule.geojson",
  ÑUBLE: "nuble.geojson",
  BIOBÍO: "biobio.geojson",
  ARAUCANÍA: "araucania.geojson",
  "LOS RÍOS": "los-rios.geojson",
  "LOS LAGOS": "los-lagos.geojson",
  AYSÉN: "aysen.geojson",
  MAGALLANES: "magallanes.geojson",
};

function pointInRing(lng: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLng, currentLat] = ring[index];
    const [previousLng, previousLat] = ring[previous];
    const cross =
      (lat - previousLat) * (currentLng - previousLng) -
      (lng - previousLng) * (currentLat - previousLat);
    const onSegment =
      Math.abs(cross) < 1e-10 &&
      lng >= Math.min(previousLng, currentLng) &&
      lng <= Math.max(previousLng, currentLng) &&
      lat >= Math.min(previousLat, currentLat) &&
      lat <= Math.max(previousLat, currentLat);
    if (onSegment) return true;
    const intersects =
      currentLat > lat !== previousLat > lat &&
      lng <
        ((previousLng - currentLng) * (lat - currentLat)) /
          (previousLat - currentLat) +
          currentLng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: number[][][]) {
  if (!polygon.length || !pointInRing(lng, lat, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

function areaContainsPoint(feature: AreaFeature, lng: number, lat: number) {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    return pointInPolygon(lng, lat, geometry.coordinates);
  }
  return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
}

function Icon({ name }: { name: "search" | "pin" | "close" | "external" }) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s7-6.2 7-12A7 7 0 0 0 5 9c0 5.8 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    external: <path d="M14 5h5v5M19 5l-8 8M17 12v6H6V7h6" />,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export default function VisorNacionalClient() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [commune, setCommune] = useState("");
  const [viewMode, setViewMode] = useState<"map" | "summary">("map");
  const [summarySort, setSummarySort] = useState<"name" | "connections">("name");
  const [summaryPage, setSummaryPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [areasLoading, setAreasLoading] = useState(false);
  const [areasError, setAreasError] = useState(false);
  const [areasRevision, setAreasRevision] = useState(0);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const deferredQuery = useDeferredValue(query);
  const mapHost = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const areaLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const locationLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const areaCacheRef = useRef(new Map<string, AreaCollection>());
  const boundsCacheRef = useRef<AreaBounds[] | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const regions = useMemo(
    () => {
      const availableRegions = new Set(systems.map((item) => item.region));
      return [
        ...regionOrder.filter((item) => availableRegions.has(item)),
        ...[...availableRegions]
          .filter((item) => !regionOrder.includes(item))
          .sort(),
      ];
    },
    [],
  );
  const provinces = useMemo(
    () =>
      [
        ...new Set(
          systems
            .filter((item) => !region || item.region === region)
            .map((item) => item.province),
        ),
      ].sort(),
    [region],
  );
  const communes = useMemo(
    () =>
      [
        ...new Set(
          systems
            .filter(
              (item) =>
                (!region || item.region === region) &&
                (!province || item.province === province),
            )
            .map((item) => item.commune),
        ),
      ].sort(),
    [region, province],
  );

  const filtered = useMemo(() => {
    const search = textKey(deferredQuery.trim());
    return systems.filter((item) => {
      if (region && item.region !== region) return false;
      if (province && item.province !== province) return false;
      if (commune && item.commune !== commune) return false;
      if (
        search &&
        !textKey(
          `${item.name} ${item.id} ${item.region} ${item.province} ${item.commune}`,
        ).includes(search)
      )
        return false;
      return true;
    });
  }, [commune, deferredQuery, province, region]);
  const sortedSummary = useMemo(
    () =>
      [...filtered].sort((left, right) => {
        if (summarySort === "connections") {
          return right.connections - left.connections || left.name.localeCompare(right.name, "es");
        }
        return left.name.localeCompare(right.name, "es");
      }),
    [filtered, summarySort],
  );
  const summaryPageSize = 20;
  const summaryPageCount = Math.max(1, Math.ceil(sortedSummary.length / summaryPageSize));
  const summaryPageItems = useMemo(
    () =>
      sortedSummary.slice(
        (summaryPage - 1) * summaryPageSize,
        summaryPage * summaryPageSize,
      ),
    [sortedSummary, summaryPage],
  );

  const mapped = useMemo(
    () => filtered.filter((item): item is System & { location: Location } => !!item.location),
    [filtered],
  );
  const suggestions = useMemo(
    () => query.trim().length >= 2 ? filtered.slice(0, 8) : [],
    [filtered, query],
  );
  const selected = systemsById.get(selectedId);
  const selectedHasArea = !!selected && areaServiceIdSet.has(selected.id);
  const visibleAreaCount = useMemo(
    () => filtered.reduce((count, item) => count + Number(areaServiceIdSet.has(item.id)), 0),
    [filtered],
  );
  const requiredAreaRegions = useMemo(() => {
    const names = new Set<string>();
    if (showAreas) filtered.forEach((item) => names.add(item.region));
    if (selectedHasArea && selected) names.add(selected.region);
    locationResult?.ids.forEach((id) => {
      const system = systemsById.get(id);
      if (system) names.add(system.region);
    });
    return [...names];
  }, [filtered, locationResult, selected, selectedHasArea, showAreas]);
  const requiredAreaKey = requiredAreaRegions.join("|");
  const visibleConnections = useMemo(
    () => filtered.reduce((sum, item) => sum + item.connections, 0),
    [filtered],
  );
  const visibleBeneficiaries = useMemo(
    () => filtered.reduce((sum, item) => sum + item.beneficiaries, 0),
    [filtered],
  );
  const visibleRegions = useMemo(
    () => new Set(filtered.map((item) => item.region)).size,
    [filtered],
  );
  const territoryLabel = commune || province || region || "Chile";
  const colorByRegion = useMemo(
    () =>
      new Map(
        regions.map((regionName, index) => [
          regionName,
          regionPalette[index % regionPalette.length],
        ]),
      ),
    [regions],
  );

  useEffect(() => {
    if (selectedId && !filtered.some((item) => item.id === selectedId)) {
      setSelectedId("");
      setDetailOpen(false);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    setSummaryPage(1);
  }, [commune, province, query, region, summarySort]);

  useEffect(() => {
    if (!detailOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailOpen]);

  useEffect(() => {
    let cancelled = false;
    async function startMap() {
      if (!mapHost.current || mapRef.current) return;
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapHost.current) return;
      leafletRef.current = L;
      const map = L.map(mapHost.current, {
        center: [-36.4, -71.3],
        zoom: 4,
        minZoom: 3,
        preferCanvas: true,
        zoomControl: false,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);
      areaLayerRef.current = L.layerGroup().addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      locationLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    }
    void startMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      areaLayerRef.current = null;
      layerRef.current = null;
      locationLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !requiredAreaKey) return;
    const missing = requiredAreaRegions.filter(
      (regionName) => !areaCacheRef.current.has(regionName),
    );
    if (!missing.length) return;

    let cancelled = false;
    setAreasLoading(true);
    setAreasError(false);
    void Promise.all(
      missing.map(async (regionName) => {
        const file = areaFileByRegion[regionName];
        if (!file) throw new Error(`No existe archivo para ${regionName}`);
        const response = await fetch(
          `${import.meta.env.BASE_URL}data/areas-servicio/${file}`,
        );
        if (!response.ok) throw new Error(`No fue posible cargar ${file}`);
        return [regionName, (await response.json()) as AreaCollection] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        entries.forEach(([regionName, collection]) => {
          areaCacheRef.current.set(regionName, collection);
        });
        setAreasRevision((value) => value + 1);
      })
      .catch(() => {
        if (!cancelled) setAreasError(true);
      })
      .finally(() => {
        if (!cancelled) setAreasLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady, requiredAreaKey]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer || !mapReady || viewMode !== "map") return;

    map.invalidateSize();
    layer.clearLayers();
    const renderer = L.canvas({ padding: 0.35 });
    const bounds: [number, number][] = [];
    mapped.forEach((item) => {
      const active = item.id === selectedId;
      const baseColor = colorByRegion.get(item.region) ?? "#0369a1";
      const areaAvailable = areaServiceIdSet.has(item.id);
      const marker = L.circleMarker([item.location.lat, item.location.lng], {
        renderer,
        radius: active ? 8 : 5,
        color: active ? "#ffffff" : baseColor,
        weight: active ? 3 : 1.4,
        fillColor: baseColor,
        fillOpacity: active ? 1 : 0.78,
      });
      marker.bindTooltip(
        `<article class="ssr-tooltip-card">
          <div class="ssr-tooltip-accent" style="background:${baseColor}"></div>
          <div class="ssr-tooltip-heading">
            <span>${escapeHtml(item.id)}</span>
            <strong>${escapeHtml(item.name)}</strong>
          </div>
          <p>${escapeHtml(item.commune)} · ${escapeHtml(item.region)}</p>
          <div class="ssr-tooltip-metrics">
            <div><b>${numberFormatter.format(item.connections)}</b><small>Arranques</small></div>
            <div><b>${numberFormatter.format(item.beneficiaries)}</b><small>Beneficiarios</small></div>
          </div>
          <div class="ssr-tooltip-footer ${areaAvailable ? "available" : "unavailable"}">
            <span></span>
            ${areaAvailable ? "Área de servicio disponible" : "Sin área de servicio disponible"}
          </div>
          <em>Haz clic para consultar la ficha</em>
        </article>`,
        {
          className: "ssr-map-tooltip",
          direction: "top",
          offset: [0, -10],
          opacity: 1,
        },
      );
      marker.on("mouseover focus", () => {
        marker.setStyle({
          radius: active ? 9 : 8,
          color: "#ffffff",
          weight: 3,
          fillOpacity: 1,
        });
        marker.bringToFront();
      });
      marker.on("mouseout blur", () => {
        marker.setStyle({
          radius: active ? 8 : 5,
          color: active ? "#ffffff" : baseColor,
          weight: active ? 3 : 1.4,
          fillOpacity: active ? 1 : 0.78,
        });
      });
      marker.on("click", () => {
        setSelectedId(item.id);
      });
      marker.addTo(layer);
      bounds.push([item.location.lat, item.location.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 11);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
    }
  }, [colorByRegion, mapReady, mapped, selectedId, viewMode]);

  useEffect(() => {
    const L = leafletRef.current;
    const areaLayer = areaLayerRef.current;
    if (!L || !areaLayer || !mapReady) return;

    areaLayer.clearLayers();
    const visibleIds = new Set<string>();
    if (showAreas) {
      filtered
        .filter((item) => areaServiceIdSet.has(item.id))
        .forEach((item) => visibleIds.add(item.id));
    }
    if (selectedHasArea && selectedId) visibleIds.add(selectedId);
    locationResult?.ids.forEach((id) => visibleIds.add(id));
    if (!visibleIds.size) return;

    const renderer = L.canvas({ padding: 0.35 });
    requiredAreaRegions.forEach((regionName) => {
      const collection = areaCacheRef.current.get(regionName);
      if (!collection) return;
      L.geoJSON(collection, {
        renderer,
        filter: (feature) => visibleIds.has((feature as AreaFeature).properties.id),
        style: (feature) => {
          const id = (feature as AreaFeature).properties.id;
          const active = id === selectedId;
          const system = systemsById.get(id);
          const color = system ? colorByRegion.get(system.region) ?? "#0878b9" : "#0878b9";
          return {
            color: active ? "#075b8d" : color,
            weight: active ? 3 : 1.4,
            opacity: active ? 1 : 0.82,
            fillColor: color,
            fillOpacity: active ? 0.2 : 0.08,
          };
        },
        onEachFeature: (feature, layer) => {
          const id = (feature as AreaFeature).properties.id;
          const system = systemsById.get(id);
          if (system) {
            layer.bindTooltip(
              `<strong>Área de servicio</strong><br>${system.name}<br>${system.commune} · ${system.region}`,
              { sticky: true },
            );
          }
          layer.on("click", () => setSelectedId(id));
        },
      }).addTo(areaLayer);
    });
  }, [
    areasRevision,
    colorByRegion,
    filtered,
    mapReady,
    locationResult,
    requiredAreaKey,
    selectedHasArea,
    selectedId,
    showAreas,
  ]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const locationLayer = locationLayerRef.current;
    if (!L || !map || !locationLayer || !mapReady) return;

    locationLayer.clearLayers();
    if (!userLocation) return;
    L.circle([userLocation.lat, userLocation.lng], {
      radius: userLocation.accuracy,
      color: "#0878b9",
      weight: 1,
      opacity: 0.65,
      fillColor: "#32a8dd",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(locationLayer);
    L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 8,
      color: "#ffffff",
      weight: 3,
      fillColor: "#0878b9",
      fillOpacity: 1,
    })
      .bindTooltip(
        `<strong>Tu ubicación</strong><br>Precisión aproximada: ${numberFormatter.format(Math.round(userLocation.accuracy))} m`,
        { direction: "top", offset: [0, -8] },
      )
      .addTo(locationLayer);
    map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 15));
  }, [mapReady, userLocation]);

  async function loadAreaCollection(regionName: string) {
    const cached = areaCacheRef.current.get(regionName);
    if (cached) return cached;
    const file = areaFileByRegion[regionName];
    if (!file) throw new Error(`No existe archivo para ${regionName}`);
    const response = await fetch(
      `${import.meta.env.BASE_URL}data/areas-servicio/${file}`,
    );
    if (!response.ok) throw new Error(`No fue posible cargar ${file}`);
    const collection = (await response.json()) as AreaCollection;
    areaCacheRef.current.set(regionName, collection);
    return collection;
  }

  async function checkUserLocation(location: UserLocation) {
    setUserLocation(location);
    setLocationResult(null);
    setLocationError("");
    try {
      let bounds = boundsCacheRef.current;
      if (!bounds) {
        const response = await fetch(
          `${import.meta.env.BASE_URL}data/areas-servicio/bounds.json`,
        );
        if (!response.ok) throw new Error("No fue posible cargar el índice territorial");
        bounds = (await response.json()) as AreaBounds[];
        boundsCacheRef.current = bounds;
      }
      const margin = 0.00001;
      const candidateIds = bounds
        .filter(
          ({ b }) =>
            location.lng >= b[0] - margin &&
            location.lat >= b[1] - margin &&
            location.lng <= b[2] + margin &&
            location.lat <= b[3] + margin,
        )
        .map(({ id }) => id);
      if (!candidateIds.length) {
        setLocationResult({ status: "outside", ids: [] });
        return;
      }

      const candidateSet = new Set(candidateIds);
      const candidateRegions = [
        ...new Set(
          candidateIds
            .map((id) => systemsById.get(id)?.region)
            .filter((value): value is string => !!value),
        ),
      ];
      const collections = await Promise.all(
        candidateRegions.map((regionName) => loadAreaCollection(regionName)),
      );
      const insideIds = collections.flatMap((collection) =>
        collection.features
          .filter(
            (feature) =>
              candidateSet.has(feature.properties.id) &&
              areaContainsPoint(feature as AreaFeature, location.lng, location.lat),
          )
          .map((feature) => feature.properties.id),
      );
      setAreasRevision((value) => value + 1);
      setLocationResult({
        status: insideIds.length ? "inside" : "outside",
        ids: [...new Set(insideIds)],
      });
    } catch {
      setLocationError("No fue posible comprobar el área de servicio");
    } finally {
      setLocating(false);
    }
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationError("Este dispositivo no permite obtener la ubicación");
      return;
    }
    setLocating(true);
    setLocationError("");
    setLocationResult(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void checkUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "Debes autorizar el acceso a tu ubicación",
          2: "No fue posible determinar tu ubicación",
          3: "La ubicación tardó demasiado en responder",
        };
        setLocationError(messages[error.code] ?? "No fue posible obtener tu ubicación");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function clearFilters() {
    setQuery("");
    setRegion("");
    setProvince("");
    setCommune("");
    setSelectedId("");
    setSuggestionsOpen(false);
    setDetailOpen(false);
  }

  const hasFilters = !!(query || region || province || commune);

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="institutional-brand" href="#visor" aria-label="Inicio del visor nacional">
          <img
            src={`${import.meta.env.BASE_URL}color-mop-slogan.svg`}
            alt="Ministerio de Obras Públicas, Gobierno de Chile — Trabajando para usted"
          />
        </a>
        <nav aria-label="Navegación principal">
          <a className="active" href="#visor">
            Mapa
          </a>
          <a href="#resultados">Resumen</a>
          <a href="#metodologia">Metodología</a>
          <a href="#acerca">Acerca del visor</a>
        </nav>
        <span className="official-tag">Base oficial · junio 2026</span>
      </header>

      <main id="visor">
        <section className="hero" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Subdirección de Servicios Sanitarios Rurales</p>
            <h1 id="page-title">Visor Nacional de Sistemas Sanitarios Rurales</h1>
            <p className="hero-subtitle">Cobertura territorial de las 16 regiones de Chile</p>
          </div>
          <div className="hero-badge">
            <span className="badge-drop" aria-hidden="true" />
            <span>
              <strong>{numberFormatter.format(systems.length)}</strong>
              <small>SSR oficiales</small>
            </span>
          </div>
        </section>

        <section className="metrics" id="datos" aria-label="Indicadores">
          <article>
            <span className="metric-icon metric-blue" aria-hidden="true">◉</span>
            <div>
              <small>Sistemas visibles</small>
              <strong>{numberFormatter.format(filtered.length)}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon metric-teal" aria-hidden="true">↗</span>
            <div>
              <small>Arranques informados</small>
              <strong>{numberFormatter.format(visibleConnections)}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon metric-gold" aria-hidden="true">≈</span>
            <div>
              <small>Beneficiarios estimados</small>
              <strong>{numberFormatter.format(visibleBeneficiaries)}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon metric-slate" aria-hidden="true">◆</span>
            <div>
              <small>Regiones visibles</small>
              <strong>{visibleRegions}</strong>
            </div>
          </article>
        </section>

        <section className="filters-panel" aria-label="Filtros territoriales">
          <div className="search-wrap">
            <label htmlFor="system-search">Buscar sistema SSR</label>
            <div className="search-control">
              <Icon name="search" />
              <input
                id="system-search"
                type="search"
                placeholder="Nombre, comuna o código"
                autoComplete="off"
                value={query}
                aria-autocomplete="list"
                aria-controls="system-suggestions"
                aria-expanded={suggestionsOpen && suggestions.length > 0}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSuggestionsOpen(true);
                }}
              />
            </div>
            {suggestionsOpen && query.trim().length >= 2 && (
              <div className="search-suggestions" id="system-suggestions" role="listbox">
                {suggestions.length > 0 ? (
                  suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === selectedId}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQuery(item.name);
                        setSelectedId(item.id);
                        setSuggestionsOpen(false);
                        setDetailOpen(false);
                      }}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.commune} · {item.region}</small>
                      </span>
                      <b>{item.id}</b>
                    </button>
                  ))
                ) : (
                  <p>Sin coincidencias</p>
                )}
              </div>
            )}
          </div>
          <label>
            <span>Región</span>
            <select
              value={region}
              onChange={(event) => {
                setRegion(event.target.value);
                setProvince("");
                setCommune("");
              }}
            >
              <option value="">Todas</option>
              {regions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Provincia</span>
            <select
              value={province}
              onChange={(event) => {
                setProvince(event.target.value);
                setCommune("");
              }}
            >
              <option value="">Todas</option>
              {provinces.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Comuna</span>
            <select value={commune} onChange={(event) => setCommune(event.target.value)}>
              <option value="">Todas</option>
              {communes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button className="clear-button" type="button" disabled={!hasFilters} onClick={clearFilters}>
            Limpiar
          </button>
        </section>

        <section className="results-switcher" id="resultados" aria-label="Vista de resultados">
          <div>
            <p className="eyebrow">Resultados filtrados</p>
            <strong>{territoryLabel}</strong>
            <span>
              {numberFormatter.format(filtered.length)} sistemas ·{" "}
              {numberFormatter.format(visibleConnections)} arranques
            </span>
          </div>
          <div className="view-tabs" role="tablist" aria-label="Formato de visualización">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "map"}
              className={viewMode === "map" ? "active" : ""}
              onClick={() => setViewMode("map")}
            >
              <span aria-hidden="true">⌖</span>
              Mapa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "summary"}
              className={viewMode === "summary" ? "active" : ""}
              onClick={() => setViewMode("summary")}
            >
              <span aria-hidden="true">☷</span>
              Resumen y listado
            </button>
          </div>
        </section>

        <section
          className={`map-section ${viewMode === "map" ? "" : "results-view-hidden"}`}
          id="mapa"
          aria-label="Mapa nacional"
          aria-hidden={viewMode !== "map"}
        >
            <div className="map-canvas">
              <div ref={mapHost} className="leaflet-host" aria-label="Mapa nacional de SSR" />
              {!mapReady && (
                <div className="map-loading" role="status">
                  <span />
                  Preparando mapa nacional…
                </div>
              )}
            </div>
            <div className="map-status" aria-live="polite">
              <span />
              {numberFormatter.format(mapped.length)} sistemas en el mapa
              {filtered.length !== mapped.length && (
                <small>{numberFormatter.format(filtered.length - mapped.length)} con coordenadas en revisión</small>
              )}
            </div>
            <div className="map-layer-control">
              <button
                type="button"
                className={showAreas ? "active" : ""}
                aria-pressed={showAreas}
                onClick={() => setShowAreas((value) => !value)}
              >
                <span aria-hidden="true">▱</span>
                Áreas de servicio
                <strong>{numberFormatter.format(visibleAreaCount)}</strong>
              </button>
              <button
                type="button"
                className="location-button"
                disabled={locating}
                onClick={locateUser}
              >
                <span aria-hidden="true">⌖</span>
                {locating ? "Obteniendo ubicación…" : "Mi ubicación"}
              </button>
              {areasLoading && <small>Cargando áreas…</small>}
              {areasError && <small className="error">No fue posible cargar la capa</small>}
              {locationError && <small className="error">{locationError}</small>}
              {locationResult && (
                <div
                  className={`location-result ${locationResult.status}`}
                  role="status"
                >
                  <strong>
                    {locationResult.status === "inside"
                      ? "Estás dentro de un área de servicio"
                      : "Estás fuera de las áreas registradas"}
                  </strong>
                  {locationResult.ids.slice(0, 2).map((id) => (
                    <span key={id}>{systemsById.get(id)?.name}</span>
                  ))}
                  {locationResult.ids.length > 2 && (
                    <span>y {locationResult.ids.length - 2} áreas adicionales</span>
                  )}
                  {userLocation && (
                    <small>
                      Precisión GPS aproximada:{" "}
                      {numberFormatter.format(Math.round(userLocation.accuracy))} m
                    </small>
                  )}
                </div>
              )}
            </div>
            {selected && (
              <article className="selected-card" aria-live="polite">
                <button
                  type="button"
                  className="selected-card-close"
                  aria-label="Cerrar sistema seleccionado"
                  onClick={() => setSelectedId("")}
                >
                  <Icon name="close" />
                </button>
                <span className="selected-card-handle" aria-hidden="true" />
                <div className="selected-kicker"><span />Sistema seleccionado</div>
                <h2>{selected.name}</h2>
                <p className="selected-region">{selected.id} · {selected.commune} · {selected.region}</p>
                <p className={`area-chip ${selectedHasArea ? "available" : "unavailable"}`}>
                  {selectedHasArea ? "Área de servicio disponible" : "Área de servicio no disponible"}
                </p>
                <dl>
                  <div><dt>Comuna</dt><dd>{selected.commune}</dd></div>
                  <div><dt>Arranques</dt><dd>{numberFormatter.format(selected.connections)}</dd></div>
                  <div><dt>Referencia</dt><dd>{selected.pointType}</dd></div>
                </dl>
                <button type="button" className="primary-button" onClick={() => setDetailOpen(true)}>
                  <Icon name="pin" />Ver ficha
                </button>
              </article>
            )}
        </section>
        {viewMode === "summary" && (
          <section className="summary-section" aria-labelledby="summary-title">
            <header className="summary-heading">
              <div>
                <p className="eyebrow">Resumen territorial</p>
                <h2 id="summary-title">{territoryLabel}</h2>
                <p>
                  Sistemas que coinciden con los filtros seleccionados. Puedes revisar
                  la ficha o ubicarlos directamente en el mapa.
                </p>
              </div>
              <label>
                <span>Ordenar listado</span>
                <select
                  value={summarySort}
                  onChange={(event) =>
                    setSummarySort(event.target.value as "name" | "connections")
                  }
                >
                  <option value="name">Nombre del sistema</option>
                  <option value="connections">Mayor número de arranques</option>
                </select>
              </label>
            </header>

            <div className="summary-metrics" aria-label="Indicadores del resultado">
              <article>
                <small>Sistemas SSR</small>
                <strong>{numberFormatter.format(filtered.length)}</strong>
              </article>
              <article>
                <small>Arranques informados</small>
                <strong>{numberFormatter.format(visibleConnections)}</strong>
              </article>
              <article>
                <small>Beneficiarios estimados</small>
                <strong>{numberFormatter.format(visibleBeneficiaries)}</strong>
              </article>
              <article>
                <small>Áreas de servicio disponibles</small>
                <strong>{numberFormatter.format(visibleAreaCount)}</strong>
              </article>
            </div>

            {summaryPageItems.length ? (
              <>
                <div className="systems-result-list" role="table" aria-label="Sistemas filtrados">
                  <div className="systems-result-head" role="row">
                    <span role="columnheader">Sistema SSR</span>
                    <span role="columnheader">Territorio</span>
                    <span role="columnheader">Arranques</span>
                    <span role="columnheader">Beneficiarios</span>
                    <span role="columnheader">Área de servicio</span>
                    <span role="columnheader">Acciones</span>
                  </div>
                  {summaryPageItems.map((item) => {
                    const hasArea = areaServiceIdSet.has(item.id);
                    return (
                      <article className="system-result-row" role="row" key={item.id}>
                        <div className="result-system" role="cell">
                          <span style={{ background: colorByRegion.get(item.region) }} />
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.id}</small>
                          </div>
                        </div>
                        <div className="result-territory" role="cell">
                          <strong>{item.commune}</strong>
                          <small>{item.province} · {item.region}</small>
                        </div>
                        <div className="result-number" role="cell">
                          <small>Arranques</small>
                          <strong>{numberFormatter.format(item.connections)}</strong>
                        </div>
                        <div className="result-number" role="cell">
                          <small>Beneficiarios</small>
                          <strong>{numberFormatter.format(item.beneficiaries)}</strong>
                        </div>
                        <div role="cell">
                          <span className={`result-area ${hasArea ? "available" : "unavailable"}`}>
                            <i />
                            {hasArea ? "Disponible" : "No disponible"}
                          </span>
                        </div>
                        <div className="result-actions" role="cell">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(item.id);
                              setDetailOpen(true);
                            }}
                          >
                            Ver ficha
                          </button>
                          <button
                            type="button"
                            className="map-link"
                            disabled={!item.location}
                            onClick={() => {
                              setSelectedId(item.id);
                              setViewMode("map");
                              window.setTimeout(
                                () =>
                                  document
                                    .querySelector("#mapa")
                                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                                0,
                              );
                            }}
                          >
                            <Icon name="pin" />
                            Mapa
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <footer className="summary-pagination">
                  <span>
                    Mostrando{" "}
                    <strong>
                      {numberFormatter.format((summaryPage - 1) * summaryPageSize + 1)}–
                      {numberFormatter.format(
                        Math.min(summaryPage * summaryPageSize, sortedSummary.length),
                      )}
                    </strong>{" "}
                    de {numberFormatter.format(sortedSummary.length)} sistemas
                  </span>
                  <div>
                    <button
                      type="button"
                      disabled={summaryPage === 1}
                      onClick={() => setSummaryPage((page) => Math.max(1, page - 1))}
                    >
                      ← Anterior
                    </button>
                    <span>
                      Página {summaryPage} de {summaryPageCount}
                    </span>
                    <button
                      type="button"
                      disabled={summaryPage === summaryPageCount}
                      onClick={() =>
                        setSummaryPage((page) => Math.min(summaryPageCount, page + 1))
                      }
                    >
                      Siguiente →
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="summary-empty">
                <span aria-hidden="true">⌕</span>
                <strong>No hay sistemas para mostrar</strong>
                <p>Modifica la búsqueda o limpia los filtros seleccionados.</p>
                <button type="button" onClick={clearFilters}>Limpiar filtros</button>
              </div>
            )}
          </section>
        )}

        <section className="region-strip" aria-label="Resumen regional">
          <div>
            <p className="eyebrow">Distribución territorial</p>
            <h2>16 regiones representadas</h2>
          </div>
          <div className="region-pills">
            {regions.map((regionName) => {
              const count = systems.filter((item) => item.region === regionName).length;
              return (
                <button
                  key={regionName}
                  type="button"
                  className={region === regionName ? "active" : ""}
                  onClick={() => {
                    setRegion(regionName);
                    setProvince("");
                    setCommune("");
                    document.querySelector("#visor")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span style={{ background: colorByRegion.get(regionName) }} />
                  {regionName}<strong>{count}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="about-strip" id="metodologia">
          <strong>Información de referencia</strong>
          <p>
            Información obtenida de la Base de Datos Nacional de Servicios Sanitarios
            Rurales y de la capa nacional de Áreas de Servicio.
          </p>
        </section>

        <section className="about-strip author-strip" id="acerca">
          <strong>Acerca del visor</strong>
          <p>
            Visor desarrollado por <b>Marcelo Andrés Ulloa Solís</b>. Consultas:
            {" "}
            <a href="mailto:marcelo.ulloa@mop.gov.cl">marcelo.ulloa@mop.gov.cl</a>.
          </p>
        </section>
      </main>

      {detailOpen && selected && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetailOpen(false)}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              aria-label="Cerrar ficha"
              onClick={(event) => {
                event.stopPropagation();
                window.setTimeout(() => setDetailOpen(false), 0);
              }}
            >
              <Icon name="close" />
            </button>
            <p className="eyebrow">{selected.id} · {selected.region}</p>
            <h2 id="detail-title">{selected.name}</h2>
            <div className="detail-grid">
              <div><span>Provincia</span><strong>{selected.province}</strong></div>
              <div><span>Comuna</span><strong>{selected.commune}</strong></div>
              <div><span>Arranques</span><strong>{numberFormatter.format(selected.connections)}</strong></div>
              <div><span>Beneficiarios estimados</span><strong>{numberFormatter.format(selected.beneficiaries)}</strong></div>
              <div><span>Año puesta en marcha</span><strong>{selected.year ?? "S/I"}</strong></div>
              <div><span>Clasificación</span><strong>{selected.classification}</strong></div>
              <div><span>Tipo de asentamiento</span><strong>{selected.settlementType}</strong></div>
              <div><span>Condición técnica</span><strong>{selected.technicalCondition}</strong></div>
              <div><span>Grupo electrógeno AP</span><strong>{selected.generator}</strong></div>
              <div><span>Telemetría</span><strong>{selected.telemetry}</strong></div>
              <div>
                <span>Área de servicio</span>
                <strong>{selectedHasArea ? "Disponible en el visor" : "No disponible"}</strong>
              </div>
            </div>
            {selected.location ? (
              <div className="modal-actions">
                <a href={`https://www.google.com/maps?q=${selected.location.lat},${selected.location.lng}`} target="_blank" rel="noreferrer">
                  Google Maps <Icon name="external" />
                </a>
                <a href={`https://earth.google.com/web/search/${selected.location.lat},${selected.location.lng}`} target="_blank" rel="noreferrer">
                  Google Earth <Icon name="external" />
                </a>
                <a href={`https://www.waze.com/ul?ll=${selected.location.lat}%2C${selected.location.lng}&navigate=yes`} target="_blank" rel="noreferrer">
                  Waze <Icon name="external" />
                </a>
              </div>
            ) : (
              <p className="coordinate-alert">Coordenadas en revisión. El sistema se mantiene incluido en los indicadores.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
