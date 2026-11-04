"""Builds the cms-demo incident workshop deck from the Coralogix dark template.

Each slide reuses one template slide; text is replaced paragraph by paragraph, copying the
template's own paragraph and run formatting (fonts, sizes, colors), so the deck keeps its look.
"""
import copy
import os
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

TEMPLATE = os.environ.get("DECK_TEMPLATE", "/Users/romanloginovskiy/projects/tam-core/templates/Presentation Template Dark 26 (1).pptx")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "cms-incident-workshop.pptx")

GREEN = "73F391"
WHITE = "FCFCFC"
GREY = "C9CDD2"
WARN = "FF7A6B"

prs = Presentation(TEMPLATE)

# ---- structure: keep 12 template slides in the new order, drop the rest, unhide ----------------
ORDER = [1, 2, 6, 9, 17, 3, 4, 19, 14, 18, 13, 24]
sld_lst = prs.slides._sldIdLst
ids = list(sld_lst)
keep = [ids[n - 1] for n in ORDER]
for el in ids:
    sld_lst.remove(el)
    if el not in keep:
        prs.part.drop_rel(el.get(qn("r:id")))
for el in keep:
    sld_lst.append(el)
slides = list(prs.slides)
for s in slides:
    s._element.attrib.pop("show", None)


def shape(slide, sid):
    for sh in slide.shapes:
        if sh.shape_id == sid:
            return sh
    raise KeyError(sid)


def _set_rpr_color(r, hexcolor):
    rpr = r.find(qn("a:rPr"))
    for old in rpr.findall(qn("a:solidFill")):
        rpr.remove(old)
    fill = rpr.makeelement(qn("a:solidFill"), {})
    clr = fill.makeelement(qn("a:srgbClr"), {"val": hexcolor})
    fill.append(clr)
    # solidFill must precede latin/ea/cs font elements
    anchor = None
    for tag in ("a:latin", "a:ea", "a:cs", "a:sym", "a:hlinkClick"):
        anchor = rpr.find(qn(tag))
        if anchor is not None:
            break
    if anchor is not None:
        anchor.addprevious(fill)
    else:
        rpr.append(fill)


def set_text(sh, paras, align=None):
    """paras: list of (template_paragraph_index, [run, ...]) or (index, runs, {"space_before": pt});
    a run is a str or (str, {"color": hex, "bold": bool, "size": pt}).
    Run k copies template run min(k, last)."""
    body = sh.text_frame._txBody
    src = list(body.iterchildren(qn("a:p")))
    tmpl = [copy.deepcopy(p) for p in src]
    for p in src:
        body.remove(p)
    for entry in paras:
        idx, runs = entry[0], entry[1]
        popts = entry[2] if len(entry) > 2 else {}
        p = copy.deepcopy(tmpl[idx])
        tr = p.findall(qn("a:r"))
        for r in tr:
            p.remove(r)
        for br in p.findall(qn("a:br")):
            p.remove(br)
        end = p.find(qn("a:endParaRPr"))
        for k, run in enumerate(runs):
            text, opts = (run, {}) if isinstance(run, str) else run
            if not tr:
                raise ValueError(f"template paragraph {idx} of shape {sh.shape_id} has no runs")
            r = copy.deepcopy(tr[min(k, len(tr) - 1)])
            r.find(qn("a:t")).text = text
            if "color" in opts:
                _set_rpr_color(r, opts["color"])
            if "bold" in opts:
                r.find(qn("a:rPr")).set("b", "1" if opts["bold"] else "0")
            if "size" in opts:
                r.find(qn("a:rPr")).set("sz", str(int(opts["size"] * 100)))
            if end is not None:
                end.addprevious(r)
            else:
                p.append(r)
        if align is not None or "space_before" in popts:
            ppr = p.find(qn("a:pPr"))
            if ppr is None:
                ppr = p.makeelement(qn("a:pPr"), {})
                p.insert(0, ppr)
            if align is not None:
                ppr.set("algn", align)
            if "space_before" in popts:
                for old in ppr.findall(qn("a:spcBef")):
                    ppr.remove(old)
                spc = ppr.makeelement(qn("a:spcBef"), {})
                spc.append(spc.makeelement(qn("a:spcPts"), {"val": str(int(popts["space_before"] * 100))}))
                ppr.insert(0, spc)
        body.append(p)


def restyle_like(dst, src):
    """Give card dst the fill and outline of card src (e.g. drop a dashed placeholder border)."""
    d, s_ = dst._element.spPr, src._element.spPr
    for tag in ("a:solidFill", "a:ln"):
        old, new = d.find(qn(tag)), s_.find(qn(tag))
        if new is None:
            continue
        if old is not None:
            d.replace(old, copy.deepcopy(new))
        else:
            d.append(copy.deepcopy(new))


