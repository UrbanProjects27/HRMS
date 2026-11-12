import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huma — Attendance & Leave Management",
  description: "A modern HR workspace for attendance, leave and employee insights.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
