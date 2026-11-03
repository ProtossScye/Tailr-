import type { ReactNode, SVGProps } from "react";

/**
 * Tailr's own icon set: 24px grid, 1.8px round strokes, drawn for this app rather than pulled in
 * from a library. Decorative by default (aria-hidden); pass `title` when an icon stands alone.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { title?: string };

function Icon({ title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </Icon>
);

export const BetsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h12a1 1 0 0 1 1 1v15l-3-1.8-3 1.8-3-1.8-3 1.8-2-1.2V5a1 1 0 0 1 1-1z" />
    <path d="M9 9h6M9 13h4" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 20V12M12 20V5M19 20v-5" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.6-3.4 3.3-5.5 7-5.5s6.4 2.1 7 5.5" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);

export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const TrendUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Icon>
);

export const TrendDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 7l10 10M17 9v8H9" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.2l2.6 1.6" />
  </Icon>
);

export const DashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="m13.5 7.5 3 3" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="8" width="11" height="12" rx="2" />
    <path d="M5 16V6a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14 8l4 4-4 4M18 12H9" />
  </Icon>
);

/** Logo mark: a "T" whose crossbar trails off like a tail. */
export const LogoMark = (p: IconProps) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...p}>
    <path d="M3 5h14M10 5v11" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    <path d="M10 16c0-2.2 1.4-3.2 3.6-3.2" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
  </svg>
);

/** Larger empty-state art: a slip with a notch, drawn in the same stroke language. */
export const SlipArt = (p: IconProps) => (
  <svg viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M14 8h28a2 2 0 0 1 2 2v38l-6-3.6-6 3.6-6-3.6-6 3.6-4-2.4V10a2 2 0 0 1 2-2z" />
    <path d="M20 19h16M20 27h10" />
    <path d="M36 33l4 4-4 4" opacity="0" />
  </svg>
);

export const BoardArt = (p: IconProps) => (
  <svg viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M10 44V12M10 44h36" />
    <path d="M17 36l9-9 7 6 12-14" />
    <circle cx="45" cy="19" r="2.4" fill="currentColor" stroke="none" />
  </svg>
);

export const BellArt = (p: IconProps) => (
  <svg viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M15 38V26a13 13 0 0 1 26 0v12l3.5 3.5h-33z" />
    <path d="M23.5 47a5 5 0 0 0 9 0" />
  </svg>
);
