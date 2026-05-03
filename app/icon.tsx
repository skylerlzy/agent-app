import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, hsl(168 58% 42%), hsl(195 70% 48%))",
          color: "hsl(0 0% 100%)",
          fontSize: 18,
          fontWeight: 600,
          borderRadius: 8,
        }}
      >
        A
      </div>
    ),
    { ...size }
  );
}
