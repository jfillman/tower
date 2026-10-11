// A notification's or the queue's link to one break-glass session: /tower?entity=<ref>&tab=topology&env=<env>&breakglass=<id>.
// TopologyTab reads env as before; breakglass names the session to open and highlight (gap G1).

/** Session ids are 12 lowercase base-36 characters (breakglassSpec.newSessionId); anything else is not a link to follow. */
const SESSION_ID = /^[a-z0-9]{12}$/;

export function breakglassDeepLink(params: Pick<URLSearchParams, 'get'>): { env?: string; sessionId?: string } {
  const env = params.get('env') ?? undefined;
  const id = params.get('breakglass');
  return { ...(env ? { env } : {}), ...(id && SESSION_ID.test(id) ? { sessionId: id } : {}) };
}