def bar(sh, text, lead="In your world:  "):
    set_text(sh, [(0, [(lead, {"color": GREEN}), (text, {"color": WHITE})])])


def command(slide, text):
    """Small presenter cue under the bottom bar: the command for this beat."""
    tb = slide.shapes.add_textbox(Inches(0.9), Inches(10.38), Inches(18.19), Inches(0.5))
    tb.name = "presenter-command"
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = 0
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    r = p.add_run()
    r.text = text
    r.font.name = "Courier New"
    r.font.size = Pt(14)
    r.font.color.rgb = RGBColor.from_string(GREY)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text.strip()


# ---- diagram helpers: native shapes in the template's card style ----------------------------------
DARK = "0B130D"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def _fill_xml(hexcolor, alpha):
    return (f'<a:solidFill xmlns:a="{A_NS}"><a:srgbClr val="{hexcolor}">'
            f'<a:alpha val="{alpha * 1000}"/></a:srgbClr></a:solidFill>')


def _restyle(sp, fill, line, line_w=12700, dash=None):
    """fill/line: (hex, alpha%) or None. Replaces the default theme style of a new shape."""
    from lxml import etree
    style = sp.find(qn("p:style"))
    if style is not None:
        sp.remove(style)
    sppr = sp.find(qn("p:spPr"))
    for tag in ("a:solidFill", "a:noFill", "a:gradFill", "a:ln"):
        for el in sppr.findall(qn(tag)):
            sppr.remove(el)
    sppr.append(etree.fromstring(_fill_xml(*fill)) if fill else etree.fromstring(f'<a:noFill xmlns:a="{A_NS}"/>'))
    ln = etree.fromstring(f'<a:ln xmlns:a="{A_NS}" w="{line_w}"/>')
    if line:
        ln.append(etree.fromstring(_fill_xml(*line)))
        if dash:
            ln.append(etree.fromstring(f'<a:prstDash xmlns:a="{A_NS}" val="{dash}"/>'))
    else:
        ln.append(etree.fromstring(f'<a:noFill xmlns:a="{A_NS}"/>'))
    sppr.append(ln)
    return ln


def _run(p, text, size, color, bold=False):
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.name = "Plus Jakarta Sans SemiBold" if bold else "Plus Jakarta Sans"
    r.font.color.rgb = RGBColor.from_string(color)
    return r


BOX_STYLES = {
    #            fill              line              title  sub
    "card":      (("FFFFFF", 5),   (GREEN, 44),      GREEN, WHITE),
    "accent":    ((GREEN, 100),    None,             DARK,  DARK),
    "muted":     (("FFFFFF", 3),   (GREEN, 22),      GREY,  GREY),
    "container": (("FFFFFF", 2),   (GREEN, 30),      None,  None),
}


def box(slide, x, y, w, h, title=None, sub=None, kind="card", name=None, title_size=18, sub_size=14):
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.name = name or f"diagram-{(title or kind).lower().replace(' ', '-')}"
    sh.adjustments[0] = 0.08 if kind == "container" else 0.16
    fill, line, tcol, scol = BOX_STYLES[kind]
    _restyle(sh._element, fill, line)
    tf = sh.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = Inches(0.1)
    tf.margin_top = tf.margin_bottom = Inches(0.05)
    if title:
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        _run(p, title, title_size, tcol, bold=True)
        if sub:
            p2 = tf.add_paragraph()
            p2.alignment = PP_ALIGN.CENTER
            _run(p2, sub, sub_size, scol)
    return sh


def label(slide, x, y, w, h, text, size=13, color=GREEN, bold=True, align=PP_ALIGN.LEFT):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.name = f"diagram-label-{text[:20].lower().replace(' ', '-')}"
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.alignment = align
    _run(p, text, size, color, bold=bold)
    return tb


def arrow(slide, *pts, color=GREEN, alpha=80, width=22225):
    """Straight segments through pts (inches); arrowhead on the last segment."""
    from lxml import etree
    from pptx.enum.shapes import MSO_CONNECTOR
    for i in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[i], pts[i + 1]
        cx = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
        cx.name = "diagram-arrow"
        ln = _restyle(cx._element, None, (color, alpha), line_w=width)
        ln.append(etree.fromstring(f'<a:round xmlns:a="{A_NS}"/>'))
        if i == len(pts) - 2:
            ln.append(etree.fromstring(f'<a:tailEnd xmlns:a="{A_NS}" type="triangle" w="med" len="med"/>'))


def remove_shapes(slide, ids):
    for sid in ids:
        el = shape(slide, sid)._element
        el.getparent().remove(el)


s = dict(zip(range(1, 13), slides))

