/** Recognize operation failures without changing existing result shapes. */
export function hasFailures(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasFailures);
  const result = value as Record<string, any>;
  return (typeof result.failed === 'number' && result.failed > 0)
    || result.identity_match === false
    || (result.pat?.valid === false && result.cookie?.valid === false)
    || result.discovery?.complete === false
    || (Array.isArray(result.execution_blockers) && result.execution_blockers.length > 0)
    || (typeof result.unknown === 'number' && result.unknown > 0)
    || result.status === 'failed' || result.status === 'blocked' || result.status === 'unknown'
    || (!!result.errors && typeof result.errors === 'object' && Object.keys(result.errors).length > 0)
    || hasFailures(result.status) || hasFailures(result.summary) || hasFailures(result.actions)
    || hasFailures(result.setup_results?.teams_joined) || hasFailures(result.setup_results?.files_shared)
    || hasFailures(result.setup_results?.seat_change);
}

export function errorCode(message: string): string {
  if (/outcome unknown/i.test(message)) return 'outcome_unknown';
  if (/confirm|noninteractive|cancelled/i.test(message)) return 'confirmation_required';
  if (/not authenticated|\bauth\b|\bauthentication\b|\bPAT\b|\bcookie\b|\bcredentials?\b|personal access token/i.test(message)) return 'authentication_required';
  if (/permission|forbidden/i.test(message)) return 'permission_denied';
  if (/rate limit/i.test(message)) return 'rate_limited';
  if (/invalid|must be|required|unknown option/i.test(message)) return 'invalid_input';
  if (/not found/i.test(message)) return 'not_found';
  return 'operation_failed';
}
