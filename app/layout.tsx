import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostgreSQL Simulator",
  description: "Practice SQL with a simulated PostgreSQL database stored in localStorage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
