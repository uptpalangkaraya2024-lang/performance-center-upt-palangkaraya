import { NextResponse } from "next/server";
import type { TowerWeather } from "@/lib/sutt-fault-locator";

// Current-weather lookup for a tower's own lat/lon, per the user's own
// request on the "Cari Titik Gangguan" fault locator ("tambahkan cuaca
// disekitar titik tower"). Proxied through this route (not fetched
// straight from the browser) so the upstream URL/params stay server-side
// and every call goes through one small, consistent error-handling path —
// same reason this app's other third-party-API services (sigap.ts,
// row-watch.ts) do their own fetch server-side rather than letting a
// client component call out directly.
//
// Open-Meteo (open-meteo.com) — free, no API key, no auth — same provider
// ROW Watch's own map itself already calls client-side for the exact same
// purpose (confirmed live in its app-map.js: both a weather forecast call
// and an air-quality call against this same family of endpoints), so this
// isn't a new third-party dependency being introduced to the UPT's own
// tooling, just the same one this app's own fault locator now also uses.
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoCurrent {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  precipitation?: number;
  rain?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  cloud_cover?: number;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent;
}

// WMO weather interpretation codes (the standard Open-Meteo's own `current.
// weather_code` returns) — Indonesian labels for the ranges this app
// actually needs to distinguish for a field crew (is it raining / likely
// to right now, not full meteorological nuance). Grouped, not a 1:1 map
// per code, since the fine distinctions (e.g. "light drizzle" vs "dense
// drizzle") don't change what a crew does differently.
function weatherCodeLabel(code: number | undefined): string {
  if (code === undefined) return "Tidak diketahui";
  if (code === 0) return "Cerah";
  if (code <= 3) return "Berawan";
  if (code === 45 || code === 48) return "Berkabut";
  if (code >= 51 && code <= 57) return "Gerimis";
  if (code >= 61 && code <= 67) return "Hujan";
  if (code >= 71 && code <= 77) return "Salju"; // never expected in this region, kept for completeness
  if (code >= 80 && code <= 82) return "Hujan deras (showers)";
  if (code === 85 || code === 86) return "Hujan salju"; // ditto
  if (code >= 95) return "Badai petir";
  return "Tidak diketahui";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon tidak valid" }, { status: 400 });
  }

  try {
    const url = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,cloud_cover&timezone=Asia%2FJakarta`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ error: "Open-Meteo tidak merespons" }, { status: 502 });
    const data = (await res.json()) as OpenMeteoResponse;
    const current = data.current;
    if (!current) return NextResponse.json({ error: "Data cuaca tidak tersedia" }, { status: 502 });

    const weather: TowerWeather = {
      label: weatherCodeLabel(current.weather_code),
      temperatureC: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
      humidityPercent: typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
      precipitationMm: typeof current.precipitation === "number" ? current.precipitation : null,
      windSpeedKmh: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
      cloudCoverPercent: typeof current.cloud_cover === "number" ? current.cloud_cover : null,
    };
    return NextResponse.json(weather);
  } catch {
    return NextResponse.json({ error: "Gagal mengambil data cuaca" }, { status: 502 });
  }
}
