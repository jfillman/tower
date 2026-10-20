const APP_TIER_KIND_TAGS = /* @__PURE__ */ new Set([
  "kind:nodejsapplication",
  "kind:springbootapplication",
  "kind:pythonapplication",
  "kind:goapplication"
]);
function isAppTierEntity(entity) {
  return (entity.metadata.tags ?? []).some((t) => APP_TIER_KIND_TAGS.has(t));
}
function appKindOf(entity) {
  const tag = (entity?.metadata.tags ?? []).find((t) => APP_TIER_KIND_TAGS.has(t));
  return tag?.slice("kind:".length);
}

export { appKindOf, isAppTierEntity };
//# sourceMappingURL=workloadType.esm.js.map
