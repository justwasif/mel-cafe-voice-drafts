import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Northwind Supply Co.",
  description: "Premium outdoor apparel — built for the trail, designed for everyday.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FAF8F4] text-[#1C1C1A] font-sans">
        {children}
      </body>
    </html>
  );
}
