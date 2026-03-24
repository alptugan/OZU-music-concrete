import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [tailwindcss()],
    base: "/OZU-music-concrete/",
    build: {
        outDir: "dist",
    },
    server: {
        proxy: {
            "/api/gdrive": {
                target: "https://drive.usercontent.google.com",
                changeOrigin: true,
                rewrite: (path) => {
                    const url = new URL(path, "http://localhost");
                    const fileId = url.searchParams.get("id");
                    return `/download?id=${fileId}&export=download&confirm=t`;
                },
            },
        },
    },
});
