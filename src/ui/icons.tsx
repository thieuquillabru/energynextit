import React from 'react';

type P = { size?: number; className?: string };
const base = (size = 17) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const IconDashboard = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const IconUsers = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 11a3 3 0 1 0 0-6" /><path d="M17.5 14.5c2.2.6 3.5 2.3 3.5 4.5" /></svg>
);
export const IconTasks = ({ size }: P) => (
  <svg {...base(size)}><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M7.5 9.5l2 2 3.5-3.5" /><path d="M14 14h3.5" /><path d="M7.5 15.5h3" /></svg>
);
export const IconBuilding = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 21V6.5L12 3v18" /><path d="M12 9h8v12" /><path d="M7.5 8.5h1M7.5 12h1M7.5 15.5h1" /><path d="M15.5 12.5h1M15.5 16h1" /><path d="M2 21h20" /></svg>
);
export const IconProject = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="4" width="5.5" height="16" rx="1.5" /><rect x="10" y="4" width="5.5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></svg>
);
export const IconActivity = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 12h4l2.5-6 4 13 2.5-7H21" /></svg>
);
export const IconSettings = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54h.09A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></svg>
);
export const IconChat = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /></svg>
);
export const IconPlus = ({ size }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconClose = ({ size }: P) => (<svg {...base(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const IconMinus = ({ size }: P) => (<svg {...base(size)}><path d="M5 12h14" /></svg>);
export const IconTarget = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
);
export const IconEdit = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>
);
export const IconRefresh = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
);
export const IconCheck = ({ size }: P) => (<svg {...base(size)}><path d="M20 6 9 17l-5-5" /></svg>);
export const IconWarning = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 3 2.5 20h19z" /><path d="M12 9v5" /><circle cx="12" cy="17.2" r=".8" fill="currentColor" /></svg>
);
export const IconPlay = ({ size }: P) => (<svg {...base(size)}><path d="M7 4l13 8-13 8z" /></svg>);
export const IconStop = ({ size }: P) => (<svg {...base(size)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>);
export const IconLink = ({ size }: P) => (
  <svg {...base(size)}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></svg>
);
export const IconSend = ({ size }: P) => (<svg {...base(size)}><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>);
export const IconZoomIn = ({ size }: P) => (<svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5M11 8v6M8 11h6" /></svg>);
export const IconZoomOut = ({ size }: P) => (<svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5M8 11h6" /></svg>);
export const IconMaximize = ({ size }: P) => (
  <svg {...base(size)}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
);
export const IconCrown = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 18h18l-1.5-9-4.5 4L12 6 9 13 4.5 9z" /><path d="M3 21h18" /></svg>
);
export const IconCode = ({ size }: P) => (<svg {...base(size)}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>);
export const IconMegaphone = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 11v2a1 1 0 0 0 1 1h2l11 5V5L6 10H4a1 1 0 0 0-1 1z" /><path d="M17 8a4 4 0 0 1 0 8" /></svg>
);
export const IconFlask = ({ size }: P) => (
  <svg {...base(size)}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" /><path d="M7 15h10" /></svg>
);
export const IconClipboard = ({ size }: P) => (
  <svg {...base(size)}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4" /><path d="M9 10h6M9 14h6M9 18h3" /></svg>
);
export const IconDatabase = ({ size }: P) => (
  <svg {...base(size)}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
);
export const IconPalette = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.5 3H16a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 21z" /><circle cx="7.5" cy="12" r="1.1" fill="currentColor" /><circle cx="10" cy="8" r="1.1" fill="currentColor" /><circle cx="14.5" cy="7.5" r="1.1" fill="currentColor" /></svg>
);
export const IconGear = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="8.5" strokeDasharray="3 4" /></svg>);
export const IconHeart = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20z" /></svg>
);
export const IconCoffee = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 8h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M6 3v2M10 3v2M14 3v2" /></svg>
);
export const IconMeeting = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="2.4" /><path d="M7.5 18.5c.6-2.2 2.3-3.5 4.5-3.5s3.9 1.3 4.5 3.5" /></svg>
);

export const DEPT_ICON: Record<string, React.FC<P>> = {
  crown: IconCrown,
  code: IconCode,
  megaphone: IconMegaphone,
  flask: IconFlask,
  clipboard: IconClipboard,
  database: IconDatabase,
  palette: IconPalette,
  gear: IconGear,
  heart: IconHeart,
  coffee: IconCoffee,
};

export function DeptIcon({ icon, size = 15 }: { icon: string; size?: number }) {
  const C = DEPT_ICON[icon] || IconGear;
  return <C size={size} />;
}