# ---- 1. Title --------------------------------------------------------------------------------------
sl = s[1]
set_text(shape(sl, 901), [(0, ["LIVE WORKSHOP"])])
set_text(shape(sl, 902), [(0, ["From alert ", "to root cause"])])
set_text(shape(sl, 903), [(0, ["Investigate a production outage end to end with Coralogix and Olly, from the first page to the fix."])])
set_text(shape(sl, 904), [(0, ["Roman Loginovskiy, Technical Account Manager, Coralogix"])])
notes(sl, """
Welcome. Today we work through one realistic production incident, end to end, the way your on-call engineers would: from the Slack page to the root cause to the fix.
Format: about 50 minutes. A few slides to set the scene; most of the time is live in Coralogix, Slack and a terminal.
Everything runs on this laptop: an Amazon EKS cluster emulated locally, delivered by GitOps, sending real telemetry to Coralogix. The AWS metrics are emulated; I'll flag them when they appear.

PREFLIGHT (T-30 min, see workshop/demo/incident-runbook.md):
  export KUBECONFIG=infra/local/.kubeconfig
  kubectl -n argocd get applications            # all Synced / Healthy
  workshop/demo/scripts/load.sh status          # k6 up (else: load.sh start 40)
  workshop/demo/scripts/watch.sh 1              # pg limit=2, backend=2/2, probe < 100 ms
  ls infra/local/.incident/injected-at          # must not exist
  kubectl -n llm scale deploy/vllm --replicas=0 # keep the node CPU quiet
""")

# ---- 2. Agenda ---------------------------------------------------------------------------------------
sl = s[2]
set_text(shape(sl, 901), [(0, ["IN THIS SESSION"])])
set_text(shape(sl, 902), [
    (0, ["•  ", "The system: a CMS on Kubernetes, delivered by GitOps"]),
    (1, ["•  ", "How its telemetry reaches Coralogix"]),
    (2, ["•  ", "A live incident, beat by beat: change, page, escalation"]),
    (3, ["•  ", "Investigate with Olly, then fix it through Git"]),
])
set_text(shape(sl, 904), [
    (0, ["THREE KEY TAKEAWAYS"]),
    (1, ["1.  ", "Start from the symptom"]),
    (2, ["Alert, then service, then resource, in that order"]),
    (3, ["2.  ", "Every change is a suspect"]),
    (4, ["Commits, syncs and scale-outs on one timeline"]),
    (5, ["3.  ", "Stop the bleeding through Git"]),
    (6, ["Stop the amplification first, then revert"]),
])
notes(sl, """
The path for the session: the system, how its telemetry gets to Coralogix, then a live incident in three beats, then the investigation with Olly and the fix.
Three things to take home. Start from the symptom and narrow down. Treat every recent change as a suspect, including your own on-call actions. And fix through the same path the change came in, Git, after you stop whatever is making it worse.
""")

# ---- 3. The system under test -----------------------------------------------------------------------
sl = s[3]
set_text(shape(sl, 900), [(0, ["The ", "system", " under test"])])
set_text(shape(sl, 901), [(0, ["A content-management app on Amazon EKS, with the same moving parts as most of your services."])])
remove_shapes(sl, range(902, 918))
# Boundaries: the EKS cluster and the AWS managed services next to it.
box(sl, 4.35, 3.55, 11.05, 5.3, kind="container", name="diagram-eks")
label(sl, 4.65, 3.68, 8.0, 0.35, "AMAZON EKS  ·  cluster cms-local")
box(sl, 15.75, 3.55, 3.35, 5.3, kind="container", name="diagram-aws")
label(sl, 16.05, 3.68, 2.9, 0.35, "AWS MANAGED")
R1, R2, R3, H = 4.15, 5.85, 7.45, 1.15
# Outside the cluster
box(sl, 0.9, R1, 2.95, H, "Users & clients", "browsers (RUM), API load")
box(sl, 0.9, R3, 2.95, H, "Git repository", "every change is a commit")
# Inside the cluster
box(sl, 4.75, R1, 2.75, H, "Envoy Gateway", "routes /cms and /api")
box(sl, 4.75, R3, 2.75, H, "Argo CD", "syncs Git to the cluster")
box(sl, 8.25, R1, 3.0, H, "cms-frontend", "web app")
box(sl, 8.25, R2, 3.0, H, "cms-backend API", ".NET, EF Core, 2 replicas")
box(sl, 12.0, R1, 3.0, H, "media-worker", "processes uploads")
box(sl, 12.0, R2, 3.0, H, "cms-postgres", "PostgreSQL, 50 connections", kind="accent")
box(sl, 8.25, R3, 6.75, H, "Also running", "canvas app  ·  browser load generator  ·  Coralogix agent", kind="muted")
# AWS managed services
box(sl, 16.0, R1, 2.85, H, "Amazon MSK", "Kafka: media.uploaded")
box(sl, 16.0, R2, 2.85, H, "Secrets Manager", "via External Secrets")
box(sl, 16.0, R3, 2.85, H, "Amazon ECR", "container images")
# Request path and data flows
mid1, mid2, mid3 = R1 + H / 2, R2 + H / 2, R3 + H / 2
arrow(sl, (3.85, mid1), (4.75, mid1))                                   # users -> gateway
arrow(sl, (7.5, mid1), (8.25, mid1))                                    # gateway -> frontend
arrow(sl, (6.125, R1 + H), (6.125, mid2), (8.25, mid2))                 # gateway -> backend (/api)
arrow(sl, (11.25, mid2), (12.0, mid2))                                  # backend -> postgres
arrow(sl, (11.25, R2 + 0.22), (11.62, R2 + 0.22), (11.62, 5.55), (17.425, 5.55), (17.425, R1 + H))  # backend -> MSK
arrow(sl, (16.0, mid1), (15.0, mid1))                                   # MSK -> media-worker
arrow(sl, (3.85, mid3), (4.75, mid3))                                   # Git -> Argo CD
label(sl, 11.3, mid2 + 0.08, 0.75, 0.3, "pool 20", size=11, color=GREY, bold=False, align=PP_ALIGN.CENTER)
bar(shape(sl, 919), "swap in your own gateway, API and database. The failure modes are the same.")
command(sl, "$ kubectl -n cms-demo get pods   ·   http://localhost:8080/cms")
notes(sl, """
The system: users and an API load generator come in through Envoy Gateway. cms-backend is a .NET API using Entity Framework, two replicas, in front of a PostgreSQL database that allows 50 connections. Around it: a frontend, a media worker on Kafka (Amazon MSK), and a second app.
Everything is delivered by Argo CD from Git: nobody runs kubectl apply. That matters later.
Ask the room: how many of you have a gateway, an API with a connection pool, and a database with a connection limit? That is the shape of this incident.

RUN (optional, show the live system):
  kubectl -n cms-demo get pods
  kubectl -n argocd get applications
  open http://localhost:8080/cms
""")

