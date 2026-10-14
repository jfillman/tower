"""Release record diagrams for docs/release-records/diagrams (diagram-design skill, Hangar profile).

python3 tools/diagrams/release_records.py                       # writes the .html sources
python3 tools/diagrams/png.py docs/release-records/diagrams      # renders each diagram's SVG to a 2x PNG next to it
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import lib
from lib import *  # noqa: F401,F403

lib.FOOTER = 'Tower · Release records'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'release-records', 'diagrams')
W = 1000
LIFE = 'rgba(27,31,36,0.20)'


def write(slug, eyebrow, title, desc, body, H, lede, y0=0):
    with open(os.path.join(OUT, f'{slug}.html'), 'w') as f:
        f.write(page(slug, eyebrow, title, desc, body, W, H, lede=lede, y0=y0))


# 01 · One release, from draft to outcome (lifecycle phase map) ---------------------------------------------------------
def d01():
    b = ''
    b += zone(8, 80, 984, 120, 'Progress')
    b += zone(8, 216, 984, 104, 'Wait')
    b += zone(8, 352, 984, 120, 'Outcome')
    # arrows first
    b += path([(192, 144), (248, 144)]) + hlab(192, 248, 144, 'promote')
    b += path([(424, 144), (480, 144)]) + hlab(424, 480, 144, 'merged')
    b += path([(640, 144), (696, 144)]) + hlab(640, 696, 144, 'healthy')
    b += path([(392, 176), (392, 240)]) + vlab(392, 176, 240, 'hand-flown')
    b += path([(480, 272), (552, 272), (552, 176)]) + vlab(552, 176, 272, 'signed')
    b += path([(272, 176), (272, 384)]) + vlab(272, 176, 384, 'PR closed', side='l')
    b += path([(624, 176), (624, 384)]) + vlab(624, 176, 384, 'superseded')
    b += path([(760, 176), (760, 384)]) + vlab(760, 176, 384, '7d or replaced')
    b += path([(864, 144), (920, 144), (920, 384)]) + vlab(920, 144, 384, 'rollback')
    # phases
    b += node(24, 112, 168, 64, 'Draft', 'glidepath/releases/next.yaml', 'focal')
    b += node(248, 112, 176, 64, 'Release PR', 'to the sign-off env')
    b += node(480, 112, 160, 64, 'Rolling out', 'Argo CD sync, Rollout')
    b += node(696, 112, 168, 64, 'Baking', 'healthy · day N of 7')
    # wait
    b += node(304, 240, 176, 64, 'Awaiting sign-off', 'status pending', 'optional')
    # outcomes
    b += node(184, 384, 184, 64, 'Stopped before production', 'never reached it', 'store')
    b += node(520, 384, 184, 64, 'Replaced before healthy', 'never went healthy', 'store')
    b += node(720, 384, 128, 64, 'Clean', 'healthy to the end', 'store')
    b += node(864, 384, 112, 64, 'Rolled back', 'names the target', 'store')
    b += callout(24, 516, 'The record is committed once the first Flight environment is healthy; its outcome follows in a second PR.')
    b += callout(24, 544, 'A Hand-flown release merged without a sign-off still ships, and raises "Shipped without a sign-off".')
    b += legend(584, [('focal', 'Opens when the last release ships'), ('backend', 'Phase'), ('optional', 'Hand-flown only'),
                      ('store', 'Outcome, written to the record')])
    write('01-lifecycle', 'Release records · 01 · Lifecycle', 'One release, from draft to outcome',
          'A release starts as the draft, which opens when the previous release ships. Promote opens the release PR to '
          'the sign-off environment; a Hand-flown app waits there for a sign-off. Once merged it rolls out, then bakes '
          'while healthy. It ends in one of four outcomes: stopped before production if the PR closed, replaced before '
          'healthy if superseded while rolling out, clean after seven healthy days or a healthy replacement, or rolled '
          'back.',
          b, 616, 'The record exists before any PR is opened, and keeps going after the release ships.', y0=56)


# 02 · Where a release's data lives (architecture) ----------------------------------------------------------------------
def d02():
    b = ''
    b += zone(8, 56, 448, 504, 'Backstage')
    b += zone(488, 56, 504, 336, 'GitHub')
    b += zone(488, 424, 504, 136, 'Dev cluster · kiac-dev')
    # arrows first
    b += path([(200, 168), (272, 168)], 'link') + hlab(200, 272, 168, 'REST', LINK)
    b += path([(272, 424), (200, 424)]) + hlab(200, 272, 424, 'announce')
    b += path([(440, 128), (584, 128)]) + hlab(440, 584, 128, 'draft, release')
    b += path([(440, 228), (584, 228)]) + hlab(440, 584, 228, 'PRs, statuses')
    b += path([(440, 328), (584, 328)]) + hlab(440, 584, 328, 'mode PR')
    b += path([(584, 496), (440, 496)], dashed=True) + hlab(440, 584, 496, 'outcomes')
    # nodes
    b += node(32, 136, 168, 64, 'Tower', 'Record tab · Ops Wall', 'input')
    b += node(32, 392, 168, 64, 'Notifications', 'Activity · Releases')
    b += node(272, 96, 168, 440, 'Backstage backend', None, 'focal')
    for i, line in enumerate(('release routes', 'sign-off poll · 2 min', 'record poll · hourly', 'calendar · 5 min cache')):
        b += text(356, 344 + i * 16, line, 8, 400, MUTED, 'middle', mono=True)
    b += node(584, 96, 368, 64, 'App repo', 'glidepath/releases/next.yaml · GitHub Releases', 'store')
    b += node(584, 196, 368, 64, 'gitops-<app>', 'release PRs · releases/<app>@<tag>.yaml', 'store')
    b += node(584, 296, 368, 64, 'gitops-cluster-dev-tenants', 'release-modes.yaml', 'store')
    b += node(584, 464, 368, 64, 'Release tracking', 'ConfigMaps in app-<app>-cicd, swept after 14 days', 'store')
    b += callout(24, 604, 'Only the draft is a direct commit, and it builds nothing. Every other write is a PR, a status or a Release.')
    b += legend(644, [('input', 'You'), ('focal', 'Decides and writes'), ('store', 'Where it lives'), ('link', 'Browser call'),
                      ('muted-dash', 'Read only')])
    write('02-where-it-lives', 'Release records · 02 · Architecture', "Where a release's data lives",
          "Tower talks only to Backstage's backend. The backend commits the draft to the app repo and publishes GitHub "
          'Releases there; opens release record and outcome PRs and sets sign-off statuses in gitops-<app>; opens the '
          'release-mode PR in gitops-cluster-dev-tenants; reads outcomes from Glidepath\'s release-tracking ConfigMaps '
          'on the dev cluster; and announces releases through Backstage notifications.',
          b, 676, 'Everything is in git or on GitHub, except the tracking records Glidepath keeps for 14 days.', y0=32)


# 03 · A Hand-flown release (sequence) ----------------------------------------------------------------------------------
def d03():
    xs = {'you': 100, 'rev': 290, 'gh': 500, 'bs': 720, 'gp': 900}
    b = ''
    for cx in xs.values():
        b += f'<line x1="{cx}" y1="88" x2="{cx}" y2="532" stroke="{LIFE}" stroke-width="1" stroke-dasharray="3,3"/>'

    def msg(a, z, y, label, color='muted', dashed=False, open_=False, at=None):
        x1, x2 = xs[a], xs[z]
        s = path([(x1, y), (x2, y)], 'open' if open_ else color, dashed=dashed)
        c = {'muted': SOFT, 'accent': ACC, 'link': LINK}[color]
        return s + (lab(at, y - 18, label, c) if at else hlab(min(x1, x2), max(x1, x2), y, label, c))
    b += msg('gp', 'gh', 136, 'release PR', at=810)
    b += msg('bs', 'gh', 180, 'status pending')
    b += msg('bs', 'you', 224, 'ready for prod', dashed=True, open_=True, at=610)
    b += msg('rev', 'gh', 268, 'approve', 'accent')
    b += msg('bs', 'gh', 312, 'status success')
    b += msg('you', 'gh', 356, 'merge', at=395)
    b += msg('bs', 'you', 400, 'released', dashed=True, open_=True, at=610)
    b += msg('bs', 'gh', 444, 'record PR')
    b += msg('bs', 'gh', 488, 'outcome PR', dashed=True)
    b += text(xs['bs'] + 12, 184, 'every 2 min', 8, 400, SOFT, mono=True)
    b += text(xs['bs'] + 12, 448, 'within minutes', 8, 400, SOFT, mono=True)
    b += text(xs['bs'] + 12, 492, 'when final', 8, 400, SOFT, mono=True)
    b += node(20, 40, 160, 48, 'You', None, 'input')
    b += node(210, 40, 160, 48, 'Second account', None, 'focal')
    b += node(420, 40, 160, 48, 'GitHub', None, 'external')
    b += node(640, 40, 160, 48, 'Tower backend', None, 'backend')
    b += node(820, 40, 160, 48, 'Glidepath', None, 'backend')
    b += callout(20, 572, 'The sign-off counts only from someone who neither merged nor opened the PR, before the merge.')
    b += legend(612, [('muted', 'Call'), ('open-dash', 'Notification'), ('accent', 'Sign-off')])
    write('03-hand-flown', 'Release records · 03 · Sequence', 'A Hand-flown release',
          'Glidepath opens the release PR to production. Every two minutes the Tower backend sets the sign-off status to '
          'pending and announces that the release is ready. A second GitHub account approves; the status turns to '
          'success. You merge; the backend announces the release. Within minutes it commits the release record, and '
          'once the outcome is final it opens the outcome PR.',
          b, 644, 'Two people, one PR. The status says whether a sign-off counts; it cannot stop the merge.', y0=24)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for d in (d01, d02, d03):
        d()
    print('wrote', sorted(f for f in os.listdir(OUT) if f.endswith('.html')))
