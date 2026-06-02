import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // Allow access via Cloudflare quick-tunnels (the leading dot is Vite's
    // subdomain-wildcard syntax) so a fresh `*.trycloudflare.com` URL on every
    // `cloudflared tunnel --url ...` invocation still works without editing config.
    allowedHosts: ['.trycloudflare.com'],
  },
});
