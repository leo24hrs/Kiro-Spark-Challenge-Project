/**
 * MCP tool: create_shadow_clone
 * Creates an isolated Neon DB branch (shadow clone) for simulation.
 */
import { ShadowClone } from '../types.js';
/**
 * Creates a Neon branch shadow clone for the given connection string and branch name.
 *
 * @param connection_string - The original database connection string (used as context)
 * @param branch_name       - Desired name for the new Neon branch
 * @returns ShadowClone with clone_url, branch_id, and status
 */
export declare function createShadowClone(connection_string: string, branch_name: string): Promise<ShadowClone>;
//# sourceMappingURL=create-shadow-clone.d.ts.map