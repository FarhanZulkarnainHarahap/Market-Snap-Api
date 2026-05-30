import type { Store } from "../types/market.js";

type Point = { lat: number; lng: number };

export function distanceKm(from: Point, to: Point): number {
  const earth = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return roundKm(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function nearestStore(location: Point, stores: Store[]): Store {
  return stores
    .map((store) => ({ ...store, distanceKm: distanceKm(location, store) }))
    .sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm))[0];
}

export function roundKm(value: number): number {
  return Math.round(value * 10) / 10;
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}