# ---- 4. How telemetry reaches Coralogix ----------------------------------------------------------
sl = s[4]
set_text(shape(sl, 900), [(0, ["OBSERVABILITY"])])
set_text(shape(sl, 901), [(0, ["How telemetry reaches ", "Coralogix"])])
set_text(shape(sl, 902), [(0, ["Four lanes into one platform, and one path from the alert to the team that owns it."])])
remove_shapes(sl, range(903, 910))
X_SRC, W_SRC = 0.9, 3.6
X_COL, W_COL = 5.25, 3.5
X_CX, W_CX = 9.3, 5.95          # Coralogix container
X_CAP, W_CAP = 9.6, 5.35
X_RSP, W_RSP = 15.75, 3.35
LANES = [3.95, 5.2, 6.45, 7.7]
LH = 1.0
label(sl, X_SRC, 3.52, W_SRC, 0.32, "SOURCES")
label(sl, X_COL, 3.52, W_COL, 0.32, "COLLECTION")
label(sl, X_RSP, 3.52, W_RSP, 0.32, "RESPONSE")
box(sl, X_CX, 3.45, W_CX, 5.5, kind="container", name="diagram-coralogix")
label(sl, X_CAP, 3.52, W_CAP, 0.32, "CORALOGIX")
lanes = [
    (("Services", "OpenTelemetry SDK in each pod"),
     ("Coralogix OTel agent", "DaemonSet on every node"),
     ("APM", "span metrics: rate, errors, p95")),
    (("Kubernetes", "nodes, pods, events, logs"),
     ("Cluster collector", "objects, events, cluster metrics"),
     ("Infrastructure & logs", "CPU, throttling, restarts, logs")),
    (("Changes", "Git pushes, Argo CD syncs"),
     ("Ops-events API", "Argo CD Notifications, push hook"),
     ("Annotations", "commit and author on APM charts")),
    (("AWS (emulated)", "EC2 CPU, EBS I/O"),
     ("Coralogix OTel agent", "CloudWatch-shaped metrics"),
     ("AWS metrics", "amazonaws_com_AWS_*")),
]
for y, (src, col, cap) in zip(LANES, lanes):
    box(sl, X_SRC, y, W_SRC, LH, *src, title_size=17, sub_size=13)
    box(sl, X_COL, y, W_COL, LH, *col, title_size=17, sub_size=13)
    box(sl, X_CAP, y, W_CAP, LH, *cap, title_size=17, sub_size=13)
    arrow(sl, (X_SRC + W_SRC, y + LH / 2), (X_COL, y + LH / 2))
    arrow(sl, (X_COL + W_COL, y + LH / 2), (X_CAP, y + LH / 2))
