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

  return {
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
