import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createShadowClone } from './tools/create-shadow-clone.js';
import { executeOnClone } from './tools/execute-on-clone.js';
import { runGladiator } from './tools/run-gladiator.js';
import { generateScoreboard } from './tools/generate-scoreboard.js';
import { destroyShadowClone } from './tools/destroy-shadow-clone.js';
// ---------------------------------------------------------------------------
// Server instantiation
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: 'colosseum-mcp',
    version: '1.0.0',
});
// ---------------------------------------------------------------------------
// Tool: create_shadow_clone
// ---------------------------------------------------------------------------
server.tool('create_shadow_clone', 'Creates an isolated Neon DB branch (shadow clone) for chaos simulation.', {
    connection_string: z.string(),
    branch_name: z.string(),
}, async ({ connection_string, branch_name }) => {
    const result = await createShadowClone(connection_string, branch_name);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
// ---------------------------------------------------------------------------
// Tool: execute_on_clone
// ---------------------------------------------------------------------------
server.tool('execute_on_clone', 'Executes a SQL command against a Neon shadow clone (branch URL).', {
    clone_url: z.string(),
    sql_command: z.string(),
}, async ({ clone_url, sql_command }) => {
    const result = await executeOnClone(clone_url, sql_command);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
// ---------------------------------------------------------------------------
// Tool: run_gladiator
// ---------------------------------------------------------------------------
server.tool('run_gladiator', 'Dispatches a single Gladiator sub-agent to attack the shadow clone.', {
    gladiator_id: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
    ]),
    clone_url: z.string(),
    original_command: z.string(),
}, async ({ gladiator_id, clone_url, original_command }) => {
    const result = await runGladiator(gladiator_id, clone_url, original_command);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
// ---------------------------------------------------------------------------
// Tool: generate_scoreboard
// ---------------------------------------------------------------------------
server.tool('generate_scoreboard', 'Aggregates Gladiator results into a gamified ASCII-art scoreboard report.', {
    gladiator_results: z.array(z.object({
        gladiator_name: z.string(),
        survived: z.boolean(),
        damage_report: z.string(),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
    })),
    original_command: z.string(),
    developer_id: z.string(),
    branch_id: z.string().optional(),
}, async ({ gladiator_results, original_command, developer_id, branch_id }) => {
    const result = generateScoreboard(gladiator_results, original_command, developer_id, branch_id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
// ---------------------------------------------------------------------------
// Tool: destroy_shadow_clone
// ---------------------------------------------------------------------------
server.tool('destroy_shadow_clone', 'Destroys a Neon DB branch shadow clone after simulation is complete.', {
    branch_id: z.string(),
}, async ({ branch_id }) => {
    const result = await destroyShadowClone(branch_id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
// ---------------------------------------------------------------------------
// Tool: run_colosseum  (Task 10.2 — full orchestration in a single call)
// ---------------------------------------------------------------------------
/**
 * Fallback GladiatorResult used when a gladiator promise is rejected.
 */
function fallbackResult(gladiator_id, err) {
    return {
        gladiator_name: `Gladiator ${gladiator_id}`,
        survived: false,
        damage_report: `Gladiator crashed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'critical',
    };
}
/**
 * Full orchestration pipeline:
 *   1. Create shadow clone
 *   2. Execute SQL on clone
 *   3. Run all 5 Gladiators in parallel
 *   4. Generate scoreboard
 *   5. Destroy shadow clone (always, via finally)
 */
async function orchestrate(connection_string, sql_command, developer_id) {
    // Step 1 — create shadow clone
    const clone = await createShadowClone(connection_string, 'colosseum-' + Date.now());
    // Step 2 — bail early if clone creation failed
    if (clone.status === 'failed') {
        const errorResult = generateScoreboard([
            {
                gladiator_name: 'Shadow Clone',
                survived: false,
                damage_report: 'Failed to create shadow clone — simulation aborted.',
                severity: 'critical',
            },
        ], sql_command, developer_id, 'none');
        return errorResult.markdown_report;
    }
    const { clone_url, branch_id } = clone;
    try {
        // Step 3 — execute the SQL command on the clone
        try {
            await executeOnClone(clone_url, sql_command);
        }
        catch (execErr) {
            console.error('[run_colosseum] execute_on_clone error (continuing):', execErr);
        }
        // Step 4 — run all 5 Gladiators in parallel
        const settled = await Promise.allSettled([
            runGladiator(1, clone_url, sql_command),
            runGladiator(2, clone_url, sql_command),
            runGladiator(3, clone_url, sql_command),
            runGladiator(4, clone_url, sql_command),
            runGladiator(5, clone_url, sql_command),
        ]);
        // Step 5 — collect results, using fallback for any rejected promises
        const gladiatorResults = settled.map((outcome, idx) => {
            if (outcome.status === 'fulfilled') {
                return outcome.value;
            }
            return fallbackResult(idx + 1, outcome.reason);
        });
        // Step 6 — generate scoreboard
        const scoreboard = generateScoreboard(gladiatorResults, sql_command, developer_id, branch_id);
        return scoreboard.markdown_report;
    }
    finally {
        // Step 7 — always destroy the shadow clone
        await destroyShadowClone(branch_id);
    }
}
server.tool('run_colosseum', 'Runs the full Colosseum pipeline: creates a shadow clone, executes the SQL, unleashes all 5 Gladiators in parallel, renders the scoreboard, and destroys the clone.', {
    connection_string: z.string(),
    sql_command: z.string(),
    developer_id: z.string(),
}, async ({ connection_string, sql_command, developer_id }) => {
    const markdown = await orchestrate(connection_string, sql_command, developer_id);
    return { content: [{ type: 'text', text: markdown }] };
});
// ---------------------------------------------------------------------------
// Connect transport and start server
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map