import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Booking Bot",
  description: "Auto-book tee times on BRS Golf",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
