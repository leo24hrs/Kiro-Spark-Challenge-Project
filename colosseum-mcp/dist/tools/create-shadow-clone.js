/**
 * MCP tool: create_shadow_clone
 * Creates an isolated Neon DB branch (shadow clone) for simulation.
 */
import { createBranch } from '../neon/api-client.js';
/**
 * Creates a Neon branch shadow clone for the given connection string and branch name.
 *
 * @param connection_string - The original database connection string (used as context)
 * @param branch_name       - Desired name for the new Neon branch
 * @returns ShadowClone with clone_url, branch_id, and status
 */
export async function createShadowClone(connection_string, branch_name) {
    const projectId = process.env['NEON_PROJECT_ID'];
    if (!projectId) {
        console.error('[create-shadow-clone] NEON_PROJECT_ID environment variable is not set');
        return { clone_url: '', branch_id: '', status: 'failed' };
    }
    try {
        const { branch_id, connection_string: clone_url } = await createBranch(projectId, branch_name);
        return { clone_url, branch_id, status: 'ready' };
    }
    catch (err) {
        // Log the raw error to stderr for debugging, but do not expose it to callers
        console.error('[create-shadow-clone] Failed to create branch:', err);
        return { clone_url: '', branch_id: '', status: 'failed' };
    }
}
//# sourceMappingURL=create-shadow-clone.js.map