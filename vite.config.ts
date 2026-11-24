import { networkInterfaces } from "node:os";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";

// With --host, tell the host screen which address phones on the Wi-Fi can use.
function lanHost() {
  const addresses = Object.values(networkInterfaces()).flatMap(list => list ?? [])
    .filter(a => a.family === "IPv4" && !a.internal).map(a => a.address);
  return addresses.find(a => a.startsWith("192.168.")) ??
    addresses.find(a => /^(10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) ?? "";
}

export default defineConfig(({ command }) => ({
  define: {
    "import.meta.env.VITE_LAN_HOST": JSON.stringify(
      command === "serve" && process.argv.some(a => a === "--host" || a.startsWith("--host=")) ? lanHost() : ""),
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
}));