response = [
    ("P1 alert", "p95 > 150 ms for 2 min", "card"),
    ("Case", "owner: team cms-platform", "card"),
    ("Router", "team label picks Slack", "card"),
    ("Slack + Olly", "#production-alerts thread", "accent"),
]
for i, (y, (t, sub, kind)) in enumerate(zip(LANES, response)):
    box(sl, X_RSP, y, W_RSP, LH, t, sub, kind=kind, title_size=17, sub_size=13)
    if i:
        arrow(sl, (X_RSP + W_RSP / 2, LANES[i - 1] + LH), (X_RSP + W_RSP / 2, y))
arrow(sl, (X_CAP + W_CAP, LANES[0] + LH / 2), (X_RSP, LANES[0] + LH / 2))   # APM -> alert
bar(shape(sl, 911), "the same Helm chart and the same OpenTelemetry SDKs you would deploy.")
command(sl, "$ kubectl -n observability get pods")
notes(sl, """
How the data gets there. Each service has the OpenTelemetry SDK. The Coralogix OpenTelemetry agent runs on every node (one Helm chart) and turns spans into APM span metrics: request rate, errors and latency percentiles per route and per database call. The cluster collector adds Kubernetes metrics, events and logs.
Changes are telemetry too: every Git push and every Argo CD sync is sent as an annotation, so the APM charts show what changed and who changed it.
Routing: the P1 alert opens a Case; a Notification Center router picks it up by the owning team's label and posts to Slack.
The AWS panel uses CloudWatch-shaped metrics that we emulate locally from real node signals; in your AWS account these come from CloudWatch Metric Streams.

RUN (optional):
  kubectl -n observability get pods
  Dashboard: https://watcher.coralogix.com/dashboards/d4IsawufLdsXdj6trjkyx
""")

# ---- 5. The scenario --------------------------------------------------------------------------------
sl = s[5]
set_text(shape(sl, 900), [(0, ["LIVE INCIDENT"])])
set_text(shape(sl, 901), [(0, ["Right-sized ", "into an outage"])])
set_text(shape(sl, 902), [(0, ["A sensible cost-saving change, an on-call reflex, and a database that runs out of room."])])
set_text(shape(sl, 904), [
    (0, ["What you will see"]),
    (1, ["1.  ", "FinOps trims the database CPU to its average use"]),
    (2, ["2.  ", "Latency climbs; a P1 alert lands in Slack"]),
    (3, ["3.  ", "On-call scales the API to absorb it; errors jump"]),
    (4, ["4.  ", "Olly and Claude Code investigate from the alert"]),
    (5, ["5.  ", "The fix goes through Git; Coralogix confirms it"]),
])
restyle_like(shape(sl, 905), shape(sl, 903))
cast = [
    ("Dana, FinOps", "right-sizes cms-postgres to its average CPU (FIN-142)"),
    ("Sam, on call", "scales cms-backend 2 → 8 to absorb latency (INC-1103)"),
    ("You, incident commander", "investigate with Olly in the alert thread"),
    ("Claude Code", "a second investigator in the terminal, read-only"),
]
paras = [(0, [("The cast", {"size": 22})])]
for who, what in cast:
    paras.append((1, [(who, {"color": WHITE, "bold": True, "size": 20})], {"space_before": 16}))
    paras.append((1, [(what, {"color": GREY, "size": 18})]))
set_text(shape(sl, 906), paras, align="l")
notes(sl, """
The scenario is called "right-sized into an outage". Nobody does anything wrong on purpose.
Dana from FinOps sees the database averaging a tiny fraction of its CPU and right-sizes it. Sam is on call, gets paged for latency, and does what most of us would do: add replicas. Together those two reasonable actions turn a slowdown into an outage.
You are the incident commander. You will use Olly in the alert thread, and Claude Code runs the same investigation in a terminal, read-only.

RUN: nothing yet. Check that the alert is OK and the status pane is up:
  workshop/demo/scripts/watch.sh
""")

# ---- 6. Beat 1: the change --------------------------------------------------------------------------
sl = s[6]
set_text(shape(sl, 900), [(0, ["T0: a ", "cost-saving commit"])])
set_text(shape(sl, 901), [(0, ["Dana from FinOps opens FIN-142: Postgres averages 0.04 cores against a 2-core limit."])])
set_text(shape(sl, 903), [(0, ["The change"]), (1, ["\"Right-size cms-postgres to observed usage\": CPU limit 2 → 60m"])])
set_text(shape(sl, 905), [(0, ["The delivery"]), (1, ["Reviewed, merged, and synced by Argo CD in under 30 seconds"])])
set_text(shape(sl, 907), [(0, ["The trap"]), (1, ["Average is not peak. At its limit the database is throttled, not just busy"])])
bar(shape(sl, 909), "a sensible commit that passes review. Would you tie it to the page that follows?")
command(sl, "$ workshop/demo/scripts/inject.sh")
notes(sl, """
T0. Dana pushes FIN-142: the database's CPU limit goes from 2 cores to 60 millicores, because the 30-day average is 0.04 cores. It is reviewed, merged, and Argo CD syncs it within seconds. Postgres restarts with the new limit.
The trap: averages hide peaks. Under load the database hits its CPU quota and the kernel throttles it.
Ask the room: who reviews resource-limit changes in your org, and would they look at peak or average?

RUN:
  workshop/demo/scripts/inject.sh
  # expected: "injected: cms-postgres CPU limit 2 -> 60m" and "on-call watcher started"
SHOW (optional):
  git --git-dir=infra/local/.incident/gitops.git log -1 --stat local
  kubectl -n argocd get application cms-demo-local
""")

