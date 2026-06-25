/** @type {import('next').NextConfig} */
const nextConfig = {
  // The v0 preview is served from a cross-origin iframe (*.vusercontent.net /
  // *.vercel.run). Next.js 16 blocks cross-origin dev resources (HMR + client
  // chunks) by default, which prevents the client bundle from hydrating and
  // makes every button/click handler dead. Allow these dev origins so the
  // preview hydrates and interactivity works.
  allowedDevOrigins: ["*.vusercontent.net", "*.vercel.run", "*.v0.dev", "*.v0.app"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "www.adairs.com.au", pathname: "/globalassets/**" },
    ],
  },
}

export default nextConfig
