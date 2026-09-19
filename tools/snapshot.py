#!/usr/bin/env python3
"""Track drawdowns on Arc's ACTIVELY TRADED pools.

The survivorship study on new launches measured the wrong population: ~85% of newly created
pools never trade at all, so their "flat" price says nothing. This snapshots the pools that
actually have swap flow, so repeated runs give a real drawdown distribution over time.

Usage:
    python3 tools/snapshot.py            # take a snapshot into data/snapshots/
    python3 tools/snapshot.py --report   # compare the newest snapshot against the oldest
"""
import json, os, sys, time, urllib.request, collections, glob
from datetime import datetime, timezone

RPC = "https://rpc.mainnet.arc.io"
PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951"
SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"
POOLS_SLOT = 6
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "snapshots")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))


def rpc(method, params, retry=4):
    for i in range(retry):
        try:
            body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
            req = urllib.request.Request(RPC, data=body,
                                         headers={"content-type": "application/json", "User-Agent": "curl/8.5.0"})
            out = json.load(urllib.request.urlopen(req, timeout=45))
            if "error" in out:
                raise RuntimeError(out["error"]["message"][:80])
            return out["result"]
        except Exception:
            if i == retry - 1:
                return None
            time.sleep(1.0 + i)


from keccak import keccak256  # noqa: E402


def state_slot(pool_id_hex):
    return int.from_bytes(keccak256(bytes.fromhex(pool_id_hex[2:]) + POOLS_SLOT.to_bytes(32, "big")), "big")


def extsload(slot):
    r = rpc("eth_call", [{"to": PM, "data": "0x1e2eaeaf" + format(slot, "064x")}, "latest"])
    return int(r, 16) if r else None


def take_snapshot():
    head = int(rpc("eth_blockNumber", []), 16)
    counts = collections.Counter()
    # 1,200 blocks (~10 min) of swap flow identifies the pools that are actually traded.
    for i in range(12):
        logs = rpc("eth_getLogs", [{"address": PM, "topics": [SWAP],
                                    "fromBlock": hex(head - (i + 1) * 100), "toBlock": hex(head - i * 100)}])
        if logs:
            for log in logs:
                counts[log["topics"][1]] += 1
        time.sleep(0.1)

    pools = {}
    for pool_id, swaps in counts.most_common(400):
        base = state_slot(pool_id)
        s0 = extsload(base)
        if s0 is None:
            continue
        sqrt = s0 & ((1 << 160) - 1)
        tick = (s0 >> 160) & ((1 << 24) - 1)
        if tick >= 1 << 23:
            tick -= 1 << 24
        if sqrt == 0:
            continue
        liq = extsload(base + 3) or 0
        pools[pool_id] = {"tick": tick, "liquidity": str(liq), "swaps": swaps}
        time.sleep(0.02)

    snap = {"takenAt": datetime.now(timezone.utc).isoformat(), "block": head, "pools": pools}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{head}.json")
    with open(path, "w") as fh:
        json.dump(snap, fh, indent=1)
    print(f"snapshot: {len(pools)} actively-traded pools at block {head} -> {path}")
    return snap


def report():
    files = sorted(glob.glob(os.path.join(OUT, "*.json")))
    if len(files) < 2:
        print(f"need at least 2 snapshots to compare; have {len(files)}.")
        print("run this on a schedule (hourly is plenty), then re-run with --report")
        return
    old = json.load(open(files[0]))
    new = json.load(open(files[-1]))
    hours = (datetime.fromisoformat(new["takenAt"]) - datetime.fromisoformat(old["takenAt"])).total_seconds() / 3600
    both = set(old["pools"]) & set(new["pools"])
    print(f"comparing {old['block']} -> {new['block']}  ({hours:.1f}h, {len(both)} pools in both)\n")
    if not both:
        return
    moves = []
    for p in both:
        # price = currency1 per currency0. For a USDC-quoted pool a rising tick means the
        # token got cheaper, so the token's multiple is 1.0001**-(delta).
        moves.append(1.0001 ** -(new["pools"][p]["tick"] - old["pools"][p]["tick"]))
    moves.sort()
    n = len(moves)

    def share(pred):
        return 100.0 * sum(1 for m in moves if pred(m)) / n

    print(f"  down >=50% : {share(lambda m: m <= 0.5):5.1f}%")
    print(f"  down >=20% : {share(lambda m: m <= 0.8):5.1f}%")
    print(f"  flat +-10% : {share(lambda m: 0.9 < m <= 1.1):5.1f}%")
    print(f"  up   >=20% : {share(lambda m: m >= 1.2):5.1f}%")
    print(f"  median     : {moves[n // 2]:.4f}")
    print()
    print("  A stop-loss is worth paying for only if the 'down' buckets are materially non-zero")
    print("  on pools people actually hold. That is the number this tool exists to produce.")


if __name__ == "__main__":
    if "--report" in sys.argv:
        report()
    else:
        take_snapshot()
