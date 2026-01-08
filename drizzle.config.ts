import type { Config } from "drizzle-kit";

export default {
    schema: "./src/infrastructure/database/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL || "postgres://localhost:5432/whatsapp",
    },
} satisfies Config;
