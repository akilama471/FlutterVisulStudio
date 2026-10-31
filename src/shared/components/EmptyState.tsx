import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  description: string;
  className?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, className, action }: EmptyStateProps) {
  return (
    <div className={className ? `empty-state ${className}` : "empty-state"}>
      <span className="empty-state__icon">
        <Icon name={icon} size={20} />
      </span>
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__description">{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
