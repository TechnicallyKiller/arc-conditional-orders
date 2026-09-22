import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { NetworkProvider } from "./lib/network";

const sans = Instrument_Sans({
  subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"],
  variable: "--font-sans", display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"], weight: ["400"], style: ["normal", "italic"],
  variable: "--font-serif", display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500"],
  variable: "--font-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "Arc Conditional Orders",
  description:
    "Stop-loss and take-profit orders for Arc. The contract refuses any fill whose fee cannot cover its own gas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <NetworkProvider>{children}</NetworkProvider>
      </body>
    </html>
  );
}
