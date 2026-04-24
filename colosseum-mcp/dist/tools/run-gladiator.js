import { stampede } from '../gladiators/stampede.js';
import { cascade } from '../gladiators/cascade.js';
import { injector } from '../gladiators/injector.js';
import { loadBreaker } from '../gladiators/load-breaker.js';
import { rollbackReaper } from '../gladiators/rollback-reaper.js';
/**
 * Dispatches to the correct Gladiator sub-agent based on `gladiator_id`.
 * Returns the `GladiatorResult` from the dispatched Gladiator.
 * Catches unhandled errors and returns a critical failure result.
 */
export async function runGladiator(gladiator_id, clone_url, original_command) {
    try {
        switch (gladiator_id) {
            case 1:
                return await stampede(clone_url, original_command);
            case 2:
                return await cascade(clone_url, original_command);
            case 3:
                return await injector(clone_url, original_command);
            case 4:
                return await loadBreaker(clone_url, original_command);
            case 5:
                return await rollbackReaper(clone_url, original_command);
        }
    }
    catch (err) {
        return {
            gladiator_name: `Gladiator ${gladiator_id}`,
            survived: false,
            damage_report: `Unhandled error in gladiator dispatch: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'critical',
        };
    }
}
//# sourceMappingURL=run-gladiator.js.map