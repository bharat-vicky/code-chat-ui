import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight:  ["300", "400", "500", "600"],
  style:   ["normal", "italic"],
  variable: "--font-serif",
  display:  "swap",
});

const sans = DM_Sans({
  subsets:  ["latin"],
  weight:   ["300", "400", "500"],
  variable: "--font-sans",
  display:  "swap",
});

const mono = JetBrains_Mono({
  subsets:  ["latin"],
  weight:   ["300", "400", "500"],
  variable: "--font-mono",
  display:  "swap",
});

export const metadata: Metadata = {
  title: "Forge · Code Intelligence",
  description: "Premium AI coding assistant powered by code-1b-chat-v2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="bg-[#04060a] text-[#dde8f0] antialiased h-full">
        {children}
      </body>
    </html>
  );
}
