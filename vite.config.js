import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages project pages: base must match your repo name.
// If you change the repo name, update this AND the workflow concurrency
// path will continue to work since it doesn't depend on the name.
// Final URL will be:  https://<user>.github.io/<repo>/
export default defineConfig({
  plugins: [react()],
  base: "/sg-property-affordability/",
});
