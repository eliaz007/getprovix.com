import { ImageResponse } from "next/og";

export const alt = "Provix — Verified Candidate Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#818CF8",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 6,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#18181B",
              border: "1px solid #27272A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#818CF8",
              fontSize: 26,
              letterSpacing: 0,
            }}
          >
            P
          </div>
          PROVIX
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              color: "#f8fafc",
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -1.5,
              maxWidth: 900,
            }}
          >
            Verified Candidate Intelligence
          </div>
          <div
            style={{
              color: "#a1a1aa",
              fontSize: 28,
              lineHeight: 1.4,
              maxWidth: 820,
            }}
          >
            Proof-of-work screening, AI GitHub audits, and structured
            candidate scoring for technical hiring.
          </div>
        </div>
      </div>
    ),
    size
  );
}
