#!/usr/bin/env python3
"""Measure REAL drawdowns on Arc's actively-traded pools using archive state reads.

No waiting: the RPC serves historical eth_call, so we read each pool's tick at points
across the last 24h and compute the drawdown a holder would actually have suffered.

Convention: V4 price = currency1 per currency0. USDC (0x3600... or native 0x0) sorts
first for almost every token, so it is currency0 and a RISING tick means the token got
CHEAPER. Pools where that does not hold are a small minority and show up as inverted.
"""
import json, os, sys, time, urllib.request, collections, concurrent.futures
sys.path.insert(0, os.path.dirname(__file__))
from keccak import keccak256

RPC = "https://rpc.mainnet.arc.io"
PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951"
BLOCK_TIME = 0.507


def rpc(method, params, retry=5):
    for i in range(retry):
        try:
            body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
            req = urllib.request.Request(RPC, data=body,
                                         headers={"content-type": "application/json", "User-Agent": "curl/8.5.0"})
            out = json.load(urllib.request.urlopen(req, timeout=45))
            if "error" in out:
                raise RuntimeError(out["error"]["message"][:60])
            return out["result"]
        except Exception:
            if i == retry - 1:
                return None
            time.sleep(0.6 * (i + 1))


def tick_at(slot, block):
    r = rpc("eth_call", [{"to": PM, "data": "0x1e2eaeaf" + format(slot, "064x")}, hex(block)])
    if not r:
        return None
    v = int(r, 16)
    if v & ((1 << 160) - 1) == 0:
        return None  # pool did not exist / uninitialised at that block
    t = (v >> 160) & ((1 << 24) - 1)
    return t - (1 << 24) if t >= 1 << 23 else t


def main():
    snap_dir = os.path.join(os.path.dirname(__file__), "..", "data", "snapshots")
    newest = sorted(os.listdir(snap_dir))[-1]
    snap = json.load(open(os.path.join(snap_dir, newest)))
    head = snap["block"]
    pools = list(snap["pools"].items())
    pools.sort(key=lambda kv: -kv[1]["swaps"])
    pools = pools[:150]
    print(f"{len(pools)} most-traded pools, reading tick at 13 points over the last 24h\n")

    hours = [24, 20, 16, 12, 10, 8, 6, 4, 3, 2, 1, 0.5, 0]
    blocks = [head - int(h * 3600 / BLOCK_TIME) for h in hours]

    results = {}

    def series(item):
        pid, _ = item
        slot = int.from_bytes(keccak256(bytes.fromhex(pid[2:]) + (6).to_bytes(32, "big")), "big")
        return pid, [tick_at(slot, b) for b in blocks]

    done = 0
    with concurrent.futures.ThreadPoolExecutor(5) as ex:
        for pid, ticks in ex.map(series, pools):
            results[pid] = ticks
            done += 1
            if done % 25 == 0:
                print(f"  ...{done}/{len(pools)}")

    # token price multiple relative to each pool's first observed tick
    stats = []
    for pid, ticks in results.items():
        pts = [(h, t) for h, t in zip(hours, ticks) if t is not None]
        if len(pts) < 4:
            continue
        base = pts[0][1]
        mults = [1.0001 ** -(t - base) for _, t in pts]
        peak, mdd = mults[0], 0.0
        for m in mults:
            peak = max(peak, m)
            mdd = max(mdd, 1 - m / peak)
        stats.append({"pool": pid, "age_pts": len(pts), "final": mults[-1], "maxdd": mdd})

    if not stats:
        print("no pools with enough history")
        return
    n = len(stats)
    print(f"\n{'='*64}\n{n} pools with at least 4 observations in the window\n")

    def sh(pred):
        return 100.0 * sum(1 for s in stats if pred(s)) / n

    print("MAX DRAWDOWN within 24h (peak to trough, what a holder would have suffered)")
    for thr in (0.2, 0.3, 0.5, 0.7, 0.9):
        print(f"  drew down >= {int(thr*100):2d}% : {sh(lambda s, t=thr: s['maxdd'] >= t):5.1f}%")
    dds = sorted(s["maxdd"] for s in stats)
    print(f"  median max drawdown : {dds[n//2]*100:.1f}%")
    print(f"  90th percentile     : {dds[int(n*0.9)]*100:.1f}%")

    print("\nPRICE NOW vs 24h AGO")
    for thr, lab in ((0.5, "down >=50%"), (0.8, "down >=20%")):
        print(f"  {lab} : {sh(lambda s, t=thr: s['final'] <= t):5.1f}%")
    print(f"  up        : {sh(lambda s: s['final'] > 1.0):5.1f}%")
    fin = sorted(s["final"] for s in stats)
    print(f"  median multiple : {fin[n//2]:.4f}")

    out = os.path.join(os.path.dirname(__file__), "..", "data", "drawdowns.json")
    json.dump({"head": head, "hours": hours, "stats": stats}, open(out, "w"), indent=1)
    print(f"\nwritten: {out}")


if __name__ == "__main__":
    main()
