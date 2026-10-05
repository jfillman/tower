import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConfigEditor } from './ValuesForm';
import type { ValuesSource } from './sources';

jest.mock('@backstage/core-components', () => ({
  Progress: () => <div>loading</div>,
  ResponseErrorPanel: ({ error }: { error: Error }) => <div>{String(error)}</div>,
}));
jest.mock('../useConfigData', () => ({ useValuesSchema: () => ({ loading: false, data: undefined }) }));

// The real staging values file of boarding-api (gitops-boarding-api, kind-prod/staging), as Crossplane and a person
// left it: env vars from a ConfigMap and a Secret, a rollout with probes and steps, an HTTPRoute, attached components.
// A change to ONE field must put back every other field of that block exactly as it was; anything else is data loss.
const original = load(readFileSync(join(__dirname, '__fixtures__/boarding-api-staging.values.yaml'), 'utf8')) as Record<string, any>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const submit = jest.fn(async () => undefined);
function open(values: Record<string, any> = original) {
  const data = { values: clone(values), raw: 'x', path: 'p' };
  const src: ValuesSource = { loading: false, data, refresh: jest.fn(), submit, submitting: false, resetSubmit: jest.fn() };
  render(<ConfigEditor owner="o" appName="boarding-api" source={src} title="STAGING" layout="side" />);
}
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
const patchOf = () => {
  fireEvent.click(within(screen.getByRole('region', { name: /Pending changes to the values/ })).getByRole('button', { name: 'Open pull request' }));
  return (submit.mock.calls[submit.mock.calls.length - 1] as unknown as [Record<string, any>])[0];
};

beforeEach(() => submit.mockClear());

describe('values form round trip: one edit leaves the rest of the block as it was', () => {
  it('env: editing one value keeps every valueFrom reference', () => {
    open();
    tab('Config');
    fireEvent.change(screen.getByDisplayValue('redis://cache-master:6379'), { target: { value: 'redis://other:6379' } });
    const expected = clone(original.env);
    expected[0].value = 'redis://other:6379';
    expect(patchOf().env).toEqual(expected);
  });

  it('rollout: editing replicas keeps ports, resources, steps and both probes', () => {
    open();
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Replicas$/ }), { target: { value: '5' } });
    const expected = clone(original.rollout);
    expected.replicas = 5;
    expect(patchOf().rollout).toEqual(expected);
  });

  it('httpRoute: editing the hostnames keeps the parent refs', () => {
    open();
    tab('Networking');
    fireEvent.change(screen.getByDisplayValue('boarding-api.prod.kind.local'), { target: { value: 'boarding-api.example.local' } });
    const expected = clone(original.httpRoute);
    expected.hostnames = ['boarding-api.example.local'];
    expect(patchOf().httpRoute).toEqual(expected);
  });

  it('a change in one block does not rewrite another', () => {
    open();
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Replicas$/ }), { target: { value: '5' } });
    const patch = patchOf();
    expect(Object.keys(patch)).toEqual(['rollout']);
  });
});

// Fields of the chart that the form has no control for. They must survive an edit of a field it does have.
const rich: Record<string, any> = {
  rollout: {
    replicas: 2,
    ports: [{ name: 'http', containerPort: 8080, protocol: 'TCP' }],
    livenessProbe: { tcpSocket: { port: 8080 }, periodSeconds: 7, failureThreshold: 4 },
    readinessProbe: { exec: { command: ['cat', '/tmp/ready'] }, initialDelaySeconds: 3 },
    strategy: 'canary',
    command: ['/app'],
    args: ['--serve'],
    podSecurityContext: { runAsNonRoot: true },
    containerSecurityContext: { readOnlyRootFilesystem: true },
    extraContainers: [{ name: 'sidecar', image: 'busybox' }],
    podSpec: { nodeSelector: { disk: 'ssd' } },
    steps: [{ setWeight: 20 }, { setCanaryScale: { weight: 20 } }, { setWeight: 100 }],
  },
  ingress: { enabled: true, host: 'a.example.com', path: '/', pathType: 'Prefix', tls: true, tlsSecretName: 'a-tls', annotations: { 'nginx/x': '1' } },
  httpRoute: { enabled: true, hostnames: ['a.example.com'], parentRefs: [{ name: 'gw', namespace: 'gws' }], annotations: { a: 'b' }, path: '/api', pathType: 'PathPrefix' },
  networkPolicy: { enabled: true, allowIngressFromIngressController: true, allowEgressTo: [{ namespace: 'db' }], extraIngressRules: [{ from: [] }], ingressControllerNamespaceSelector: { a: 'b' } },
  serviceMonitor: { enabled: true, path: '/metrics', interval: '30s', port: 'metrics', additionalLabels: { release: 'prom' } },
  podDisruptionBudget: { enabled: true, minAvailable: 1 },
  autoscaling: { enabled: true, min: 2, max: 5, targetCPUPercent: 70 },
  serviceAccount: { create: true, name: 'sa', annotations: { 'eks/role': 'x' }, imagePullSecrets: [{ name: 'reg' }] },
  notifications: { slack: { enabled: true, channel: '#c' } },
  configMaps: [{ name: 'cm', data: { a: '1' }, as: 'both', mountPath: '/etc/cm' }],
  secrets: [{ name: 'sec', key: 'K', as: 'env' }],
  env: [{ name: 'A', value: '1' }],
};

