/**
 * Neon Branching API client.
 * Uses native fetch (Node 20+) with Bearer token auth.
 */
/**
 * Typed error thrown on non-2xx responses from the Neon API.
 */
export declare class NeonApiError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode: number);
}
/**
 * Creates a new Neon branch under the given project.
 *
 * @param projectId      - Neon project ID
 * @param branchName     - Desired name for the new branch
 * @param parentBranchId - Optional parent branch ID (defaults to project default branch)
 * @returns `{ branch_id, connection_string }`
 */
export declare function createBranch(projectId: string, branchName: string, parentBranchId?: string): Promise<{
    branch_id: string;
    connection_string: string;
}>;
/**
 * Deletes a Neon branch from the given project.
 *
 * @param projectId - Neon project ID
 * @param branchId  - ID of the branch to delete
 * @returns `{ status: "deleted" }`
 */
export declare function deleteBranch(projectId: string, branchId: string): Promise<{
    status: string;
}>;
//# sourceMappingURL=api-client.d.ts.map