# ---- 7. Beat 2: the page ----------------------------------------------------------------------------
sl = s[7]
set_text(shape(sl, 900), [(0, ["T+2 min: ", "the page"])])
set_text(shape(sl, 901), [(0, ["The P1 alert opens a Case, routed by the owning team's label to Slack #production-alerts."])])
set_text(shape(sl, 903), [(0, ["Symptom"]), (1, ["API p95 from about 50 ms to seconds"])])
set_text(shape(sl, 905), [(0, ["Scope"]), (1, ["demo-cms-api, every route; DB call p95 climbs too"])])
set_text(shape(sl, 907), [(0, ["Resource"]), (1, ["Postgres pinned at 60m and throttled"])])
set_text(shape(sl, 909), [(0, ["Errors"]), (1, ["Still near zero: users wait, they do not fail yet"])])
bar(shape(sl, 911), "your first five minutes. Who is affected, since when, and is it getting worse?")
command(sl, "$ workshop/demo/scripts/watch.sh")
notes(sl, """
About two minutes in, the P1 alert "[cms-local] CMS API p95 latency > 150 ms" fires. It opens a Case owned by team cms-platform, and the router posts it to #production-alerts with a link to the service dashboard.
Walk the dashboard top to bottom like an on-call engineer: the symptom (API p95), the scope (one service, all routes, database calls slow too), the resource (Postgres CPU at its limit, throttling), and errors (still low).
Ask the room: what is your first move here? Most people say "check what changed" or "check the database". Both are right; Olly will do both.

RUN / SHOW:
  workshop/demo/scripts/watch.sh            # pg limit=60m, probe in 100s of ms to seconds
  Slack #production-alerts                   # note the alert time for the prompts
  Dashboard: https://watcher.coralogix.com/dashboards/d4IsawufLdsXdj6trjkyx
If the alert is late: narrate from the dashboard; it fires within ~2-4 min.
""")

# ---- 8. Beat 3: the fix that makes it worse ------------------------------------------------------
sl = s[8]
set_text(shape(sl, 900), [(0, ["T+5 MIN"])])
set_text(shape(sl, 901), [(0, ["The fix that makes it ", "worse"])])
set_text(shape(sl, 902), [(0, ["Sam is paged, sees latency, and scales cms-backend from 2 to 8 replicas to absorb it."])])
set_text(shape(sl, 904), [
    (0, ["Error ratio"]),
    (1, ["~50%"]),
    (2, ["of API calls failing within minutes"]),
    (3, ["Rehearsal on this cluster: 20% before the scale-out, 52% after"]),
])
set_text(shape(sl, 906), [(0, ["Database connections the API may open"])])
set_text(shape(sl, 907), [(0, ["2 pods"])])
set_text(shape(sl, 909), [(0, ["8 pods"])])
before_bar, after_bar = shape(sl, 908), shape(sl, 910)
full = Inches(7.5)
after_bar.width = full
before_bar.width = int(full * 40 / 160)
after_bar.fill.solid()
after_bar.fill.fore_color.rgb = RGBColor.from_string(WARN)
set_text(shape(sl, 911), [
    (0, [("✗  ", {"color": WARN}), "8 pods × a pool of 20 = 160, against max_connections 50"]),
    (1, [("✗  ", {"color": WARN}), "Postgres: 53300 \"sorry, too many clients already\""]),
    (2, [("✗  ", {"color": WARN}), "New pods fail at start-up on the slow database"]),
])
bar(shape(sl, 913), "adding replicas is the reflex. Ask first whether the bottleneck sits downstream.")
command(sl, "$ tail -f infra/local/.incident/oncall.log")
notes(sl, """
Sam is on call. He sees the page and latency in seconds, and does the classic thing: scale out. He commits "scale cms-backend 2 -> 8 to absorb latency" (INC-1103) and Argo CD applies it.
It gets worse. Each API pod has a connection pool of up to 20; 8 pods can ask for 160 connections against a limit of 50. Postgres starts refusing with 53300 "too many clients", new pods fail while starting against the slow database, and the error ratio jumps from about 20% to about 50%.
Ask the room: where in your stack does adding capacity in front of a shared dependency make it worse? Connection limits, rate limits, licence seats, a cache stampede.

RUN / SHOW (Sam acts automatically once the alert has fired on two checks, 2.5-7 min after the inject):
  tail -f infra/local/.incident/oncall.log   # "on-call: cms-backend replicas 2 -> 8"
  kubectl -n cms-demo get deploy cms-backend
  kubectl -n cms-demo logs -l app=cms-backend --since=2m | grep -c 53300
""")

