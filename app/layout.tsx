import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIU Notice Tracker",
  description:
    "Track and analyze official notices from Daffodil International University departments",
};

// Runs before hydration — sets data-theme immediately so there's no flash
// from default (dark) to the user's actual saved/preferred theme.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("notice-tracker-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read cookie on the server to render a matching `data-theme` attribute
  // and avoid hydration mismatches. `cookies()` must be awaited in this
  // runtime according to Next.js warnings.
  let ssrTheme: "light" | "dark" | undefined;
  try {
    const cookieStore = await cookies();
    const themeCookie = cookieStore.get("notice-tracker-theme")?.value;
    if (themeCookie === "dark" || themeCookie === "light") {
      ssrTheme = themeCookie;
    }
  } catch (e) {
    // ignore and fall back to client-side init
  }

  return (
    <html lang="en" className={inter.variable} data-theme={ssrTheme}>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          // eslint-disable-next-line react/no-danger
        />
      </head>
      <body>{children}</body>
    </html>
  );
}