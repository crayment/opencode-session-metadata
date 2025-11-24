import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { promises as fs } from "fs";
import path from "path";

/**
 * OpenCode Session Metadata Plugin
 * 
 * Store and retrieve arbitrary JSON metadata for OpenCode sessions.
 * Useful for tracking context, state, or relationships between sessions.
 */
export const SessionMetadataPlugin: Plugin = async ({ client, directory }) => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "~";
  
  const getMetadataPath = (projectId: string, sessionId: string) => {
    return path.join(homeDir, ".local", "share", "opencode", "storage", "session-metadata", projectId, `${sessionId}.json`);
  };

  const ensureStorageDir = async (projectId: string) => {
    const dir = path.join(homeDir, ".local", "share", "opencode", "storage", "session-metadata", projectId);
    await fs.mkdir(dir, { recursive: true });
  };

  // Unique marker to prevent recursive injection and provide visibility
  const INJECTION_START_MARKER = "# <opencode-session-metadata-setup>";
  const INJECTION_END_MARKER = "# </opencode-session-metadata-setup>";

  return {
    /**
     * Inject session context into bash tool environment
     * This makes agents "self-aware" without needing to call tools first
     * Inlines environment variables with clear markers for visibility
     * 
     * Note: Unix-only (macOS/Linux). Windows support is not currently implemented
     * due to complexities with cmd.exe/PowerShell environment handling.
     */
    "tool.execute.before": async (input, output) => {
      // Only modify bash tool calls (works with any shell: sh, bash, zsh, etc.)
      if (input.tool !== "bash") return;
      
      // Skip on Windows - not supported yet
      if (process.platform === "win32") return;
      
      const originalCommand = output.args.command;
      
      // Skip if already processed (prevent recursive injection)
      if (originalCommand.includes(INJECTION_START_MARKER)) return;
      
      // Inline environment variable injection with clear markers
      const envSetup = `${INJECTION_START_MARKER}
export OPENCODE_SESSION_ID="${input.sessionID}"
export OPENCODE_WORKSPACE_ROOT="${directory}"
export OPENCODE_SERVER="http://127.0.0.1:50154"
${INJECTION_END_MARKER}`;
      
      // Prepend environment setup before user's command
      output.args.command = `${envSetup}\n${originalCommand}`;
    },

    tool: {
      getSessionData: tool({
        description: "Get current session information (id, title, directory, version, etc.)",
        args: {},
        async execute(args, ctx) {
          const response = await client.session.get({ 
            path: { id: ctx.sessionID },
            query: { directory }
          });
          
          if (response.data) {
            return JSON.stringify(response.data, null, 2);
          } else {
            return `Error retrieving session data: ${JSON.stringify(response.error, null, 2)}`;
          }
        },
      }),

      setSessionData: tool({
        description: "Update session data. Currently supports setting title only.",
        args: {
          title: tool.schema.string().describe("New session title"),
        },
        async execute({ title }, ctx) {
          try {
            await client.session.update({
              path: { id: ctx.sessionID },
              query: { directory },
              body: { title },
            });
            
            return `Session updated successfully

Session ID: ${ctx.sessionID}
New title: ${title}`;
          } catch (error) {
            return `Error updating session: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),

      getMetadata: tool({
        description: "Get stored session metadata from external storage. Returns any custom metadata that was previously stored.",
        args: {},
        async execute(args, ctx) {
          try {
            // Get session data to get projectID
            const sessionResponse = await client.session.get({ 
              path: { id: ctx.sessionID },
              query: { directory }
            });
            if (!sessionResponse.data) {
              return `Error: Could not retrieve session data to locate metadata`;
            }
            
            const projectId = (sessionResponse.data as any).projectID;
            const filePath = getMetadataPath(projectId, ctx.sessionID);
            
            const content = await fs.readFile(filePath, "utf-8");
            
            let metadata;
            try {
              metadata = JSON.parse(content);
            } catch (parseError) {
              return `Error: Metadata file exists but contains invalid JSON

File: ${filePath}
Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
            }
            
            return JSON.stringify(metadata, null, 2);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              return `No metadata found for session: ${ctx.sessionID}

Use the setMetadata tool to store custom data for this session.`;
            }
            return `Error reading metadata: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),

      setMetadata: tool({
        description: "Store arbitrary JSON metadata for this session. Accepts any JSON object with custom fields.",
        args: {
          metadata: tool.schema.record(tool.schema.string(), tool.schema.any()).describe("JSON object with custom metadata fields"),
        },
        async execute({ metadata }, ctx) {
          try {
            // Get session data to get projectID
            const sessionResponse = await client.session.get({ 
              path: { id: ctx.sessionID },
              query: { directory }
            });
            if (!sessionResponse.data) {
              return `Error: Could not retrieve session data to locate storage`;
            }
            
            const projectId = (sessionResponse.data as any).projectID;
            await ensureStorageDir(projectId);
            
            // Merge user metadata with required fields (required fields take precedence)
            const fullMetadata = {
              ...metadata,
              sessionId: ctx.sessionID,
              storedAt: new Date().toISOString(),
            };
            
            const filePath = getMetadataPath(projectId, ctx.sessionID);
            await fs.writeFile(filePath, JSON.stringify(fullMetadata, null, 2));
            
            return `Metadata stored successfully

${JSON.stringify(fullMetadata, null, 2)}`;
          } catch (error) {
            return `Error storing metadata: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
    },
  };
};

export default SessionMetadataPlugin;
