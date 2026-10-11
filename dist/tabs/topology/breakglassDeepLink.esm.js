const SESSION_ID = /^[a-z0-9]{12}$/;
function breakglassDeepLink(params) {
  const env = params.get("env") ?? void 0;
  const id = params.get("breakglass");
  return { ...env ? { env } : {}, ...id && SESSION_ID.test(id) ? { sessionId: id } : {} };
}

export { breakglassDeepLink };
//# sourceMappingURL=breakglassDeepLink.esm.js.map