describe('values form round trip: fields the form has no control for survive', () => {
  const edit = (field: () => HTMLElement, value: string) => fireEvent.change(field(), { target: { value } });

  it('rollout: strategy, pod template, security contexts, sidecars, protocol, other probe kinds and custom steps', () => {
    open(rich);
    edit(() => screen.getByRole('spinbutton', { name: /^Replicas$/ }), '3');
    const expected = clone(rich.rollout);
    expected.replicas = 3;
    expect(patchOf().rollout).toEqual(expected);
  });

  it('httpRoute: annotations, path and pathType', () => {
    open(rich);
    tab('Networking');
    edit(() => screen.getByDisplayValue('gw'), 'gw2');
    const expected = clone(rich.httpRoute);
    expected.parentRefs[0].name = 'gw2';
    expect(patchOf().httpRoute).toEqual(expected);
  });

  it('serviceMonitor: port and additional labels', () => {
    open(rich);
    edit(() => screen.getByDisplayValue('30s'), '15s');
    const expected = clone(rich.serviceMonitor);
    expected.interval = '15s';
    expect(patchOf().serviceMonitor).toEqual(expected);
  });

  it('env: a secret and a config map reference can be added and edited', () => {
    open(rich);
    tab('Config');
    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }));
    edit(() => screen.getByLabelText('Variable 2 name'), 'DB_PASSWORD');
    edit(() => screen.getByLabelText('Variable 2 source'), 'secret');
    edit(() => screen.getByLabelText('Variable 2 secret name'), 'db-creds');
    edit(() => screen.getByLabelText('Variable 2 key'), 'password');
    expect(patchOf().env).toEqual([
      { name: 'A', value: '1' },
      { name: 'DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'db-creds', key: 'password' } } },
    ]);
  });

  it('env: a reference the form cannot edit (fieldRef) is kept as it was', () => {
    open({ env: [{ name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } }, { name: 'A', value: '1' }] });
    tab('Config');
    edit(() => screen.getByDisplayValue('1'), '2');
    expect(patchOf().env).toEqual([{ name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } }, { name: 'A', value: '2' }]);
  });
});

describe('values form: the chart fields it gained', () => {
  const edit = (field: () => HTMLElement, value: string) => fireEvent.change(field(), { target: { value } });

  it('ports: the protocol is editable and a UDP port stays UDP', () => {
    open({ rollout: { replicas: 1, ports: [{ name: 'dns', containerPort: 53, protocol: 'UDP' }] } });
    edit(() => screen.getByRole('spinbutton', { name: /^Replicas$/ }), '2');
    expect(patchOf().rollout.ports).toEqual([{ name: 'dns', containerPort: 53, protocol: 'UDP' }]);
  });

  it('ports: choosing SCTP writes it, and the default writes nothing', () => {
    open({ rollout: { replicas: 1, ports: [{ name: 'a', containerPort: 1 }] } });
    edit(() => screen.getByLabelText('Port 1 protocol'), 'SCTP');
    expect(patchOf().rollout.ports).toEqual([{ name: 'a', containerPort: 1, protocol: 'SCTP' }]);
  });

  it('rollout: no resources key is added when there were none and none are set', () => {
    open({ rollout: { replicas: 1 } });
    edit(() => screen.getByRole('spinbutton', { name: /^Replicas$/ }), '2');
    expect('resources' in patchOf().rollout).toBe(false);
  });

  it('ingress: the TLS secret name', () => {
    open(rich);
    tab('Networking');
    edit(() => screen.getByDisplayValue('a-tls'), 'b-tls');
    const expected = clone(rich.ingress);
    expected.tlsSecretName = 'b-tls';
    expect(patchOf().ingress).toEqual(expected);
  });

  it('httpRoute: the path and path type', () => {
    open(rich);
    tab('Networking');
    edit(() => screen.getByDisplayValue('/api'), '/v2');
    const expected = clone(rich.httpRoute);
    expected.path = '/v2';
    expect(patchOf().httpRoute).toEqual(expected);
  });

  it('serviceMonitor: the port name', () => {
    open(rich);
    edit(() => screen.getByDisplayValue('metrics'), 'prom');
    const expected = clone(rich.serviceMonitor);
    expected.port = 'prom';
    expect(patchOf().serviceMonitor).toEqual(expected);
  });
});

