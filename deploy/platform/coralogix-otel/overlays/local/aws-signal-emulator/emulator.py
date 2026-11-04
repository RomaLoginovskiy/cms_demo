"""aws-signal-emulator: CloudWatch-shaped AWS metrics for the floci local cluster.

floci emulates AWS APIs but emits no CloudWatch metrics. This process derives them from real local
signals, so they move with the incident, and sends them to the node's OpenTelemetry agent.
Spec: spec/components/workshop-telemetry-detection.md, "Emulated AWS signals (local demo)".

Names copy Coralogix's CloudWatch Metric Streams shape (amazonaws_com_AWS_<Namespace>_<MetricName>,
CloudWatch dimensions as labels). Every series carries cloud.emulated=true.

  AWS/EC2  CPUUtilization (%), StatusCheckFailed     node usage (metrics.k8s.io) / CPU capacity; Ready
  AWS/EBS  VolumeReadOps, VolumeWriteOps (count),     /proc/diskstats of the node's disk, which holds
           VolumeReadBytes, VolumeWriteBytes,         the local-path volumes (cms-postgres included)
           VolumeQueueLength, VolumeIdleTime (s)

Standard library only.
"""
import json
import os
import re
import ssl
import sys
import time
import urllib.request

API = "https://kubernetes.default.svc"
SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"

NODE = os.environ["NODE_NAME"]
OTLP_URL = os.environ["OTLP_METRICS_URL"]
PERIOD = int(os.environ.get("PERIOD_SECONDS", "60"))
SAMPLE = int(os.environ.get("SAMPLE_SECONDS", "15"))
INSTANCE_ID = os.environ.get("INSTANCE_ID", "i-emulated-cms-local-1")
VOLUME_ID = os.environ.get("VOLUME_ID", "vol-emulated-cms-local-root")
DISK = os.environ.get("DISK_DEVICE", "")

RESOURCE = {
    "service.name": "aws-signal-emulator",
    "cloud.provider": "aws",
    "cloud.platform": "aws_ec2",
    "cloud.region": os.environ.get("AWS_REGION", "eu-west-1"),
    "cloud.account.id": os.environ.get("AWS_ACCOUNT_ID", "000000000000"),
    "cloud.emulated": "true",
    "k8s.cluster.name": os.environ.get("CLUSTER_NAME", "cms-local"),
}


def log(msg):
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}", flush=True)


def k8s_get(path):
    # The projected token rotates, so it is read on every call.
    with open(f"{SA_DIR}/token") as f:
        token = f.read().strip()
    ctx = ssl.create_default_context(cafile=f"{SA_DIR}/ca.crt")
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return json.load(resp)


def cores(quantity):
    """Kubernetes CPU quantity ("927123456n", "250m", "6") in cores."""
    for suffix, scale in (("n", 1e9), ("u", 1e6), ("m", 1e3)):
        if quantity.endswith(suffix):
            return int(quantity[:-1]) / scale
    return float(quantity)


def ec2_sample():
    node = k8s_get(f"/api/v1/nodes/{NODE}")
    usage = k8s_get(f"/apis/metrics.k8s.io/v1beta1/nodes/{NODE}")
    capacity = cores(node["status"]["capacity"]["cpu"])
    used = cores(usage["usage"]["cpu"])
    ready = any(c["type"] == "Ready" and c["status"] == "True" for c in node["status"].get("conditions", []))
    return 100.0 * used / capacity, 0 if ready else 1


def whole_disks():
    try:
        return set(os.listdir("/sys/block"))
    except OSError:
        return set()


