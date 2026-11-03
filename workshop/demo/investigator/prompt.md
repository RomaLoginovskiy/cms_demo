# Investigator prompt

Paste into Claude Code, started in this directory, as soon as the alert lands in Slack. Fill in the time from the Slack message.

```
Investigate the Coralogix alert "[cms-local] CMS API p95 latency > 150 ms" for cluster cms-local,
which started firing around <HH:MM UTC>. Find the root cause with evidence from Coralogix first,
then confirm read-only in the cluster, Argo CD and the GitOps history. Explain anything that made
it worse after it started. Propose the fix as a git revert with an undo line. Do not change
anything live. Finish with the report format from CLAUDE.md.
```

Follow-up if it stops after the first cause:

```
Replicas and errors changed after the first symptom. Is that a second change, and how does it
interact with the first one?
```
