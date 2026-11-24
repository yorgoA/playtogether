import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayTogether · Game Hub",
  description: "Choose a multiplayer game, connect your phones, and play together on one screen.",
  icons: {icon: "/favicon.svg"}
};
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>
}
