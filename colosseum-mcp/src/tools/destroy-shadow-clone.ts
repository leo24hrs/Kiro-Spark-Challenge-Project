/**
 * MCP tool: destroy_shadow_clone
 * Deletes a Neon DB branch (shadow clone) after simulation is complete.
 */

import { deleteBranch } from '../neon/api-client.js';

/**
 * Destroys a Neon branch shadow clone by branch ID.
 *
 * @param branch_id - The Neon branch ID to delete
 * @returns `{ status: "destroyed" | "failed" }`
 */
export async function destroyShadowClone(
  branch_id: string,
): Promise<{ status: 'destroyed' | 'failed' }> {
  const projectId = process.env['NEON_PROJECT_ID'];

  if (!projectId) {
    console.error('[destroy-shadow-clone] NEON_PROJECT_ID environment variable is not set');
    return { status: 'failed' };
  }

  try {
    await deleteBranch(projectId, branch_id);
    console.error(`[destroy-shadow-clone] Branch ${branch_id} destroyed.`);
    return { status: 'destroyed' };
  } catch (err) {
    console.error(`[destroy-shadow-clone] Failed to destroy branch ${branch_id}:`, err);
    return { status: 'failed' };
  }
}
