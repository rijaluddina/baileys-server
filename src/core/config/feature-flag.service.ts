import { logger } from "@infrastructure/logger";

class FeatureFlagService {
    private flags: Map<string, boolean> = new Map();
    private log = logger.child({ component: "feature-flags" });

    /**
     * Checks if a specific feature flag is enabled.
     * @param flagName The name of the flag to check (e.g. "mcp:tool:send_text_message")
     * @param defaultValue The default value if the flag is not explicitly set
     */
    public isFeatureEnabled(flagName: string, defaultValue = true): boolean {
        return this.flags.has(flagName) ? this.flags.get(flagName)! : defaultValue;
    }

    /**
     * Sets a feature flag explicitly at runtime.
     * @param flagName The name of the flag to set
     * @param value The boolean value
     */
    public setFlag(flagName: string, value: boolean): void {
        this.flags.set(flagName, value);
        this.log.info({ flagName, value }, "Feature flag updated");
    }
}

// Export singleton instance
export const featureFlagService = new FeatureFlagService();