# ---- 9. Meet Olly --------------------------------------------------------------------------------------
sl = s[9]
set_text(shape(sl, 900), [(0, ["MEET OLLY"])])
set_text(shape(sl, 901), [(0, ["Olly, your ", "observability agent"])])
set_text(shape(sl, 902), [(0, ["Coralogix's AI-native observability agent: ask in plain language, get answers from your own telemetry."])])
set_text(shape(sl, 904), [(0, ["✦  Where to find Olly"])])
set_text(shape(sl, 905), [(0, ["IN THE UI  ", "Olly tab, or the Olly AI drawer on any page (Cmd+I / Ctrl+I)"])])
set_text(shape(sl, 906), [(0, ["IN CONTEXT  ", "Ask Olly from a span or trace in APM, Tracing and RUM"])])
set_text(shape(sl, 907), [(0, ["IN SLACK  ", "@Olly in a channel or alert thread, then Open in Coralogix"])])
set_text(shape(sl, 908), [(0, ["Also: automatic Case analysis, the Olly API, and MCP for Cursor and Claude Code"])])
set_text(shape(sl, 910), [
    (0, ["What Olly does"]),
    (1, ["✓  ", "Reads logs, metrics, traces, alerts and Cases"]),
    (2, ["✓  ", "Runs multi-step investigations and root cause"]),
    (3, ["✓  ", "Answers with charts, queries and deep links"]),
    (4, ["✓  ", "Recommends next steps; you decide and act"]),
    (5, ["✓  ", "Sees only what your user is allowed to see"]),
])
bar(shape(sl, 912), "the thread where your team already talks becomes the investigation.")
notes(sl, """
Olly is Coralogix's AI-native observability agent. You ask in plain language; it queries your logs, metrics, traces, alerts and Cases, runs multi-step investigations, and answers with charts, queries and links back into the product. It recommends; you decide.
Where to find it: the Olly tab, or the Olly AI side drawer on any page (Cmd+I / Ctrl+I); "Ask Olly" from a span or trace in APM, Tracing or RUM; and in Slack, where you mention the Olly app in a channel or thread, and "Open in Coralogix" continues the conversation in the product. It can also analyse Cases automatically, and it is available through an API and an MCP server for tools like Cursor and Claude Code.
It only sees what your user is permitted to see.

Docs: https://coralogix.com/docs/user-guides/olly/  ·  Slack: https://coralogix.com/docs/user-guides/olly/slack/
""")

# ---- 10. Olly-driven investigation ------------------------------------------------------------------
sl = s[10]
set_text(shape(sl, 900), [(0, ["Investigate ", "with Olly"])])
set_text(shape(sl, 901), [(0, ["Ask outcome questions, not tool instructions. Follow Olly's links into the UI to verify."])])
set_text(shape(sl, 903), [
    (0, ["In the alert thread"]),
    (1, ["1.  ", "What is going on, and who is affected?"]),
    (2, [("     →  ", {"color": GREEN}), ("demo-cms-api latency since the page; CMS users", {"color": GREY})]),
    (3, ["2.  ", "What changed shortly before it started?"]),
    (4, [("     →  ", {"color": GREEN}), ("FIN-142 by Dana: cms-postgres CPU limit cut", {"color": GREY})]),
    (5, ["3.  ", "Why did it get worse after a few minutes?"]),
    (6, [("     →  ", {"color": GREEN}), ("Sam's scale-out: connections over the limit", {"color": GREY})]),
    (7, ["4.  ", "What should we do?"]),
    (8, [("     →  ", {"color": GREEN}), ("revert the scale-out and FIN-142 through Git", {"color": GREY})]),
])
set_text(shape(sl, 905), [
    (0, ["Then verify in Coralogix"]),
    (1, ["•  ", "Dashboard: API p95, DB p95, Postgres throttling"]),
    (2, ["•  ", "APM: change annotations at both pushes"]),
    (3, ["•  ", "Kubernetes: replicas 2 → 8, Postgres restart"]),
    (4, ["•  ", "Logs: 53300 too many clients"]),
    (5, ["•  ", "Side by side: Claude Code reaches the same cause"]),
])
command(sl, "$ cd workshop/demo/investigator && claude   (paste prompt.md)")
notes(sl, """
Now the investigation, in the Slack thread of the alert, mentioning Olly. Ask outcome questions in this order and accept Olly's wording as long as the facts match:
1. "What is going on, and who is affected?"  Expect: demo-cms-api latency (and later errors) since the page; CMS users.
   Backup: "Show the error rate and p95 of demo-cms-api for the last 30 minutes."
2. "What changed shortly before it started?"  Expect: the FIN-142 commit by Dana on cms-postgres (CPU limit), synced by Argo CD.
   Backup: "List deployments and configuration changes in cms-local in the last hour."
3. "Why did it get worse after a few minutes?"  Expect: Sam scaled cms-backend 2 -> 8; connections above max_connections; 53300.
   Backup: "How many cms-backend pods are running, and how many PostgreSQL connections are open?"
4. "What should we do?"  Expect: stop the amplification (revert the scale-out), revert FIN-142; later a connection budget or pooler.
   Backup: "Which change should we revert, and what stops the scaling loop?"
Then click through Olly's links into the dashboard and APM to verify: three signals of two types, one of them a change.

SIDE BY SIDE (start right after the page):
  cd workshop/demo/investigator && claude
  # paste workshop/demo/investigator/prompt.md with the alert time; it uses cx, kubectl (read-only) and the GitOps history
""")

