/**
 * Neon Branching API client.
 * Uses native fetch (Node 20+) with Bearer token auth.
 */
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
/**
 * Typed error thrown on non-2xx responses from the Neon API.
 */
export class NeonApiError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.name = 'NeonApiError';
        this.statusCode = statusCode;
    }
}
/**
 * Returns the Authorization header using NEON_API_KEY from the environment.
 * Throws if the key is not set.
 */
function authHeader() {
    const key = process.env['NEON_API_KEY'];
    if (!key) {
        throw new NeonApiError('NEON_API_KEY environment variable is not set', 401);
    }
    return `Bearer ${key}`;
}
/**
 * Asserts a fetch Response is 2xx; throws NeonApiError otherwise.
 */
async function assertOk(response) {
    if (!response.ok) {
        let message = `Neon API error: ${response.status} ${response.statusText}`;
        try {
            const body = (await response.json());
            if (body.message) {
                message = `Neon API error: ${body.message} (${response.status})`;
            }
        }
        catch {
            // ignore JSON parse failures — use the status-based message
        }
        throw new NeonApiError(message, response.status);
    }
}
/**
 * Creates a new Neon branch under the given project.
 *
 * @param projectId      - Neon project ID
 * @param branchName     - Desired name for the new branch
 * @param parentBranchId - Optional parent branch ID (defaults to project default branch)
 * @returns `{ branch_id, connection_string }`
 */
export async function createBranch(projectId, branchName, parentBranchId) {
    const body = {
        branch: { name: branchName },
        endpoints: [{ type: 'read_write' }],
    };
    if (parentBranchId) {
        body['branch']['parent_id'] = parentBranchId;
    }
    const response = await fetch(`${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches`, {
        method: 'POST',
        headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    await assertOk(response);
    const data = (await response.json());
    const branch_id = data.branch.id;
    const connection_string = data.connection_uris?.[0]?.connection_uri ?? '';
    return { branch_id, connection_string };
}
/**
 * Deletes a Neon branch from the given project.
 *
 * @param projectId - Neon project ID
 * @param branchId  - ID of the branch to delete
 * @returns `{ status: "deleted" }`
 */
export async function deleteBranch(projectId, branchId) {
    const response = await fetch(`${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`, {
        method: 'DELETE',
        headers: {
            Authorization: authHeader(),
        },
    });
    await assertOk(response);
    return { status: 'deleted' };
}
//# sourceMappingURL=api-client.js.map