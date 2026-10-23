import mark from "../assets/brand/mark.svg";
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <img src={mark} width={size} height={size} alt="" aria-hidden="true" />
  );
}
export function BotanicalAccent() {
  return (
    <svg
      className="bw-botanical"
      viewBox="0 0 120 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M61 105 66 30M65 80 31 55M64 64 95 44"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M64 48C43 29 58 5 72 4c13 13 10 35-8 44ZM52 80C27 82 14 62 19 43c21-3 38 13 33 37ZM69 88c-3-27 18-47 37-45 4 26-15 47-37 45Z"
        fill="currentColor"
      />
    </svg>
  );
}
