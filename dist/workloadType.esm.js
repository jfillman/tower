const APP_TIER_KIND_TAGS = /* @__PURE__ */ new Set([
  "kind:nodejsapplication",
  "kind:springbootapplication",
  "kind:pythonapplication",
  "kind:goapplication"
]);
function isAppTierEntity(entity) {
  return (entity.metadata.tags ?? []).some((t) => APP_TIER_KIND_TAGS.has(t));
}

export { isAppTierEntity };
//# sourceMappingURL=workloadType.esm.js.map
