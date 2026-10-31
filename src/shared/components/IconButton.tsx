import { Icon, type IconName } from "./Icon";

type IconButtonProps = {
  label: string;
  icon: IconName;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

export function IconButton({
  label,
  icon,
  active = false,
  disabled = false,
  className,
  onClick,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={className ? `icon-button ${className}` : "icon-button"}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
