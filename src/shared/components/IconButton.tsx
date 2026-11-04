import { Icon, type IconName } from "./Icon";

type IconButtonProps = {
  label: string;
  icon: IconName;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  ariaKeyshortcuts?: string;
  onClick?: () => void;
};

export function IconButton({
  label,
  icon,
  active,
  disabled = false,
  className,
  ariaKeyshortcuts,
  onClick,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={className ? `icon-button ${className}` : "icon-button"}
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={ariaKeyshortcuts}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
