import pg from 'pg';
import type { GladiatorResult } from '../types.js';

/**
 * The Injector — SQL injection surface probe.
 * Wraps the original command with common injection payloads and counts
 * how many execute without a PostgreSQL error.
 */
export async function injector(
  clone_url: string,
  original_command: string
): Promise<GladiatorResult> {
  const client = new pg.Client({ connectionString: clone_url });

  try {
    await client.connect();

    const payloads: string[] = [
      original_command + " OR '1'='1'",
      original_command + '; SELECT 1--',
      original_command + ' UNION SELECT NULL--',
      original_command + '/**/',
      "'; " + original_command + '; --',
    ];

    let successfulInjections = 0;

    for (const payload of payloads) {
      try {
        await client.query(payload);
        // If no error thrown, the injection executed successfully
        successfulInjections++;
      } catch {
        // PostgreSQL error — injection was rejected
      }
    }

    let survived: boolean;
    let severity: GladiatorResult['severity'];

    if (successfulInjections === 0) {
      survived = true;
      severity = 'low';
    } else if (successfulInjections <= 2) {
      survived = false;
      severity = 'medium';
    } else if (successfulInjections <= 4) {
      survived = false;
      severity = 'high';
    } else {
      survived = false;
      severity = 'critical';
    }

    const surfaceNote =
      successfulInjections > 0 ? ' SQL injection surface detected.' : '';
    const damage_report = `${payloads.length} injection payloads tested. ${successfulInjections} executed successfully.${surfaceNote}`;

    return {
      gladiator_name: 'The Injector',
      survived,
      damage_report,
      severity,
    };
  } catch (err) {
    return {
      gladiator_name: 'The Injector',
      survived: false,
      damage_report: `Injector encountered a critical error: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
    };
  } finally {
    await client.end();
  }
}
