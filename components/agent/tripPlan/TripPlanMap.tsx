"use client";

import type { TripPlanPlace } from "@/lib/agent/tripPlan/types";
import { useEffect, useRef } from "react";

export function TripPlanMap({
  places,
  selected,
  className,
}: {
  places: TripPlanPlace[];
  selected?: { lat: number; lng: number } | null;
  className?: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);

  useEffect(() => {
    const AMap = (window as unknown as { AMap?: unknown }).AMap as
      | {
          Map: new (el: HTMLElement, opts: object) => {
            remove: (m: unknown[]) => void;
            setFitView: (m: unknown[], flag: boolean, padding: number[]) => void;
            setZoomAndCenter: (z: number, c: number[]) => void;
          };
          Marker: new (opts: object) => unknown;
          Pixel: new (x: number, y: number) => unknown;
        }
      | undefined;

    if (!mapContainerRef.current || !AMap) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new AMap.Map(mapContainerRef.current, {
        zoom: 12,
        viewMode: "3D",
      });
    }

    const map = mapInstanceRef.current as {
      remove: (m: unknown[]) => void;
      setFitView: (m: unknown[], flag: boolean, padding: number[]) => void;
      setZoomAndCenter: (z: number, c: number[]) => void;
    };

    if (markersRef.current.length > 0) {
      map.remove(markersRef.current);
      markersRef.current = [];
    }

    const valid = places.filter((p) => {
      const lat = Number(p.coordinates?.lat);
      const lng = Number(p.coordinates?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });

    const newMarkers: unknown[] = [];
    valid.forEach((place, index) => {
      const lng = Number(place.coordinates!.lng);
      const lat = Number(place.coordinates!.lat);
      const markerContent = `<div style="display:flex;height:28px;width:28px;transform:rotate(-45deg);align-items:center;justify-content:center;border-radius:8px;border-bottom-left-radius:0;border:2px solid white;background:#059669;box-shadow:0 2px 4px rgba(0,0,0,.2)"><span style="transform:rotate(45deg);font-size:12px;font-weight:600;color:white">${index + 1}</span></div>`;
      try {
        const marker = new AMap.Marker({
          map,
          position: [lng, lat],
          content: markerContent,
          offset: new AMap.Pixel(-14, -28),
          title: place.name,
        });
        newMarkers.push(marker);
      } catch {
        /* skip invalid marker */
      }
    });

    markersRef.current = newMarkers;
    if (newMarkers.length > 0) {
      setTimeout(() => map.setFitView(newMarkers, false, [48, 48, 48, 48]), 80);
    }
  }, [places]);

  useEffect(() => {
    const map = mapInstanceRef.current as { setZoomAndCenter?: (z: number, c: number[]) => void } | null;
    if (!map?.setZoomAndCenter || !selected) return;
    const lng = Number(selected.lng);
    const lat = Number(selected.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      map.setZoomAndCenter(14, [lng, lat]);
    }
  }, [selected]);

  return (
    <div
      ref={mapContainerRef}
      className={className ?? "h-full min-h-[14rem] w-full rounded-xl border border-border/50"}
    />
  );
}
