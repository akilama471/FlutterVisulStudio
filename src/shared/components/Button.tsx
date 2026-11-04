import type { MouseEventHandler, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type ButtonProps = {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  icon?: IconName;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

export function Button({
  children,
  onClick,
  disabled = false,
  variant = "ghost",
  icon,
  className,
  title,
  ariaLabel,
}: ButtonProps) {
  const classes = ["button", `button--${variant}`, className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{children}</span>
    </button>
  );
}
