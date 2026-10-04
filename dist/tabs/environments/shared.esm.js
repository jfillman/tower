const BLOCK_FIELDS = {
  lambda: ["functionName", "region"],
  ecs: ["cluster", "service", "containerName", "region", "taskDefinitionFamily"],
  azureContainerApps: ["resourceGroup", "appName"]
};
const MAIN_FIELD = { lambda: "functionName", ecs: "service", azureContainerApps: "appName" };
const TARGET_BLOCK = {
  "aws-ecs": "ecs",
  "aws-lambda": "lambda",
  "azure-container-apps": "azureContainerApps"
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export { BLOCK_FIELDS, MAIN_FIELD, TARGET_BLOCK, same };
//# sourceMappingURL=shared.esm.js.map
