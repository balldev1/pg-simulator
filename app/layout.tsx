import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostgreSQL Simulator — Practice SQL in the Browser",
  description:
    "Practice SQL with a PostgreSQL simulator that runs entirely in the browser. Supports SELECT, JOIN, INSERT, UPDATE, DELETE, CREATE TABLE, and more — no installation required.",
  keywords: [
    "postgresql",
    "sql simulator",
    "sql practice",
    "learn sql",
    "sql online",
    "left join",
    "sql tutorial",
    "database practice",
  ],
  authors: [{ name: "PG Simulator" }],
  openGraph: {
    title: "PostgreSQL Simulator — Practice SQL in the Browser",
    description:
      "Practice SQL in the browser with no setup. Supports SELECT, JOIN, INSERT, UPDATE, DELETE, and CREATE TABLE.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "PostgreSQL Simulator" }],
  },
  twitter: {
    card: "summary",
    title: "PostgreSQL Simulator",
    description: "Practice SQL in the browser — no installation required.",
    images: ["/logo.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
