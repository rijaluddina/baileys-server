import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/setup.ts"],
        coverage: {
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts", "src/index.ts"],
        },
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            "@core": path.resolve(__dirname, "./src/core"),
            "@adapters": path.resolve(__dirname, "./src/adapters"),
            "@infrastructure": path.resolve(__dirname, "./src/infrastructure"),
        },
    },
});