# ---- 11. Fix through Git -----------------------------------------------------------------------------
sl = s[11]
set_text(shape(sl, 900), [(0, ["RECOVERY"])])
set_text(shape(sl, 901), [(0, ["Fix it ", "through Git"])])
set_text(shape(sl, 902), [(0, ["Stop the amplification, revert the change, and let Argo CD and Coralogix confirm it."])])
set_text(shape(sl, 904), [(0, ["During the incident", "   API p95 in seconds"])])
set_text(shape(sl, 910), [(0, ["After the revert", "   back to about 50 ms"])])
set_text(shape(sl, 914), [(0, ["↓ about 1 minute after the push; the alert resolves 6–8 minutes later"])])
set_text(shape(sl, 916), [
    (0, ["What you do"]),
    (1, ["✓  ", "Revert the scale-out: stop the amplification"]),
    (2, ["✓  ", "Revert FIN-142 in the same change"]),
    (3, ["✓  ", "Let Argo CD sync; never kubectl a GitOps object"]),
    (4, ["✓  ", "Watch p95, errors and the alert resolve"]),
])
bar(shape(sl, 918), "\"roll back\" is in every runbook. Roll back where the change came from: Git.")
command(sl, "$ FIX_AUTHOR_NAME=\"Roman Loginovskiy\" workshop/demo/scripts/fix.sh")
notes(sl, """
The fix is what Olly and Claude Code propose: first stop the amplification, then revert the original change. Both go through Git in one revert commit; a kubectl edit would be undone by Argo CD's self-heal within seconds.
Recovery: API latency is back to normal about a minute after the push; the P1 alert resolves in Slack 6-8 minutes later. The annotation for the fix appears on the APM chart next to the two changes that caused it.
Close with follow-ups: right-size on peak not average, a connection budget per service, a pooler, and scaling policies that know about downstream limits.

RUN:
  FIX_AUTHOR_NAME="Roman Loginovskiy" workshop/demo/scripts/fix.sh
  workshop/demo/scripts/watch.sh               # pg limit=2, backend=2/2, probe back to tens of ms
AFTER THE SESSION:
  workshop/demo/scripts/reset.sh               # ~30 s; wait for the alert to show OK before the next run
""")

# ---- 12. Recap & Q&A -------------------------------------------------------------------------------
sl = s[12]
set_text(shape(sl, 900), [(0, ["Recap ", "& Q&A"])])
set_text(shape(sl, 903), [(0, ["Start from the symptom: the alert, then the service, then the resource"])])
set_text(shape(sl, 906), [(0, ["Every change is a suspect: commits, syncs and scale-outs on one timeline"])])
set_text(shape(sl, 909), [(0, ["Stop the amplification first, then revert, always through Git"])])
set_text(shape(sl, 911), [(0, ["Prove the cause with three signals of two types, one of them a change. Olly gets you there faster."])])
set_text(shape(sl, 913), [(0, ["Thank you.   Olly docs: coralogix.com/docs/user-guides/olly"])])
notes(sl, """
Recap the three takeaways and the proof rule: a root cause needs at least three signals of at least two types, one of them a change event, and it must explain every symptom.
Questions. Good prompts if the room is quiet: Where would this have been caught in your pipeline? Which of your services would amplify a slow dependency? Where does Olly sit in your on-call flow today?

RESET after the session:
  workshop/demo/scripts/reset.sh
  # if Docker restarted: workshop/demo/scripts/recover.sh
""")

prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
