import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Crewbrain", description: "Shared memory graph for a crew of AI agents" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