describe('values form: network policy', () => {
  const edit = (field: () => HTMLElement, value: string) => fireEvent.change(field(), { target: { value } });
  // The chart's own default block, as pasted in the bug report: every field of it must be reachable and survive.
  const np = {
    enabled: true,
    allowIngressFromIngressController: true,
    ingressControllerNamespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kiac-gateway' } },
    allowIngressFrom: [],
    allowEgressTo: [],
    extraIngressRules: [],
    extraEgressRules: [],
  };
  const withNp = (over: Record<string, any> = {}) => ({ networkPolicy: { ...np, ...over }, rollout: { replicas: 1 } });

  it('shows the gateway namespace and writes a new one, keeping the rest', () => {
    open(withNp());
    tab('Networking');
    expect((screen.getByLabelText('Gateway namespace') as HTMLInputElement).value).toBe('kiac-gateway');
    edit(() => screen.getByLabelText('Gateway namespace'), 'other-gateway');
    expect(patchOf().networkPolicy).toEqual({ ...np, ingressControllerNamespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'other-gateway' } } });
  });

  it('adds an ingress source with pod labels and ports, and an egress CIDR', () => {
    open(withNp());
    tab('Networking');
    fireEvent.click(screen.getByRole('button', { name: '+ Add source' }));
    edit(() => screen.getByLabelText('Also allow ingress from 1 namespace'), 'app-flight-api-staging');
    edit(() => screen.getByLabelText('Also allow ingress from 1 pod labels'), 'app=flight-api');
    edit(() => screen.getByLabelText('Also allow ingress from 1 ports'), '8080, 8443');
    fireEvent.click(screen.getByRole('button', { name: '+ Add destination' }));
    edit(() => screen.getByLabelText('Allow egress to 1 kind'), 'cidr');
    edit(() => screen.getByLabelText('Allow egress to 1 CIDR'), '10.0.0.0/8');
    const out = patchOf().networkPolicy;
    expect(out.allowIngressFrom).toEqual([{ namespace: 'app-flight-api-staging', podLabels: { app: 'flight-api' }, ports: [8080, 8443] }]);
    expect(out.allowEgressTo).toEqual([{ cidr: '10.0.0.0/8' }]);
    expect(out.extraIngressRules).toEqual([]);
  });

  it('edits existing peers and clearing the last one clears the list', () => {
    open(withNp({ allowEgressTo: [{ namespace: 'db', ports: [5432] }] }));
    tab('Networking');
    edit(() => screen.getByDisplayValue('db'), 'db-prod');
    expect(patchOf().networkPolicy.allowEgressTo).toEqual([{ namespace: 'db-prod', ports: [5432] }]);
    submit.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    tab('Networking');
    fireEvent.click(within(screen.getByText('Allow egress to').parentElement as HTMLElement).getByRole('button', { name: 'Remove' }));
    expect(patchOf().networkPolicy.allowEgressTo).toEqual([]);
  });

  it('takes raw extra rules as YAML lists and refuses invalid ones', () => {
    open(withNp());
    tab('Networking');
    const boxes = () => screen.getAllByRole('textbox').filter(t => t.tagName === 'TEXTAREA') as HTMLTextAreaElement[];
    edit(() => boxes()[0], '- from:\n    - namespaceSelector: {}\n  ports:\n    - protocol: UDP\n      port: 53\n');
    expect(patchOf().networkPolicy.extraIngressRules).toEqual([{ from: [{ namespaceSelector: {} }], ports: [{ protocol: 'UDP', port: 53 }] }]);
    submit.mockClear();
    edit(() => boxes()[0], 'a: [');
    const region = within(screen.getByRole('region', { name: /Pending changes to the values/ }));
    expect(region.getByText(/Network policy extra rules: fix the YAML syntax error/)).toBeTruthy();
    expect((region.getByRole('button', { name: 'Open pull request' }) as HTMLButtonElement).disabled).toBe(true);
    edit(() => boxes()[0], 'a: 1');
    expect(region.getByText(/must be a YAML list of rules/)).toBeTruthy();
  });

  it('flags a source with no namespace and bad ports', () => {
    open(withNp());
    tab('Networking');
    fireEvent.click(screen.getByRole('button', { name: '+ Add source' }));
    edit(() => screen.getByLabelText('Also allow ingress from 1 ports'), '99999');
    const region = within(screen.getByRole('region', { name: /Pending changes to the values/ }));
    expect(region.getByText(/Network policy ingress source 1 needs a namespace/)).toBeTruthy();
    expect(region.getByText(/ports must be whole numbers from 1 to 65535/)).toBeTruthy();
  });
});

