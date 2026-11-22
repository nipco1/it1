/* ── NIPCO Inline SVG Icon System (بدون فونت آیکون) ── */
import type { ReactNode, SVGProps } from "react";

const S: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" /><path d="M9 10h6M9 14h6M9 18h3" /></>,
  chart: <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></>,
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  printer: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 19v2M21 14h-2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  check: <path d="m4 12.5 5.5 5.5L20 6.5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-3.6 3-5.5 7-5.5s7 1.9 7 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M22 21c0-3-2-4.7-5-5.3" /></>,
  shield: <><path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5Z" /><path d="m9 12 2 2 4-4" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
  upload: <><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M4 3h16" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  contrast: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none" /></>,
  drag: <><circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  filter: <path d="M3 5h18l-7 8v5.5L10 21v-8L3 5z" />,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  wifi: <><path d="M5 12.5a11 11 0 0 1 14 0" /><path d="M8.5 15.5a6.5 6.5 0 0 1 7 0" /><path d="M2 9a16 16 0 0 1 20 0" /><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" /></>,
  wifioff: <><path d="m2 2 20 20" /><path d="M8.5 15.5a6.5 6.5 0 0 1 7 0" /><path d="M2 9a16 16 0 0 1 5.2-2.8M11 5.1A16 16 0 0 1 22 9" /><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" /></>,
  sync: <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /></>,
  wrench: <path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 5.6L3 17.2V21h3.8l5.3-5.3a4.5 4.5 0 0 0 5.6-6.4l-2.8 2.8-2.5-.6-.6-2.5 2.9-2.7z" />,
  zap: <path d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" />,
  flame: <path d="M12 2s5 4.6 5 9a5 5 0 0 1-10 0c0-1.8.8-3.4 1.6-4.6.4 1 1.1 1.9 1.9 2.3C10.2 6.6 11 4.2 12 2z" />,
  gauge: <><path d="M20.5 14.5A9 9 0 1 0 3.5 14.5" /><path d="m12 13 4-4" /><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" /><path d="M4 20h16" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
  grid: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></>,
  back: <path d="m9 6 6 6-6 6" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 11v5" /></>,
  camera: <><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3.5 2" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.5 11.5 8-8M17 6l2.5 2.5M14.5 8.5 17 11" /></>,
  palette: <><path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.7-2.5 1.7z" /><circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="11" cy="7.5" r="1" fill="currentColor" stroke="none" /><circle cx="15.5" cy="9" r="1" fill="currentColor" stroke="none" /></>,
  plug: <><path d="M9 2v6M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></>,
  activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
  eye: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  timer: <><path d="M10 2h4" /><path d="M12 14l3-3" /><circle cx="12" cy="14" r="8" /></>,
  factory: <><path d="M3 21V9l6 4V9l6 4V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v16" /><path d="M3 21h18" /><path d="M7 17h2M12 17h2M17 17h2" /></>,
  box: <><path d="m12 2 8 4.5v11L12 22l-8-4.5v-11z" /><path d="m4 6.5 8 4.5 8-4.5M12 11v11" /></>,
  chevd: <path d="m6 9 6 6 6-6" />,
  expand: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>,
};

// آیکون‌های پُرشده اختصاصی گروه‌ها
const F: Record<string, ReactNode> = {
  press: <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2.5 21h19M9 3v4h6V3M12 7v4m-4 0h8l1 6H8l1-6z" />,
  robot: <><rect x="6.5" y="9" width="11" height="9" rx="2" /><path d="M12 9V6M12 6a1.2 1.2 0 1 0-.01 0zM4 13.5v3M20 13.5v3M9 21v-3M15 21v-3" /><circle cx="9.7" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="14.3" cy="13" r="1" fill="currentColor" stroke="none" /><path d="M9.5 15.8h5" /></>,
  compressor: <><circle cx="12" cy="12" r="9" /><path d="M12 12c-.5-3.6.6-6 3.5-6-.6 3.6-1.5 5.4-3.5 6zm0 0c3.6-.5 6 .6 6 3.5-3.6-.6-5.4-1.5-6-3.5zm0 0c.5 3.6-.6 6-3.5 6 .6-3.6 1.5-5.4 3.5-6zm0 0c-3.6.5-6-.6-6-3.5 3.6.6 5.4 1.5 6 3.5z" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" /></>,
  forklift: <><path d="M2.5 16.5V8a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 9.5 8v8.5" /><path d="M9.5 9h3.5l2 7.5" /><path d="M2.5 16.5h12.5" /><circle cx="5.5" cy="18.5" r="1.8" /><circle cx="12.5" cy="18.5" r="1.8" /><path d="M17.5 3v13.5h4.5M17.5 12h3.5" /></>,
};

export type IconName = keyof typeof S | keyof typeof F;

export function Icon({ name, size = 20, className, filled, ...rest }: { name: string; size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  const fillShape = filled && F[name];
  const content = fillShape ? F[name] : (S[name] || F[name] || S.box);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fillShape ? "none" : "none"}
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden {...rest}>
      {content}
    </svg>
  );
}

/** لوگوی NIPCO — نشان صنعتی */
export function Logo({ size = 40, light }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M24 3 42 13.5v21L24 45 6 34.5v-21z" fill="none" stroke={light ? "#17222e" : "#f5a623"} strokeWidth="2.6" />
      <path d="M24 9.5 36.5 17v14L24 38.5 11.5 31V17z" fill={light ? "#17222e" : "rgba(245,166,35,0.14)"} stroke="none" />
      <path d="M16 30V18l6.5 8L29 18v12" fill="none" stroke={light ? "#17222e" : "#f5a623"} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 18v12" fill="none" stroke={light ? "#17222e" : "#f5a623"} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}
