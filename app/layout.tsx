// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PromoFeed",
  description: "Your personal promotional email feed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        pb-14 on mobile gives the content room above the fixed bottom nav bar.
        sm:pb-0 removes it on larger screens where the sidebar is used instead.
      */}
      <body className="min-h-full flex flex-col pb-14 sm:pb-0">{children}</body>
    </html>
  );
}
