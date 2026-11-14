import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Chakra_Petch, Outfit } from "next/font/google";
import { getCurrentUser } from "@/lib/auth/server";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { SocketProvider } from "@/components/providers/SocketProvider";
import { Navbar } from "@/components/layout/Navbar";
import { ENABLED_ANIME } from "@/data/anime";
import "./globals.css";

const display = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-chakra" });
const body = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: { default: "Anime Auction — Real-time character auctions", template: "%s · Anime Auction" },
  description:
    "Two players, $20 each, one live auction. Bid in real time for characters from Naruto, Boruto, One Piece, Black Clover, Bleach and Tokyo Revengers.",
};

export const viewport: Viewport = {
  themeColor: "#050308",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="app-backdrop" aria-hidden />
        <SessionProvider user={user}>
          <SocketProvider>
            <Navbar />
            <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-7xl px-4 pb-20 pt-8">{children}</main>
            <footer className="border-t border-white/5 py-8 text-sm text-zinc-500">
              <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 md:flex-row md:items-center md:justify-between">
                <p>
                  Anime Auction · virtual currency only — no real money, deposits or withdrawals.
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1">
                  {ENABLED_ANIME.map((a) => (
                    <Link key={a.id} href={`/characters?anime=${a.id}`} className="hover:text-zinc-300" style={{ color: `${a.color}cc` }}>
                      {a.shortName}
                    </Link>
                  ))}
                </p>
              </div>
              <p className="mx-auto mt-3 max-w-7xl px-4 text-xs text-zinc-600">
                Character names and artwork belong to their respective creators and publishers. Artwork provided via AniList.
              </p>
            </footer>
          </SocketProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
