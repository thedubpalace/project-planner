import type { Metadata } from "next";
import { Inter, Sarabun, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ToastProvider } from "@/components/ui";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});
const jetbrains = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "project-planner",
  description: "PM planning — task estimation, auto resource matching, timeline impact",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${sarabun.variable} ${jetbrains.variable}`}>
      <body>
        <ToastProvider>
          <Navbar />
          <main>{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
