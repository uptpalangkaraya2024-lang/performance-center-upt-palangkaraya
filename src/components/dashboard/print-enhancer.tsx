"use client";

import { useEffect, useSyncExternalStore } from "react";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const ISO_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });

const noop = () => () => {};

/** Today's date (Asia/Jakarta) for the printed report header. Empty during
 *  SSR/static generation so a statically built page never prints its
 *  build date; filled in on the client. */
export function PrintDate() {
  const text = useSyncExternalStore(
    noop,
    () => DATE_FMT.format(new Date()),
    () => "",
  );
  return <>{text}</>;
}

/** Mounted once in the dashboard layout. For every print / Export PDF:
 *  - prints on white paper even when the dashboard is in dark mode (the
 *    theme toggle's "dark" class is lifted for the print and put back);
 *  - pre-fills the PDF file name from the page title + date. */
export function PrintEnhancer() {
  useEffect(() => {
    const html = document.documentElement;
    let wasDark = false;
    let originalTitle = "";
    const before = () => {
      wasDark = html.classList.contains("dark");
      if (wasDark) html.classList.remove("dark");
      originalTitle = document.title;
      const explicit = document.querySelector("[data-print-filename]")?.getAttribute("data-print-filename");
      const pageTitle = document.querySelector("[data-print-title]")?.textContent?.trim();
      if (explicit) {
        document.title = explicit;
      } else if (pageTitle) {
        const safe = pageTitle.replace(/[\\/:*?"<>|()]+/g, "").replace(/\s+/g, "-");
        document.title = `${safe}-${ISO_FMT.format(new Date())}`;
      }
    };
    const after = () => {
      if (wasDark) html.classList.add("dark");
      if (originalTitle) document.title = originalTitle;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
