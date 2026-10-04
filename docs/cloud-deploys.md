# Cloud deploys

A service whose `hangar.io/deploy-target` is `aws-ecs`, `aws-lambda` or `azure-container-apps` has no Argo
Rollout, so the Kubernetes Deployments tab has nothing to show. It gets the cloud variant of the same tab
instead. The two share the id `deployments` and are told apart by capability (`k8s-runtime` or
`cloud-runtime`); a service has one target, so it never gets both.

## Where the data comes from

Tower reads no cloud API and holds no cloud credential. Everything comes from the Tekton run Glidepath
already makes for the deploy stage (the `deploy` pipeline in `app-<name>-cicd`), which Tower already reads
for the Pipelines tab:

| What | Where |
|---|---|
| target | result `target` of the `resolve-deploy-target` task (falls back to which `deploy-aws-*` task exists) |
| resource, region | `config-json` result of `resolve-deploy-target`: `deploy.ecs`, `deploy.lambda` or `deploy.azureContainerApps` |
| image and commit | result `image-ref` of `resolve-image-ref`; the commit is the tag's trailing hex |
| environment | `env` param of the cloud task |
| outcome, timing | the PipelineRun's conditions and times |
| failure | the first failed task, preferring the cloud one, and Tekton's message for it |

Both resolve tasks publish early, so a deploy shows its target and resource while it is still running.

## What the tab shows

The target and resource with a link to the AWS console (Azure opens the Container Apps list, since its portal
URL needs a subscription id Tower does not have), the last successful deploy, a deploy in progress, a latest
failure that nothing newer has fixed (with a note that the cloud may still run the previous image), and a
history table whose rows open the run in the Pipelines tab.

## What it does not show

Whether the service is healthy. It cannot see ECS running counts, a Lambda's state, or a Container App's
revision status. A deploy that succeeded means the update was accepted and the wait finished, not that the
service is serving. Reading live state needs a read-only cloud identity that Tower does not have; if it is
added, it should be a backend route with its own credential, never the browser.

The Tekton pruner removes old runs, so history is only as long as the cluster keeps them.

Tested against a real ECS deploy captured from the cluster (`src/__fixtures__/cloudDeployRuns.json`) with
variants for failure, in-progress, Lambda, Azure and a Kubernetes deploy. The Lambda and Azure shapes are
derived by editing that run, not captured from real ones.
