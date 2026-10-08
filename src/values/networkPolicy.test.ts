import {
  GATEWAY_NS_KEY,
  buildParentRefs,
  buildPeers,
  gatewayNamespaceOf,
  gatewaySelectorPatch,
  isSimpleGatewaySelector,
  parseLabels,
  parseParentRefs,
  parsePeers,
  parsePorts,
  validatePeers,
  withGatewayNamespace,
} from './networkPolicy';

describe('peers', () => {
  const peers = [
    { namespace: 'app-flight-api-staging', podLabels: { app: 'flight-api', tier: 'api' }, ports: [8080] },
    { cidr: '10.0.0.0/8', ports: [443, 8443] },
    { namespace: 'monitoring' },
  ];
  it('round-trips the chart shape exactly', () => {
    expect(buildPeers(parsePeers(peers))).toEqual(peers);
  });
  it('reads kind, target, labels and ports into rows', () => {
    expect(parsePeers(peers)[0]).toEqual({ kind: 'namespace', target: 'app-flight-api-staging', podLabels: 'app=flight-api, tier=api', ports: '8080' });
    expect(parsePeers(peers)[1]).toEqual({ kind: 'cidr', target: '10.0.0.0/8', podLabels: '', ports: '443, 8443' });
    expect(parsePeers(undefined)).toEqual([]);
  });
  it('drops a row with no target, and pod labels from a CIDR peer', () => {
    expect(buildPeers([{ kind: 'namespace', target: '', podLabels: '', ports: '' }])).toEqual([]);
    expect(buildPeers([{ kind: 'cidr', target: '10.0.0.0/8', podLabels: 'a=b', ports: '' }])).toEqual([{ cidr: '10.0.0.0/8' }]);
  });
  it('reports what is wrong with a row', () => {
    expect(validatePeers([{ kind: 'namespace', target: '', podLabels: 'x', ports: '0, 70000, abc' }], 'Ingress source')).toEqual([
      'Ingress source 1 needs a namespace.',
      'Ingress source 1: pod labels must be key=value, comma-separated (x).',
      'Ingress source 1: ports must be whole numbers from 1 to 65535 (0, 70000, abc).',
    ]);
    expect(validatePeers([{ kind: 'cidr', target: '10.0.0.0/8', podLabels: '', ports: '80' }], 'x')).toEqual([]);
  });
});

describe('parseLabels and parsePorts', () => {
  it('parse and flag bad entries', () => {
    expect(parseLabels('a=b, c = d')).toEqual({ labels: { a: 'b', c: 'd' }, bad: [] });
    expect(parseLabels('a=, =b, c').bad).toEqual(['a=', '=b', 'c']);
    expect(parsePorts('80, 443')).toEqual({ ports: [80, 443], bad: [] });
    expect(parsePorts('').ports).toBeUndefined();
  });
});

describe('gateway namespace selector', () => {
  const selector = { matchLabels: { 'kubernetes.io/metadata.name': 'kiac-gateway' } };
  it('reads the namespace and sets it keeping other labels and fields', () => {
    expect(gatewayNamespaceOf(selector)).toBe('kiac-gateway');
    expect(gatewayNamespaceOf({ matchExpressions: [] })).toBe('');
    expect(withGatewayNamespace({ matchLabels: { x: 'y' }, matchExpressions: [{ key: 'k' }] }, 'gw')).toEqual({
      matchLabels: { x: 'y', 'kubernetes.io/metadata.name': 'gw' },
      matchExpressions: [{ key: 'k' }],
    });
  });
});

describe('gateway selector', () => {
  it('is simple when unset or only the namespace-name label', () => {
    expect(isSimpleGatewaySelector(undefined)).toBe(true);
    expect(isSimpleGatewaySelector({ matchLabels: { [GATEWAY_NS_KEY]: 'g' } })).toBe(true);
    expect(isSimpleGatewaySelector({ matchLabels: { [GATEWAY_NS_KEY]: 'g', tier: 'edge' } })).toBe(false);
    expect(isSimpleGatewaySelector({ matchExpressions: [] })).toBe(false);
  });
  it('writes nothing when unchanged, YAML as written, or the merged namespace', () => {
    const orig = { matchLabels: { [GATEWAY_NS_KEY]: 'g' } };
    expect(gatewaySelectorPatch(orig, { networkPolicyGatewayAdvanced: false, networkPolicyGatewaySelectorYaml: '', networkPolicyGatewayNs: 'g' })).toEqual({});
    expect(gatewaySelectorPatch(orig, { networkPolicyGatewayAdvanced: false, networkPolicyGatewaySelectorYaml: '', networkPolicyGatewayNs: 'h' })).toEqual({
      ingressControllerNamespaceSelector: { matchLabels: { [GATEWAY_NS_KEY]: 'h' } },
    });
    expect(gatewaySelectorPatch(orig, { networkPolicyGatewayAdvanced: true, networkPolicyGatewaySelectorYaml: 'matchLabels: {a: b}', networkPolicyGatewayNs: '' })).toEqual({
      ingressControllerNamespaceSelector: { matchLabels: { a: 'b' } },
    });
    expect(gatewaySelectorPatch(orig, { networkPolicyGatewayAdvanced: true, networkPolicyGatewaySelectorYaml: 'a: [', networkPolicyGatewayNs: '' })).toEqual({});
  });
});

describe('parent refs', () => {
  it('round-trips name, namespace and sectionName without inventing empty keys', () => {
    const refs = [{ name: 'kiac', namespace: 'kiac-gateway', sectionName: 'https' }, { name: 'internal' }];
    expect(buildParentRefs(parseParentRefs(refs))).toEqual(refs);
    expect(buildParentRefs([{ name: ' ', namespace: 'x', sectionName: '' }])).toEqual([]);
  });
});
