"""Break-glass diagrams for docs/break-glass/diagrams (diagram-design skill, Hangar profile).

python3 tools/diagrams/breakglass.py            # writes the .html sources
tools/diagrams/png.sh                            # renders each diagram's SVG to a 2x PNG next to it
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: F401,F403

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'break-glass', 'diagrams')
W = 1000
LIFE = 'rgba(27,31,36,0.20)'


def oval(x, y, w, h, name, sub=None):
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h//2}" fill="{PAPER}"/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h//2}" fill="rgba(91,101,112,0.10)" stroke="{SOFT}" stroke-width="1"/>'
    cy = y + h/2 + (4 if not sub else -2)
    s += text(x + w/2, cy, name, 12, 600, INK, 'middle')
    if sub:
        s += text(x + w/2, cy + 14, sub, 8, 400, MUTED, 'middle', mono=True)
    return s


def diamond(cx, cy, hw, hh, name, sub=None):
    pts = f'{cx},{cy-hh} {cx+hw},{cy} {cx},{cy+hh} {cx-hw},{cy}'
    s = f'<polygon points="{pts}" fill="{PAPER}"/>'
    s += f'<polygon points="{pts}" fill="#ffffff" stroke="{INK}" stroke-width="1"/>'
    s += text(cx, cy + (4 if not sub else -2), name, 12, 600, INK, 'middle')
    if sub:
        s += text(cx, cy + 12, sub, 8, 400, MUTED, 'middle', mono=True)
    return s


def band(x, y, w, h, idx, name, sub, kind='backend'):
    fill, stroke, dash = KINDS[kind]
    d = f' stroke-dasharray="{dash}"' if dash else ''
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{PAPER}"/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1"{d}/>'
    s += text(x + 16, y + 24, idx, 8, 500, MUTED, mono=True, ls='0.14em')
    s += text(x + 48, y + 24, name, 12, 600, INK)
    s += text(x + 48, y + 40, sub, 8, 400, MUTED, mono=True)
    return s


def note_box(x, y, w, h, eyebrow, body):
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{PAPER}"/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="rgba(27,31,36,0.02)" stroke="rgba(27,31,36,0.20)" stroke-width="1" stroke-dasharray="4,3"/>'
    s += text(x + 12, y + 14, eyebrow, 8, 500, SOFT, mono=True, ls='0.14em')
    s += text(x + 12, y + 28, body, 8, 400, INK, mono=True)
    return s


def write(slug, eyebrow, title, desc, body, H, lede, y0=0):
    html_ = page(slug, eyebrow, title, desc, body, W, H, lede=lede, y0=y0)
    with open(os.path.join(OUT, f'{slug}.html'), 'w') as f:
        f.write(html_)


# 01 · How a session works (architecture) ------------------------------------------------------------------------------
def d01():
    b = ''
    b += zone(660, 96, 316, 404, 'App cluster')
    b += zone(676, 228, 284, 256, 'App namespace')
    # arrows first
    b += path([(224, 232), (312, 232)], 'link') + hlab(224, 312, 232, 'WebSocket', LINK)
    b += path([(544, 216), (632, 216), (632, 152), (700, 152)], 'link') + hlab(632, 700, 152, 'as itself', LINK)
    b += path([(544, 248), (608, 248), (608, 428), (700, 428)], 'accent') + hlab(608, 700, 428, 'terminal', ACC)
    b += path([(818, 184), (818, 260)]) + vlab(818, 184, 260, 'creates')
    b += path([(818, 324), (818, 396)], dashed=True) + vlab(818, 324, 396, 'allows')
    b += path([(328, 264), (328, 384)]) + vlab(328, 264, 384, 'writes')
    b += path([(496, 264), (496, 384)]) + vlab(496, 264, 384, 'uploads')
    # nodes
    b += node(40, 200, 184, 64, 'You, in Tower', 'browser · no cluster credential', 'input')
    b += node(312, 200, 232, 64, 'Backstage backend', 'permissions · rules · terminal relay', 'focal')
    b += node(700, 120, 236, 64, 'API server', 'admission policies, fail closed')
    b += node(700, 260, 236, 64, 'Just-in-time grant', 'RoleBinding · ends with the session', 'security')
    b += node(700, 396, 236, 64, 'Pod + debug container', 'debug-<id> · uid 65532 · read-only')
    b += node(240, 384, 160, 64, 'Session record', 'who · why · what happened', 'store')
    b += node(416, 384, 160, 64, 'Recordings', 'MinIO · SHA-256 · 365 days', 'store')
    b += callout(40, 548, 'The browser never holds a Kubernetes credential, and Backstage holds no debug rights at rest.')
    b += legend(588, [('input', 'You'), ('focal', 'Backstage'), ('store', 'Stored'), ('security', 'Temporary grant'),
                      ('link', 'Call'), ('accent', 'Recorded terminal'), ('muted-dash', 'Permits')])
    write('01-how-it-works', 'Break-glass · 01 · Architecture', 'How a break-glass session works',
          'Your browser talks only to the Backstage backend over a WebSocket. Backstage calls the cluster API server as its '
          'own identity, creates a temporary grant in the app namespace that allows it to add a debug container to the pod, '
          'relays the recorded terminal, writes a session record and uploads the recording to MinIO.',
          b, 616, 'One backend in the middle of everything: it checks who you are, grants itself just enough in one namespace, '
          'records every byte, and cleans up.', y0=80)


# 02 · Session lifecycle (state machine) -------------------------------------------------------------------------------
def d02():
    b = ''
    b += path([(216, 124), (264, 124)])
    b += path([(424, 124), (488, 124)]) + hlab(424, 488, 124, 'approve')
    b += path([(568, 152), (568, 256)]) + vlab(568, 152, 256, 'start')
    b += path([(216, 284), (488, 284)]) + hlab(216, 488, 284, 'opens at once')
    b += path([(216, 404), (568, 404), (568, 312)], 'accent') + hlab(216, 568, 404, 'no approval', ACC)
    b += path([(648, 284), (776, 284)]) + hlab(648, 776, 284, 'end · expiry · idle')
    b += path([(344, 96), (344, 64), (904, 64), (904, 256)]) + hlab(344, 904, 64, 'deny · withdraw · 30 min')
    b += path([(648, 124), (840, 124), (840, 256)]) + hlab(648, 840, 124, 'withdraw · 10 min')
    b += path([(856, 312), (856, 400)]) + vlab(856, 312, 400, 'review')
    b += node(40, 96, 176, 56, 'Flight request', 'an owner asks', 'input')
    b += node(264, 96, 160, 56, 'requested', 'waits up to 30 min')
    b += node(488, 96, 160, 56, 'approved', 'start within 10 min')
    b += node(40, 256, 176, 56, 'Ground or preview', 'an owner opens it', 'input')
    b += node(488, 256, 160, 56, 'active', '15-60 min, +15 once')
    b += node(40, 376, 176, 56, 'Glass broken', 'an admin, no 2nd person', 'focal')
    b += node(776, 256, 160, 56, 'ended', 'cleaned up, recorded')
    b += node(776, 400, 160, 56, 'reviewed', 'glass broken only')
    b += callout(40, 500, 'Nothing touches the cluster until a session is active.')
    b += legend(540, [('input', 'Entry'), ('backend', 'State'), ('focal', 'Glass broken'), ('muted', 'Transition'),
                      ('accent', 'Skips approval')])
    write('02-lifecycle', 'Break-glass · 02 · State machine', 'The life of a session',
          'Session states. A Flight request becomes requested, then approved, then active once started; it can be denied, '
          'withdrawn or expire into ended. Ground and preview sessions open directly as active. An admin breaking the glass '
          'also opens directly as active. Every active session ends; a glass-broken one is then reviewed.',
          b, 572, 'Three ways in, one way out. Only an active session has anything in the cluster.', y0=32)


# 03 · Flight two-person flow (sequence) -------------------------------------------------------------------------------
def d03():
    xs = {'req': 140, 'bs': 400, 'app': 640, 'k8s': 880}
    b = ''
    for k, cx in xs.items():
        b += f'<line x1="{cx}" y1="88" x2="{cx}" y2="560" stroke="{LIFE}" stroke-width="1" stroke-dasharray="3,3"/>'
    b += f'<rect x="{xs["bs"]-4}" y="120" width="8" height="420" fill="rgba(27,31,36,0.06)" stroke="{MUTED}" stroke-width="0.8"/>'

    def msg(a, z, y, label, color='muted', dashed=False, open_=False, at=None):
        x1, x2 = xs[a], xs[z]
        x1 += 4 if x2 > x1 and a == 'bs' else (-4 if a == 'bs' else 0)
        x2 += -4 if z == 'bs' and x2 > x1 else (4 if z == 'bs' else 0)
        col = 'open' if open_ else color
        s = path([(x1, y), (x2, y)], col, dashed=dashed)
        c = {'muted': SOFT, 'accent': ACC, 'link': LINK}[color]
        # A label centred on a long message would sit on the lifeline it passes; `at` moves it into a gap.
        return s + (lab(at, y - 18, label, c) if at else hlab(min(x1, x2), max(x1, x2), y, label, c))
    b += msg('req', 'bs', 136, 'request + reason')
    b += msg('bs', 'app', 180, 'notify', dashed=True, open_=True)
    b += msg('app', 'bs', 224, 'approve + note')
    b += msg('bs', 'req', 268, 'approved', dashed=True, open_=True)
    b += msg('req', 'bs', 312, 'start, within 10 min')
    b += msg('bs', 'k8s', 356, 'grant + debug container', 'accent', at=760)
    b += msg('req', 'bs', 400, 'keystrokes', 'link')
    b += msg('bs', 'k8s', 444, 'attach, recorded', 'link', at=760)
    b += msg('req', 'bs', 488, 'end')
    b += msg('bs', 'k8s', 532, 'clean up', at=760)
    b += text(xs['k8s'] + 12, 236, 'nothing in the', 8, 400, SOFT, mono=True)
    b += text(xs['k8s'] + 12, 248, 'cluster yet', 8, 400, SOFT, mono=True)
    b += node(60, 40, 160, 48, 'Requester', None, 'input')
    b += node(320, 40, 160, 48, 'Backstage', None, 'focal')
    b += node(560, 40, 160, 48, 'Approver', None, 'input')
    b += node(800, 40, 160, 48, 'App cluster', None, 'backend')
    b += legend(596, [('muted', 'Call'), ('open-dash', 'Notification'), ('accent', 'Grant created'), ('link', 'Terminal')])
    write('03-flight-approval', 'Break-glass · 03 · Sequence', 'Two people on Flight',
          'Sequence of a Flight session. The requester asks with a reason; Backstage notifies approvers; another owner or '
          'an admin approves with a note; the requester is told and starts within ten minutes; only then does Backstage '
          'create the grant and the debug container, relay the recorded terminal, and clean up when the session ends.',
          b, 628, 'The approval changes nothing in the cluster. The grant appears only when the requester presses Start.', y0=24)


# 04 · Guardrails (compensating security layers) -----------------------------------------------------------------------
def d04():
    b = ''
    ys = [120, 216, 312, 408, 504]
    b += path([(400, 80), (400, 120)])
    for y in ys[:-1]:
        b += path([(400, y + 56), (400, y + 96)])
    b += path([(400, ys[-1] + 56), (400, 600)], 'accent')
    b += node(120, 32, 560, 48, 'Risk: a debug shell reaches more than it should', None, 'input')
    layers = [
        ('01', 'Who may ask', 'owners only · a second person on Flight · tier decided by the server'),
        ('02', 'Just-in-time grant', 'no debug rights at rest · one namespace · two debug roles only'),
        ('03', 'Admission policies, failing closed', 'pinned image · non-root, read-only, no capabilities · own pods · no exec'),
        ('04', 'Time limits', '15 to 60 minutes, +15 once · idle 10 min · expiry label on grant and copy'),
        ('05', 'Record, audit, review', 'every byte recorded with SHA-256 · every step audited · glass broken reviewed'),
    ]
    still = ["an owner's own app, approved", 'what the debug role allows there', 'reading what the app can read',
             'for at most 75 minutes']
    for (idx, name, sub), y in zip(layers, ys):
        b += band(120, y, 560, 56, idx, name, sub)
    for s_, y in zip(still, ys):
        b += note_box(712, y + 58, 264, 36, 'STILL POSSIBLE', s_)
    b += node(120, 600, 560, 56, 'What remains', 'an authorized person reads what the app can read, briefly, on the record', 'focal')
    b += legend(700, [('input', 'Risk'), ('backend', 'Layer'), ('optional', 'Gets past the layer above'),
                      ('focal', 'Residual risk')])
    write('04-guardrail-layers', 'Break-glass · 04 · Compensating layers', 'Guardrails, layer by layer',
          'Five defensive layers between the risk that a debug shell reaches more than it should and what remains: who may '
          'ask, a just-in-time grant, fail-closed admission policies, time limits, and recording, audit and review. Beside '
          'each gap, what still gets past it; what remains at the end is an authorized person reading what the app can '
          'read, briefly, on the record.',
          b, 732, 'No layer is trusted alone. Each one narrows what the one above lets through, and the last one makes what '
          'is left visible.', y0=16)


# 05 · Ground or Flight (flowchart) ------------------------------------------------------------------------------------
def d05():
    b = ''
    b += path([(500, 64), (500, 88)])
    b += path([(612, 128), (704, 128)], 'muted') + hlab(612, 704, 128, 'yes')
    b += path([(500, 168), (500, 208)]) + vlab(500, 168, 208, 'no')
    b += path([(388, 248), (296, 248)]) + hlab(296, 388, 248, 'yes')
    b += path([(500, 288), (500, 328)]) + vlab(500, 288, 328, 'no')
    b += path([(612, 368), (804, 368), (804, 152)]) + hlab(612, 804, 368, 'yes')
    b += path([(500, 408), (500, 448)], 'accent') + vlab(500, 408, 448, 'no', ACC)
    b += oval(380, 24, 240, 40, 'Debug pressed on a pod')
    b += diamond(500, 128, 112, 40, 'Preview namespace?', 'hangar.io/ephemeral-env')
    b += diamond(500, 248, 112, 40, 'cicd.yaml names it?', 'deploy.environments')
    b += diamond(500, 368, 112, 40, 'Dev cluster?', 'groundClusters')
    b += node(704, 104, 200, 48, 'Ground', 'opens at once')
    b += node(96, 224, 200, 48, 'Its declared tier', 'Ground or Flight')
    b += node(400, 448, 200, 48, 'Flight', 'a second person approves', 'focal')
    b += callout(40, 548, 'An environment nobody declared, on a cluster nobody listed, is Flight.')
    b += legend(588, [('backend', 'Outcome'), ('focal', 'The strict default'), ('muted', 'Decision path')])
    write('05-tier-decision', 'Break-glass · 05 · Flowchart', 'Ground or Flight?',
          'Deciding a session\'s tier on the server: a PR preview namespace is Ground; otherwise the tier cicd.yaml declares '
          'for the environment; otherwise the cluster decides, Ground for a listed dev cluster and Flight for anything else.',
          b, 620, 'The request never says which tier it is. The server reads it from the cluster and the app\'s cicd.yaml.', y0=8)


# 06 · Where it runs (architecture with cluster zones) -----------------------------------------------------------------
def d06():
    b = ''
    b += zone(24, 72, 464, 368, 'kind-prod · Flight')
    b += zone(512, 72, 464, 368, 'kiac-dev · Ground')
    b += path([(124, 208), (124, 264)]) + vlab(124, 208, 264, 'session rows')
    b += path([(248, 172), (328, 172)]) + hlab(248, 328, 172, 'own SA')
    b += path([(176, 136), (176, 116), (636, 116), (636, 136)], 'link') + hlab(176, 636, 116, 'own SA, per cluster', LINK)
    b += path([(224, 208), (224, 392), (856, 392), (856, 328)], 'link') + hlab(224, 856, 392, 'recordings · put, get', LINK)
    b += path([(200, 208), (200, 420), (632, 420), (632, 328)], 'link') + hlab(200, 632, 420, 'anchor · hash + signature', LINK)
    b += node(48, 136, 200, 72, 'Backstage', 'backstage/backstage-ingestor', 'focal', tag='pod')
    b += node(48, 264, 152, 64, 'Postgres', 'breakglass_sessions', 'store')
    b += node(328, 136, 144, 72, 'API server', '4 VAPs · exec deny', 'security', tag='flight')
    b += node(536, 136, 200, 72, 'API server', '3 VAPs + Kyverno TTL cleanup', 'security', tag='ground')
    b += node(760, 264, 192, 64, 'MinIO', 'tower-breakglass-v2 · locked', 'store')
    b += node(536, 264, 192, 64, 'Rekor', 'hashedrekord per recording', 'store')
    b += callout(24, 484, 'Recordings live off the Flight cluster they record.')
    b += legend(528, [('focal', 'Backstage'), ('security', 'Admission policies'), ('store', 'Storage'),
                      ('link', 'Crosses clusters'), ('muted', 'In-cluster')])
    write('06-deployment', 'Break-glass · 06 · Deployment', 'Where break-glass runs',
          'Backstage runs on kind-prod with its session table in Postgres and reaches the kind-prod API server, which holds '
          'four Flight admission policies, and the kiac-dev API server, which holds three Ground policies and Kyverno\'s TTL '
          'cleanup, each as its own ServiceAccount; recordings go to an object-locked bucket in MinIO on kiac-dev and each '
          'recording\'s hash is anchored in Rekor there.',
          b, 560, 'One backend, two clusters, each enforcing its own policies; recordings kept off the cluster they record.', y0=56)


# 07 · When a session ends (process) -----------------------------------------------------------------------------------
def d07():
    b = ''
    b += zone(24, 64, 232, 264, 'Under the session\'s grant')
    b += path([(240, 132), (280, 132), (280, 192), (320, 192)])
    b += path([(240, 268), (280, 268), (280, 208), (320, 208)])
    b += path([(504, 200), (552, 200)], 'accent')
    b += path([(736, 200), (784, 200)])
    b += node(40, 96, 200, 72, 'Delete the copy', 'grace period 0', tag='1 · copy mode')
    b += node(40, 232, 200, 72, 'Restart the pod', 'Argo CD, else direct', tag='2 · live mode')
    b += node(320, 164, 184, 72, 'Remove the grant', 'RoleBinding deleted', 'focal', tag='3')
    b += node(552, 164, 184, 72, 'Store the recording', 'SHA-256 on the record', 'store', tag='4')
    b += node(784, 164, 184, 72, 'Audit', 'end reason and notes', tag='5')
    b += text(40, 320, 'never a last ready pod on Flight', 8, 400, SOFT, mono=True)
    b += callout(40, 396, 'What cannot be cleaned up becomes a note on the record; the expiry label is the backstop.')
    b += legend(436, [('backend', 'Step'), ('focal', 'Access revoked'), ('store', 'Kept for a year'),
                      ('accent', 'From here, no access')])
    write('07-end-cleanup', 'Break-glass · 07 · Process', 'When a session ends',
          'The end of a session, in order: delete the copy pod in copy mode or restart the live pod in live mode, both while '
          'the grant still allows it; then remove the grant; then store the recording with its SHA-256; then audit the '
          'outcome with any notes.',
          b, 468, 'The same cleanup for every end reason: you, the clock, idle, a closed tab, a crash.', y0=48)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for d in (d01, d02, d03, d04, d05, d06, d07):
        d()
    print('wrote', sorted(f for f in os.listdir(OUT) if f.endswith('.html')))
