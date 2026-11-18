import React from 'react';

interface IconProps {
  className?: string;
}

export const BrandLogoIcon: React.FC<IconProps> = ({ className = 'w-9 h-9' }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect x="2" y="2" width="36" height="36" rx="8" fill="#132238" stroke="#2563eb" strokeWidth="1.5" />
    <path d="M8 20L20 9L32 20" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 17V30H28V17" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 9V30" stroke="#93c5fd" strokeWidth="1.2" strokeDasharray="2 2" />
    <path d="M15 24H25" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const ToolGeometriaIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8L11 4L20 8V16L13 20L4 16V8Z" />
    <path d="M11 4V12M11 12L4 16M11 12L20 16" strokeOpacity="0.6" />
    <circle cx="4" cy="8" r="1.4" fill="currentColor" />
    <circle cx="11" cy="4" r="1.4" fill="currentColor" />
    <circle cx="20" cy="8" r="1.4" fill="currentColor" />
    <circle cx="13" cy="20" r="1.4" fill="currentColor" />
  </svg>
);

export const ToolFaldonesIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18L12 6L21 18H3Z" />
    <path d="M7.5 18L15 10" strokeOpacity="0.65" />
    <path d="M12 18C12 16.2 10.8 15 9.2 14.6" strokeOpacity="0.7" />
  </svg>
);

export const ToolCumbrerasIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16L12 7L21 16" />
    <path d="M7 18L12 13L17 18" strokeOpacity="0.55" />
  </svg>
);

export const ToolLimahoyasIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 6L12 13L19 6" />
    <path d="M12 13V20" />
    <path d="M9.5 17.5L12 20L14.5 17.5" strokeOpacity="0.7" />
  </svg>
);

export const ToolAlerosIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5V19" />
    <path d="M7 10L12 5L17 10" />
    <path d="M5 19H19" />
  </svg>
);

export const ToolSumiderosIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6H20L14 13V19L10 20V13L4 6Z" />
    <path d="M7 6H17" strokeWidth="2" />
  </svg>
);

export const ToolBajantesIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4H15V7H14V18L16 20H8L10 18V7H9V4Z" />
    <path d="M10 11H14M10 15H14" strokeOpacity="0.55" />
  </svg>
);

export const ToolSingularesIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 9L12 5L19 9V16L12 20L5 16V9Z" />
    <path d="M5 9L12 13L19 9M12 13V20" />
  </svg>
);

export const ToolMaterialesIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4L21 9L12 14L3 9L12 4Z" />
    <path d="M3 13L12 18L21 13" />
    <path d="M3 17L12 22L21 17" />
  </svg>
);

export const ToolNormativaIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L19 6V12C19 16.5 15.8 19.9 12 21C8.2 19.9 5 16.5 5 12V6L12 3Z" />
    <path d="M9 12L11 14L15.5 9.5" />
  </svg>
);

export const ToolMedicionesIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="8" rx="1.5" />
    <path d="M7 8V11.5M10.5 8V10.5M14 8V11.5M17.5 8V10.5" />
  </svg>
);

export const ViewPlanta2DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5">
    <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
    <path d="M2.5 9.5H11M11 2.5V17.5M11 12H17.5" />
  </svg>
);

export const ViewModelo3DIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M10 2.5L17 6.5V13.5L10 17.5L3 13.5V6.5L10 2.5Z" />
    <path d="M3 6.5L10 10.5L17 6.5M10 10.5V17.5" />
  </svg>
);

export const ViewDivididaIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5">
    <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
    <path d="M10 3.5V16.5" />
  </svg>
);

export const ViewSeccionIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M2.5 14.5L10 5L17.5 14.5H2.5Z" />
    <path d="M6.5 14.5L10 9.5L13.5 14.5" strokeOpacity="0.6" />
  </svg>
);

export const ViewDespieceIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M10 2.5L17.5 6.5L10 10.5L2.5 6.5L10 2.5Z" />
    <path d="M2.5 10L10 14L17.5 10" />
    <path d="M2.5 13.5L10 17.5L17.5 13.5" />
  </svg>
);

export const CteBadgeIcon: React.FC<IconProps> = ({ className = 'w-12 h-12' }) => (
  <svg viewBox="0 0 56 56" fill="none" className={className}>
    <rect x="2" y="2" width="52" height="52" rx="8" fill="#1d4ed8" stroke="#60a5fa" strokeWidth="1.5" />
    <text x="28" y="29" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="800" fontFamily="Inter, sans-serif">
      CTE
    </text>
    <text x="28" y="42" textAnchor="middle" fill="#bfdbfe" fontSize="5.8" fontWeight="600" fontFamily="Inter, sans-serif">
      CÓDIGO TÉCNICO
    </text>
  </svg>
);
