// Local metric frame for the diorama. 1 world unit = 100 m, +x east, -z north, y up.
// Shared by the data scripts (Node) and the browser code, so it stays dependency-free.
export const LAT0 = 25.055;
export const LON0 = 121.55;
export const KX = 1009.0; // units per degree of longitude at LAT0
export const KZ = 1107.7; // units per degree of latitude

export const BBOX = { west: 121.4, east: 121.68, south: 24.94, north: 25.22 };
export const TERRAIN_ZOOM = 12;
export const TERRAIN_STEP = 1; // heightmap cell size in world units (100 m)

export const toX = (lon) => (lon - LON0) * KX;
export const toZ = (lat) => -(lat - LAT0) * KZ;
export const project = (lat, lon) => [toX(lon), toZ(lat)];

export const EXTENT = {
  minX: toX(BBOX.west),
  maxX: toX(BBOX.east),
  minZ: toZ(BBOX.north),
  maxZ: toZ(BBOX.south),
};

// Web-mercator tile helpers for the terrain download
export const lon2tile = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2tile = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const tile2lon = (x, z) => (x / 2 ** z) * 360 - 180;
export const tile2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
export function tileRange(z) {
  return {
    x0: Math.floor(lon2tile(BBOX.west, z)),
    x1: Math.floor(lon2tile(BBOX.east, z)),
    y0: Math.floor(lat2tile(BBOX.north, z)),
    y1: Math.floor(lat2tile(BBOX.south, z)),
  };
}
