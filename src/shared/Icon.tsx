import { solarIcons } from "./solarIcons";
export type IconName = keyof typeof solarIcons;
export function Icon({
  name,
  size = 22,
  variant = "linear",
  className,
}: {
  name: IconName;
  size?: number;
  variant?: "linear" | "bold";
  className?: string;
}) {
  return (
    <svg
      className={`bw-icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: solarIcons[name][variant] }}
    />
  );
}
