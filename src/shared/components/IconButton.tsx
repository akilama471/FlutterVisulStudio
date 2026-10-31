import { Icon, type IconName } from "./Icon";

type IconButtonProps = {
  label: string;
  icon: IconName;
  active?: boolean;
  className?: string;
  onClick?: () => void;
};

export function IconButton({ label, icon, active = false, className, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={className ? `icon-button ${className}` : "icon-button"}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
