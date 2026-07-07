import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIU Notice Tracker",
  description:
    "Track and analyze official notices from Daffodil International University departments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
