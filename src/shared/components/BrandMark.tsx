import { useId } from "react";

type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 24, className }: BrandMarkProps) {
  const gradientId = useId();

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Flutter UI Studio"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="2"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6BA1FF" />
          <stop offset="1" stopColor="#2F6BE0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <path
        d="M9 10.5h14M9 16h9.5M9 21.5h5.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