describe('values form: env values from a component', () => {
  const edit = (field: () => HTMLElement, value: string) => fireEvent.change(field(), { target: { value } });
  const withComponents = (env: any[]) => ({ components: [{ type: 'rabbitmq', name: 'board-mq', spec: {} }], env });

  it('reads a fromComponent entry and writes it back unchanged when another variable changes', () => {
    open(withComponents([{ name: 'RABBITMQ_HOST', fromComponent: { name: 'board-mq', output: 'host' } }, { name: 'A', value: '1' }]));
    tab('Config');
    expect((screen.getByLabelText('Variable 1 component') as HTMLSelectElement).value).toBe('board-mq');
    expect((screen.getByLabelText('Variable 1 output') as HTMLSelectElement).value).toBe('host');
    edit(() => screen.getByDisplayValue('1'), '2');
    expect(patchOf().env).toEqual([{ name: 'RABBITMQ_HOST', fromComponent: { name: 'board-mq', output: 'host' } }, { name: 'A', value: '2' }]);
  });

  it('offers the declared components and their outputs', () => {
    open(withComponents([{ name: 'X', fromComponent: { name: 'board-mq', output: 'host' } }]));
    tab('Config');
    const outputs = [...(screen.getByLabelText('Variable 1 output') as HTMLSelectElement).options].map(o => o.value).filter(Boolean);
    expect(outputs).toEqual(['username', 'password', 'host', 'port', 'vhost']);
  });

  it('suggests the component reference for a hand-written one (AF-COMP-003) and converts on request', () => {
    open(withComponents([{ name: 'RABBITMQ_HOST', valueFrom: { configMapKeyRef: { name: 'board-mq-connection', key: 'host' } } }]));
    tab('Config');
    fireEvent.click(screen.getByRole('button', { name: 'Use component board-mq.host instead' }));
    expect(patchOf().env).toEqual([{ name: 'RABBITMQ_HOST', fromComponent: { name: 'board-mq', output: 'host' } }]);
  });

  it('gives no suggestion for a reference that is not a component output', () => {
    open(withComponents([{ name: 'TOKEN', valueFrom: { secretKeyRef: { name: 'my-secret', key: 'token' } } }]));
    tab('Config');
    expect(screen.queryByRole('button', { name: /Use component/ })).toBeNull();
  });

  it('refuses a component variable with no output chosen', () => {
    open(withComponents([{ name: 'A', value: '1' }]));
    tab('Config');
    edit(() => screen.getByLabelText('Variable 1 source'), 'component');
    const region = within(screen.getByRole('region', { name: /Pending changes to the values/ }));
    expect(region.getByText(/takes its value from a component: choose the component and the output/)).toBeTruthy();
  });
});

describe('values form: placeholders are ghost text, not values', () => {
  it('example values say so and defaults say default', () => {
    open({ rollout: { replicas: 1, ports: [{ name: 'http', containerPort: 8080 }] }, httpRoute: { enabled: true, hostnames: [], parentRefs: [] } });
    tab('Networking');
    const placeholders = screen.getAllByRole('textbox').map(e => e.getAttribute('placeholder') ?? '');
    expect(placeholders).toContain('e.g. boarding-api.prod.kiac.local');
    expect(placeholders).not.toContain('checkout-api.prod.kiac.local');
    expect(placeholders.filter(p => /^\/|^\d+$/.test(p))).toEqual([]); // no bare "/" or "3000" that reads as a value
  });
});

