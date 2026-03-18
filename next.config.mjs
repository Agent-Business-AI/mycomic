/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["comic"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.llamagen.ai",
      },
    ],
  },
};

export default nextConfig;
