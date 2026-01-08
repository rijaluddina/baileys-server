#!/usr/bin/env bun
/**
 * MCP Server Entry Point
 * 
 * Run this script to start the MCP server for LangGraph/Agent integration.
 * The server communicates via stdio (stdin/stdout).
 * 
 * Usage:
 *   bun run src/mcp.ts
 * 
 * Or add to package.json scripts:
 *   "mcp": "bun run src/mcp.ts"
 */

import { startMcpServer } from "@adapters/mcp";

startMcpServer().catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
});
