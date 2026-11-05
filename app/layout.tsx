import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "@/styles/globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Everybird",
  description: "Every bird you've ever seen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistMono.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        {/* Satoshi and Cabinet Grotesk come from Fontshare; never commit the files. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&f[]=cabinet-grotesk@700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
