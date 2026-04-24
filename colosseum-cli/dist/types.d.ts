/**
 * Shared types for the colosseum-cli package.
 */
export interface GladiatorResult {
    gladiator_name: string;
    survived: boolean;
    damage_report: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
}
export interface Vulnerability {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    line: number;
    description: string;
    snippet: string;
}
export interface ScanReport {
    file_path: string;
    vulnerabilities: Vulnerability[];
    overall_severity: 'low' | 'medium' | 'high' | 'critical' | 'clean';
    markdown_report: string;
}
export interface ShadowClone {
    clone_url: string;
    branch_id: string;
    status: 'ready' | 'failed';
}
/** The full result payload sent to the arena HTML page. */
export interface ArenaResult {
    sql_command: string;
    developer_id: string;
    branch_id: string;
    overall_severity: 'low' | 'medium' | 'high' | 'critical';
    gladiator_results: GladiatorResult[];
    survivors: string[];
    casualties: string[];
}
//# sourceMappingURL=types.d.ts.map