import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@crewbrain/graph"],
  serverExternalPackages: ["falkordb"],
};

export default config;
