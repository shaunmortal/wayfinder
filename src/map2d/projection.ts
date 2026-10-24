// 2.5D projection shared by the 2D map and the graph bounds.
export const TH = (20 * Math.PI) / 180;
export const CT = Math.cos(TH);
export const ST = Math.sin(TH);
export const KY = 0.64;
export const WALL = 11;

export function P(x: number, y: number, z = 0): [number, number] {
  return [Math.round((x * CT - y * ST) * 10) / 10, Math.round(((x * ST + y * CT) * KY - z) * 10) / 10];
}
