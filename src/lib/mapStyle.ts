// A calm, prototype-like map: flat blocks, white streets, green parks, blue water,
// a few street and neighbourhood names. Built at runtime from OpenFreeMap's free
// "positron" style (OpenMapTiles schema) by dropping and recolouring layers.
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

const BASE = import.meta.env.VITE_MAP_STYLE || "https://tiles.openfreemap.org/styles/positron";

const PALETTE = {
  light: { ground: "#e9eef0", block: "#dde4e7", street: "#ffffff", casing: "#d4dcdf", park: "#cfe3cf", water: "#bcd6e6", text: "#5d6d6b", halo: "#eef2f3" },
  dark:  { ground: "#121a1c", block: "#18232a", street: "#26343c", casing: "#1a262c", park: "#17301f", water: "#123044", text: "#8fa09d", halo: "#121a1c" },
};
type Pal = typeof PALETTE.light;

const Z = (stops: [number, number][]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()];
const WIDTH = {
  minor: Z([[13, 0.5], [15, 3], [17, 9], [19, 20]]),
  major: Z([[10, 0.8], [13, 2.5], [15, 7], [17, 16], [19, 30]]),
  majorCasing: Z([[10, 1.2], [13, 3.5], [15, 9], [17, 19], [19, 34]]),
};
const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

function transform(s: StyleSpecification, c: Pal): StyleSpecification {
  const out: LayerSpecification[] = [];
  const add = (l: LayerSpecification, patch: Record<string, unknown>) => out.push({ ...l, ...patch } as LayerSpecification);
  const label = (l: LayerSpecification, size: unknown) => {
    const layout = { ...((l as { layout?: Record<string, unknown> }).layout || {}) };
    delete layout["icon-image"];
    add(l, {
      layout: { ...layout, "text-field": NAME, "text-size": size, "text-letter-spacing": 0.02 },
      paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 1.6 },
    });
  };

  for (const l of s.layers) {
    const id = l.id;
    switch (id) {
      case "background": add(l, { paint: { "background-color": c.ground } }); break;
      case "park": add(l, { paint: { "fill-color": c.park } }); break;
      case "landcover_wood": add(l, { paint: { "fill-color": c.park, "fill-opacity": 0.8 } }); break;
      case "water": add(l, { paint: { "fill-color": c.water } }); break;
      case "waterway": add(l, { paint: { "line-color": c.water, "line-width": Z([[12, 1], [16, 4]]) } }); break;
      case "building": add(l, { paint: { "fill-color": c.block, "fill-opacity": Z([[14, 0], [15.5, 1]]) } }); break;
      case "highway_minor": add(l, { minzoom: 13, paint: { "line-color": c.street, "line-width": WIDTH.minor } }); break;
      case "highway_major_casing": case "highway_motorway_casing": case "highway_motorway_bridge_casing":
        add(l, { paint: { "line-color": c.casing, "line-width": WIDTH.majorCasing } }); break;
      case "highway_major_inner": case "highway_motorway_inner": case "highway_motorway_bridge_inner":
        add(l, { paint: { "line-color": c.street, "line-width": WIDTH.major } }); break;
      case "highway_major_subtle": case "highway_motorway_subtle":
        add(l, { paint: { "line-color": c.street, "line-width": 1.5 } }); break;
      case "water_name_point_label": case "water_name_line_label": label(l, 12); break;
      case "highway-name-major": label(l, Z([[13, 10], [17, 13]])); break;
      case "highway-name-minor": label({ ...l, minzoom: 16 } as LayerSpecification, 11); break;
      case "label_other": label(l, 11); break; // neighbourhoods, suburbs
      case "label_village": case "label_town": case "label_city": case "label_city_capital": label(l, 13); break;
      default: break; // drop: residential tint, rail, paths, piers, aeroways, boundaries, shields, POIs, countries
    }
  }
  return { ...s, layers: out };
}

const cache: Record<string, StyleSpecification> = {};
export async function simpleStyle(dark: boolean): Promise<StyleSpecification | string> {
  // A custom VITE_MAP_STYLE that isn't OpenMapTiles-positron is used as-is.
  if (import.meta.env.VITE_MAP_STYLE && !/positron/.test(BASE)) return BASE;
  const k = dark ? "dark" : "light";
  if (cache[k]) return cache[k];
  try {
    const s = (await (await fetch(BASE)).json()) as StyleSpecification;
    return (cache[k] = transform(s, dark ? PALETTE.dark : PALETTE.light));
  } catch {
    return BASE;
  }
}
export const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
