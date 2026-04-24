/**
 * MCP tool: destroy_shadow_clone
 * Deletes a Neon DB branch (shadow clone) after simulation is complete.
 */
/**
 * Destroys a Neon branch shadow clone by branch ID.
 *
 * @param branch_id - The Neon branch ID to delete
 * @returns `{ status: "destroyed" | "failed" }`
 */
export declare function destroyShadowClone(branch_id: string): Promise<{
    status: 'destroyed' | 'failed';
}>;
//# sourceMappingURL=destroy-shadow-clone.d.ts.map