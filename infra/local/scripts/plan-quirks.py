"""Reads `terraform show -json <plan>` on stdin and prints the address of every planned change that
is not a known floci response quirk (spec/components/floci-local-environment.md, gaps G18 and G19).
Empty output means the plan is idempotent apart from those quirks."""
import json
import re
import sys


def sg_reference_quirk(before, after, changed):
    # G18: floci returns a same-account security group reference as "<account>/sg-...".
    key = "referenced_security_group_id"
    return changed == {key} and str(before.get(key, "")).endswith("/" + str(after.get(key)))


def _acl_rules(rules):
    # G19: floci drops ipv6_cidr_block from network ACL entries and reports unset ICMP fields as 0.
    out = []
    for rule in rules or []:
        kept = {
            k: v
            for k, v in rule.items()
            if v not in (None, "")
            and k != "ipv6_cidr_block"
            and not (k in ("icmp_code", "icmp_type") and v == 0)
        }
        out.append(json.dumps(kept, sort_keys=True))
    return sorted(out)


def default_acl_quirk(before, after, changed):
    return changed <= {"egress", "ingress"} and all(
        _acl_rules(before.get(k)) == _acl_rules(after.get(k)) for k in changed
    )


QUIRKS = [
    (r"module\.msk\.aws_vpc_security_group_ingress_rule\.kafka\[.+\]", sg_reference_quirk),
    (r"module\.network\.module\.vpc\.aws_default_network_acl\.this\[0\]", default_acl_quirk),
]

unexplained = []
for rc in json.load(sys.stdin).get("resource_changes", []):
    change = rc["change"]
    if change["actions"] in (["no-op"], ["read"]):
        continue
    before, after = change.get("before") or {}, change.get("after") or {}
    changed = {k for k in before.keys() | after.keys() if before.get(k) != after.get(k)}
    explained = change["actions"] == ["update"] and any(
        re.fullmatch(pattern, rc["address"]) and check(before, after, changed)
        for pattern, check in QUIRKS
    )
    if not explained:
        unexplained.append(rc["address"])
print("\n".join(unexplained))
