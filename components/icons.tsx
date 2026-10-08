import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

export const IHome = (p: P) => <svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>;
export const IBoard = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></svg>;
export const ITable = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>;
export const ICalendar = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="1.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const IUsers = (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2" /></svg>;
export const IUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>;
export const ISearch = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IPlus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const ILock = (p: P) => <svg {...base(p)}><rect x="4.5" y="10.5" width="15" height="10" rx="1.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>;
export const IUnlock = (p: P) => <svg {...base(p)}><rect x="4.5" y="10.5" width="15" height="10" rx="1.5" /><path d="M8 10.5V7a4 4 0 0 1 7.7-1.5" /></svg>;
export const IMail = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3.5 6 8.5 7 8.5-7" /></svg>;
export const IPhone = (p: P) => <svg {...base(p)}><path d="M5 3.5h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.6 6.6l1.4-2.3 4.5 1.8V19a1.5 1.5 0 0 1-1.5 1.5C10.6 20.5 3.5 13.4 3.5 5A1.5 1.5 0 0 1 5 3.5Z" /></svg>;
export const ILink = (p: P) => <svg {...base(p)}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>;
export const IFile = (p: P) => <svg {...base(p)}><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" /><path d="M14 3v5h5" /></svg>;
export const IUpload = (p: P) => <svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16" /></svg>;
export const IDownload = (p: P) => <svg {...base(p)}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16" /></svg>;
export const ITrash = (p: P) => <svg {...base(p)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13.5h10L18 7" /></svg>;
export const IEdit = (p: P) => <svg {...base(p)}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></svg>;
export const IX = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const ICheck = (p: P) => <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const IChevron = (p: P) => <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>;
export const IMenu = (p: P) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const ISun = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>;
export const IMoon = (p: P) => <svg {...base(p)}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>;
export const ILogout = (p: P) => <svg {...base(p)}><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 8l-4 4 4 4M6 12h10" /></svg>;
export const INote = (p: P) => <svg {...base(p)}><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V15l-6 6H6.5A1.5 1.5 0 0 1 5 19.5Z" /><path d="M13 21v-4.5a1.5 1.5 0 0 1 1.5-1.5H19M9 8h6M9 12h4" /></svg>;
export const IPresent = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8" /></svg>;
export const IVideo = (p: P) => <svg {...base(p)}><rect x="3" y="6" width="13" height="12" rx="1.5" /><path d="m16 10.5 5-3v9l-5-3" /></svg>;
export const IClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IExternal = (p: P) => <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></svg>;
export const IPin = (p: P) => <svg {...base(p)}><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3Z" /><path d="M12 14v6" /></svg>;
export const IFlag = (p: P) => <svg {...base(p)}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>;
export const IBuilding = (p: P) => <svg {...base(p)}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></svg>;
export const IFolder = (p: P) => <svg {...base(p)}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" /></svg>;
export const IArrowRight = (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const ISpark = (p: P) => <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>;
export const IKey = (p: P) => <svg {...base(p)}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></svg>;
export const ISnow = (p: P) => <svg {...base(p)}><path d="M12 2v20M4 7l16 10M4 17 20 7" /><path d="m9 4 3 2 3-2M9 20l3-2 3 2" /></svg>;
export const IDot = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;

/** Isotipo KOSMA (mismo trazo del favicon de wearekosma.com) */
export function KosmaMark(p: P) {
  return (
    <svg viewBox="128 284 354 222" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M349.01 299.63v56.26c0 3.02-2.45 5.46-5.46 5.46h-12.59c-3.02 0-5.46-2.45-5.46-5.46v-33.75c0-3.02-2.45-5.46-5.46-5.46h-35.76c-3.02 0-5.46-2.45-5.46-5.46v-11.58c0-3.02 2.45-5.46 5.46-5.46h59.28c3.010 0 5.45 2.45 5.45 5.46Z" />
      <path d="M138.08 490.25v-56.26c0-3.02 2.45-5.46 5.46-5.46h12.59c3.02 0 5.46 2.45 5.46 5.46v33.75c0 3.02 2.45 5.46 5.46 5.460h35.76c3.02 0 5.46 2.45 5.46 5.46v11.58c0 3.02-2.45 5.46-5.46 5.46h-59.28c-3 0-5.45-2.45-5.45-5.45Z" />
      <path d="M349.01 433.99v56.26c0 3.02-2.45 5.46-5.46 5.46h-59.28c-3.02 0-5.46-2.45-5.46-5.46v-11.58c0-3.02 2.45-5.46 5.46-5.46h35.76c3.02 0 5.46-2.45 5.46-5.46v-33.75c0-3.02 2.45-5.46 5.46-5.46h12.59c3.01 0 5.45 2.44 5.45 5.46Z" />
      <path d="M254.97 333.22v123.44c0 3.02-2.45 5.46-5.46 5.46h-12.25c-3.02 0-5.46-2.45-5.46-5.46V333.22c0-3.02 2.45-5.46 5.46-5.46h12.25c3.01 0 5.46 2.45 5.46 5.46Z" />
      <path d="M208.28 299.63v11.58c0 3.02-2.45 5.46-5.46 5.46h-35.76c-3.02 0-5.46 2.45-5.46 5.46v33.75c0 3.02-2.45 5.46-5.46 5.46h-12.59c-3.02 0-5.46-2.45-5.46-5.46v-56.26c0-3.02 2.45-5.46 5.46-5.46h59.28c3 0 5.45 2.45 5.45 5.46Z" />
      <path d="M208.28 366.81v56.26c0 3.02-2.45 5.46-5.46 5.46h-12.59c-3.02 0-5.46-2.45-5.46-5.46v-56.26c0-3.02 2.45-5.46 5.46-5.46h12.59c3 0 5.45 2.45 5.45 5.46Z" />
      <path d="M302.32 366.81v56.26c0 3.02-2.45 5.46-5.46 5.46h-12.59c-3.02 0-5.46-2.45-5.46-5.46v-56.26c0-3.02 2.45-5.46 5.46-5.46h12.59c3.02 0 5.46 2.45 5.46 5.46Z" />
      <path d="M395.52 366.81v56.26c0 3.02-2.45 5.46-5.46 5.46h-12.59c-3.02 0-5.46-2.45-5.46-5.46v-56.26c0-3.02 2.45-5.46 5.46-5.46h12.59c3 0 5.45 2.45 5.45 5.46Z" />
      <path d="m436.74 384.6 32.76-82.97c1.42-3.58-1.23-7.47-5.08-7.47h-15.94c-2.27 0-4.31 1.41-5.11 3.53l-33.06 87.51a16.39 16.39 0 0 0 .1 11.56l38 95.49a5.46 5.46 0 0 0 5.07 3.44h16.06c3.89 0 6.530-3.95 5.05-7.54l-37.77-91.59a16.39 16.39 0 0 1-.08-11.96Z" />
    </svg>
  );
}
export const IPulse = (p: P) => <svg {...base(p)}><path d="M3 12h4l2.5-6 5 12L17 12h4" /></svg>;
export const IPlug = (p: P) => <svg {...base(p)}><path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0Z" /><path d="M12 16.5V21" /></svg>;
export const IGrid = (p: P) => <svg {...base(p)}><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></svg>;
export const IStack = (p: P) => <svg {...base(p)} strokeWidth={2.2}><rect x="7" y="7" width="13" height="13" rx="1.5" /><path d="M4 16V5.5A1.5 1.5 0 0 1 5.5 4H16" /></svg>;
export const IChat = (p: P) => <svg {...base(p)} strokeWidth={2.2}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z" /></svg>;
