import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "songreq",
    short_name: "songreq",
    description: "ให้ลูกค้าขอเพลงผ่าน QR และดูคำขอบนจอระหว่างเล่น",
    lang: "th",
    start_url: "/dashboard/requests",
    display: "standalone",
    background_color: "#14110F",
    theme_color: "#14110F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
