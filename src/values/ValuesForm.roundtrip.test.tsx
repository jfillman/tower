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
