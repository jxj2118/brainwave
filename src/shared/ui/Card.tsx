import type { HTMLAttributes, ReactNode } from "react";
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`bw-card ${className}`} />;
}
export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="bw-section-heading">
      <h2>{title}</h2>
      {action}
    </div>
  );
}