def disk_counters():
    """Counters of one whole disk from /proc/diskstats (not namespaced: it shows the node's disks)."""
    with open("/proc/diskstats") as f:
        rows = [line.split() for line in f]
    disks = whole_disks()
    candidates = {
        r[2]: r for r in rows
        if len(r) >= 14
        and not re.match(r"(loop|ram|zram|dm-|sr|nbd|md)", r[2])
        and (r[2] in disks if disks else not re.search(r"\d+$|p\d+$", r[2]))
    }
    if DISK:
        row = candidates.get(DISK)
    else:
        row = max(candidates.values(), key=lambda r: int(r[3]) + int(r[7]), default=None)
    if row is None:
        return None
    return {
        "device": row[2],
        "reads": int(row[3]),
        "read_bytes": int(row[5]) * 512,
        "writes": int(row[7]),
        "write_bytes": int(row[9]) * 512,
        "io_ms": int(row[12]),
        "weighted_io_ms": int(row[13]),
    }


def gauge(name, value, dims, ts):
    return {
        "name": name,
        "gauge": {"dataPoints": [{
            "timeUnixNano": str(ts),
            "asDouble": float(value),
            "attributes": [{"key": k, "value": {"stringValue": v}} for k, v in dims.items()],
        }]},
    }


def send(metrics):
    body = {"resourceMetrics": [{
        "resource": {"attributes": [{"key": k, "value": {"stringValue": v}} for k, v in RESOURCE.items()]},
        "scopeMetrics": [{"scope": {"name": "aws-signal-emulator"}, "metrics": metrics}],
    }]}
    req = urllib.request.Request(OTLP_URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def main():
    log(f"node={NODE} instance={INSTANCE_ID} volume={VOLUME_ID} period={PERIOD}s -> {OTLP_URL}")
    cpu_samples, status = [], 0
    prev_disk, prev_time = disk_counters(), time.time()
    next_emit = prev_time + PERIOD
    while True:
        try:
            cpu, status = ec2_sample()
            cpu_samples.append(cpu)
        except Exception as exc:  # keep running through API restarts
            log(f"ec2 sample failed: {exc}")
        now = time.time()
        if now >= next_emit:
            ts = int(now * 1e9)
            metrics = []
            ec2 = {"InstanceId": INSTANCE_ID}
            if cpu_samples:
                metrics.append(gauge("amazonaws_com_AWS_EC2_CPUUtilization",
                                     sum(cpu_samples) / len(cpu_samples), ec2, ts))
            metrics.append(gauge("amazonaws_com_AWS_EC2_StatusCheckFailed", status, ec2, ts))
            disk = disk_counters()
            ebs_note = ""
            if disk and prev_disk and disk["device"] == prev_disk["device"]:
                elapsed_ms = max((now - prev_time) * 1000, 1)
                d = {k: disk[k] - prev_disk[k] for k in disk if k != "device"}
                ebs = {"VolumeId": VOLUME_ID}
                metrics += [
                    gauge("amazonaws_com_AWS_EBS_VolumeReadOps", d["reads"], ebs, ts),
                    gauge("amazonaws_com_AWS_EBS_VolumeWriteOps", d["writes"], ebs, ts),
                    gauge("amazonaws_com_AWS_EBS_VolumeReadBytes", d["read_bytes"], ebs, ts),
                    gauge("amazonaws_com_AWS_EBS_VolumeWriteBytes", d["write_bytes"], ebs, ts),
                    gauge("amazonaws_com_AWS_EBS_VolumeQueueLength", d["weighted_io_ms"] / elapsed_ms, ebs, ts),
                    gauge("amazonaws_com_AWS_EBS_VolumeIdleTime",
                          max(elapsed_ms - d["io_ms"], 0) / 1000, ebs, ts),
                ]
                ebs_note = f", EBS {disk['device']} ops r/w {d['reads']}/{d['writes']}"
            try:
                send(metrics)
                cpu = f"{sum(cpu_samples) / len(cpu_samples):.1f}" if cpu_samples else "n/a"
                log(f"sent {len(metrics)} metrics: EC2 CPU {cpu}%{ebs_note}")
            except Exception as exc:
                log(f"send failed: {exc}")
            cpu_samples, prev_disk, prev_time = [], disk, now
            next_emit = now + PERIOD
        time.sleep(SAMPLE)


if __name__ == "__main__":
    sys.exit(main())
