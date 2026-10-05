import { analysisProblems, templateRefs } from './analysis';

const pre = { rollout: { canaryAnalysis: { templates: [{ templateName: 'pod-health-check' }], startingStep: 2 } } };

describe('templateRefs', () => {
  it('finds references in steps, canaryAnalysis and the blueGreen promotion analyses, with their scope', () => {
    const refs = templateRefs(
      [{ setWeight: 10 }, { analysis: { templates: [{ templateName: 'a' }, { templateName: 'b', clusterScope: true }] } }],
      {
        canaryAnalysis: { templates: [{ templateName: 'c', clusterScope: true }] },
        blueGreen: { prePromotionAnalysis: { templates: [{ templateName: 'd' }] }, postPromotionAnalysis: { templates: [{ templateName: 'e' }] } },
      },
    );
    expect(refs).toEqual([
      { name: 'a', cluster: false, where: 'canary step 2' },
      { name: 'b', cluster: true, where: 'canary step 2' },
      { name: 'c', cluster: true, where: 'canaryAnalysis' },
      { name: 'd', cluster: false, where: 'blueGreen.prePromotionAnalysis' },
      { name: 'e', cluster: false, where: 'blueGreen.postPromotionAnalysis' },
    ]);
  });
  it('reads nothing from shapes it does not understand', () => {
    expect(templateRefs(undefined, {})).toEqual([]);
    expect(templateRefs([{ setWeight: 1 }, 'x', null], { canaryAnalysis: 'no', blueGreen: [] })).toEqual([]);
  });
});

describe('analysisProblems', () => {
  it('flags the boarding-api pre-prod case: a namespaced reference to a template nothing declares', () => {
    const refs = templateRefs(undefined, pre.rollout);
    expect(analysisProblems(refs, [], ['pod-health-check'], 'kind-prod')).toEqual([
      'canaryAnalysis: AnalysisTemplate "pod-health-check" is not declared in this file. It is a ClusterAnalysisTemplate: mark the reference as a cluster template (clusterScope: true), otherwise Argo looks for one in the app\'s namespace and rejects the Rollout.',
    ]);
  });
  it('says to declare it, when no cluster template has that name either', () => {
    const [msg] = analysisProblems(templateRefs(undefined, pre.rollout), [], ['other'], 'kind-prod');
    expect(msg).toMatch(/Declare it under Custom AnalysisTemplates, or use a cluster template/);
  });
  it('accepts a declared namespaced template and an existing cluster template', () => {
    const refs = templateRefs([{ analysis: { templates: [{ templateName: 'mine' }, { templateName: 'pod-health-check', clusterScope: true }] } }], {});
    expect(analysisProblems(refs, ['mine'], ['pod-health-check'], 'kind-prod')).toEqual([]);
  });
  it('flags a cluster reference the cluster does not have, listing what it does have', () => {
    const refs = templateRefs(undefined, { canaryAnalysis: { templates: [{ templateName: 'nope', clusterScope: true }] } });
    expect(analysisProblems(refs, [], ['a', 'b'], 'kind-prod')).toEqual(['canaryAnalysis: "nope" is not a ClusterAnalysisTemplate on kind-prod. Available: a, b.']);
    expect(analysisProblems(refs, [], [], 'kind-prod')[0]).toMatch(/There are none on this cluster/);
  });
  it('does not judge a cluster reference when the cluster list could not be read', () => {
    const refs = templateRefs(undefined, { canaryAnalysis: { templates: [{ templateName: 'x', clusterScope: true }] } });
    expect(analysisProblems(refs, [], undefined, 'kind-prod')).toEqual([]);
  });
  it('still judges a namespaced reference when the cluster list is unknown (that needs only this file)', () => {
    expect(analysisProblems(templateRefs(undefined, pre.rollout), [], undefined)[0]).toMatch(/not declared in this file/);
  });
  it('reports a reference repeated in one place once', () => {
    const refs = templateRefs(undefined, { canaryAnalysis: { templates: [{ templateName: 'x' }, { templateName: 'x' }] } });
    expect(analysisProblems(refs, [], [])).toHaveLength(1);
  });
});
