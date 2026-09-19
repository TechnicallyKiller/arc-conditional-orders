#!/usr/bin/env python3
"""Reconstruct whether fills were actually available, from Swap EVENTS only.

State reads gave contradictory answers about pool liquidity. The Swap event carries the
pool's liquidity at the moment of the swap, so this rebuilds the picture from log data,
which cannot be affected by node pruning or archive behaviour.

Answers: was there continuous tradability, or only intermittent windows?
"""
import json, os, sys, time, urllib.request, collections

RPC = "https://rpc.mainnet.arc.io"
PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951"
SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"
BLOCK_TIME = 0.507


def rpc(method, params, retry=5):
    for i in range(retry):
        try:
            body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
            req = urllib.request.Request(RPC, data=body,
                                         headers={"content-type": "application/json", "User-Agent": "curl/8.5.0"})
            out = json.load(urllib.request.urlopen(req, timeout=50))
            if "error" in out:
                return {"__error": out["error"]["message"]}
            return out["result"]
        except Exception:
            if i == retry - 1:
                return None
            time.sleep(0.8 * (i + 1))


def s128(v):
    return v - (1 << 128) if v >= 1 << 127 else v


def parse(log):
    d = log["data"][2:]
    w = [int(d[i * 64:(i + 1) * 64], 16) for i in range(len(d) // 64)]
    tick = w[4] if w[4] < 1 << 23 else w[4] - (1 << 24)
    return {
        "block": int(log["blockNumber"], 16),
        "amount0": s128(w[0]), "amount1": s128(w[1]),
        "sqrtPriceX96": w[2], "liquidity": w[3], "tick": tick,
    }


def fetch(pool, hours):
    head = int(rpc("eth_blockNumber", []), 16)
    span = int(hours * 3600 / BLOCK_TIME)
    start = head - span
    swaps, b, chunk = [], start, 4000
    while b < head:
        hi = min(b + chunk, head)
        r = rpc("eth_getLogs", [{"address": PM, "topics": [SWAP, pool],
                                 "fromBlock": hex(b), "toBlock": hex(hi)}])
        if isinstance(r, dict) and "__error" in r:
            chunk = max(250, chunk // 2)      # over the 2000-result cap: narrow and retry
            continue
        if r is None:
            b = hi + 1
            continue
        swaps += [parse(x) for x in r]
        b = hi + 1
        if chunk < 4000:
            chunk = min(4000, chunk * 2)
        time.sleep(0.05)
    return head, start, swaps


def report(name, pool, hours=24):
    head, start, sw = fetch(pool, hours)
    print(f"\n{'='*66}\n{name}  {pool[:22]}...")
    print(f"blocks {start}-{head}  ({hours}h)")
    if not sw:
        print("  NO SWAPS - nothing traded here in the window")
        return
    sw.sort(key=lambda s: s["block"])
    print(f"  swaps: {len(sw)}")

    liq = sorted(s["liquidity"] for s in sw)
    n = len(liq)
    zero = sum(1 for v in liq if v == 0)
    print(f"\n  LIQUIDITY AT SWAP TIME (from the event, not a state read)")
    print(f"    min    {liq[0]:>30,}")
    print(f"    median {liq[n//2]:>30,}")
    print(f"    max    {liq[-1]:>30,}")
    print(f"    swaps executed against ZERO liquidity: {zero}")
    distinct = len(set(liq))
    print(f"    distinct liquidity values: {distinct}"
          + ("  <- stable" if distinct <= 3 else "  <- changes often"))

    gaps = [(sw[i + 1]["block"] - sw[i]["block"]) * BLOCK_TIME for i in range(len(sw) - 1)]
    if gaps:
        gaps_sorted = sorted(gaps)
        print(f"\n  GAPS BETWEEN SWAPS (seconds)")
        print(f"    median {gaps_sorted[len(gaps)//2]:.1f}s   p90 {gaps_sorted[int(len(gaps)*.9)]:.1f}s"
              f"   max {gaps_sorted[-1]:.1f}s")
        over5 = sum(1 for g in gaps if g > 300)
        print(f"    gaps longer than 5 min: {over5}  "
              f"({100.0*over5/len(gaps):.1f}% of intervals)")
        print(f"    -> a keeper arming an order would wait at most ~{gaps_sorted[-1]/60:.1f} min"
              f" for the next observed trade")
    return sw


if __name__ == "__main__":
    pools = {
        "USO (oil ETF)": "0xfe8edb692b461e9c24ea1b875ff9e59611b40f40bb70a93e9fc067876f518e61",
        "BB (untradeable)": "0xa40e2eb33659b4c38bc501f5b390d3d65a9eabf76fc6c1f12e28ce11676864d6",
    }
    hours = float(sys.argv[1]) if len(sys.argv) > 1 else 6
    for name, p in pools.items():
        report(name, p, hours)