describe('values form: annotations', () => {
  const edit = (field: () => HTMLElement, value: string) => fireEvent.change(field(), { target: { value } });

  it('the Service account annotations are labelled as such, and are written to serviceAccount.annotations', () => {
    open({ serviceAccount: { create: true, name: '', annotations: {}, imagePullSecrets: [] } });
    tab('Access');
    expect(screen.getByText('Service account annotations')).toBeTruthy();
    expect(screen.getByText(/no field for annotations on the pods or the Deployment/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Add annotation' }));
    edit(() => screen.getByLabelText('Service account annotations 1 key'), 'riley');
    edit(() => screen.getByLabelText('Service account annotations 1 value'), 'roo');
    expect(patchOf().serviceAccount).toEqual({ create: true, name: '', annotations: { riley: 'roo' }, imagePullSecrets: [] });
  });

  it('ingress and HTTPRoute annotations are editable and keep the existing ones', () => {
    open({ ingress: { enabled: true, host: 'a.example.com', annotations: { keep: 'me' } }, httpRoute: { enabled: true, hostnames: ['a'], parentRefs: [{ name: 'gw', namespace: 'g' }] } });
    tab('Networking');
    // the HTTPRoute block comes first; its add button is the first one
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add annotation' })[0]);
    edit(() => screen.getByLabelText('HTTPRoute annotations 1 key'), 'x');
    edit(() => screen.getByLabelText('HTTPRoute annotations 1 value'), 'y');
    edit(() => screen.getByLabelText('Ingress annotations 1 value'), 'changed');
    const p = patchOf();
    expect(p.httpRoute.annotations).toEqual({ x: 'y' });
    expect(p.ingress.annotations).toEqual({ keep: 'changed' });
  });

  it('removing the last annotation of a block that had some writes an empty map, and a block that had none writes no key', () => {
    open({ ingress: { enabled: true, host: 'a.example.com', annotations: { keep: 'me' } } });
    tab('Networking');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(patchOf().ingress.annotations).toEqual({});
  });

  it('a block that had no annotations writes no annotations key when nothing is added', () => {
    open({ ingress: { enabled: true, host: 'a.example.com', path: '/' } });
    tab('Networking');
    edit(() => screen.getByDisplayValue('a.example.com'), 'b.example.com');
    expect('annotations' in patchOf().ingress).toBe(false);
  });

  it('ServiceMonitor labels are editable and keep the existing ones', () => {
    open({ serviceMonitor: { enabled: true, path: '/metrics', interval: '30s', additionalLabels: { release: 'prom' } } });
    edit(() => screen.getByDisplayValue('prom'), 'kube-prometheus-stack');
    expect(patchOf().serviceMonitor.additionalLabels).toEqual({ release: 'kube-prometheus-stack' });
  });
});

describe('values form: rollout strategy and pod template are two panels', () => {
  const startingPoint = (heading: string) => {
    const section = screen.getByRole('heading', { name: heading }).parentElement as HTMLElement;
    fireEvent.click(within(section).getByRole('button', { name: 'Show example' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Use this as a starting point' }));
  };

  it('Rollout strategy is on the Release tab and Pod template on the Workload tab, each with its own example', () => {
    open({ rollout: { replicas: 1 } });
    expect(screen.getByRole('heading', { name: 'Pod template' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Rollout strategy' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show example' }));
    expect(screen.getByText(/podSpec is deep-merged onto the pod spec/)).toBeTruthy();
    expect(screen.getByText(/extraContainers:/)).toBeTruthy();
    tab('Release');
    expect(screen.getByRole('heading', { name: 'Rollout strategy' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Pod template' })).toBeNull();
  });

  it('the pod template example is valid: its keys are written to the rollout', () => {
    open({ rollout: { replicas: 1 } });
    startingPoint('Pod template');
    const rollout = patchOf().rollout;
    expect(Object.keys(rollout)).toEqual(expect.arrayContaining(['command', 'args', 'podSecurityContext', 'containerSecurityContext', 'podSpec', 'extraContainers']));
    expect(rollout.podSpec.tolerations[0].key).toBe('dedicated');
    expect(rollout.extraContainers[0].name).toBe('log-shipper');
    expect(rollout.strategy).toBeUndefined();
  });

  it('the strategy example is valid: its keys are written to the rollout, and the pod keys are untouched', () => {
    open({ rollout: { replicas: 1, command: ['/app'] } });
    tab('Release');
    startingPoint('Rollout strategy');
    const rollout = patchOf().rollout;
    expect(rollout.strategy).toBe('canary');
    expect(rollout.canaryAnalysis.templates[0].templateName).toBe('boarding-api-no-restarts');
    expect(rollout.command).toEqual(['/app']);
  });

  it('editing the strategy keeps the pod template and the other way round', () => {
    open({ rollout: { replicas: 1, strategy: 'blueGreen', podSpec: { terminationGracePeriodSeconds: 45 } } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Replicas$/ }), { target: { value: '2' } });
    expect(patchOf().rollout).toEqual(expect.objectContaining({ replicas: 2, strategy: 'blueGreen', podSpec: { terminationGracePeriodSeconds: 45 } }));
  });
});
