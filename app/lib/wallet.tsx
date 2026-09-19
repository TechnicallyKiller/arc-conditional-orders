"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { createBundlerClient, toWebAuthnAccount, type SmartAccount, type WebAuthnAccount } from "viem/account-abstraction";
import {
  WebAuthnMode, toCircleSmartAccount, toModularTransport, toPasskeyTransport, toWebAuthnCredential,
} from "@circle-fin/modular-wallets-core";
import { MIN_MAX_FEE_PER_GAS } from "./gas";

export type Call = { to: Hex; data: Hex; value?: bigint };
export type WalletKind = "passkey" | "injected";

type Ctx = {
  address: Hex | null;
  kind: WalletKind | null;
  passkeyAvailable: boolean;
  busy: boolean;
  error: string | null;
  connectPasskey: (mode: "register" | "login") => Promise<void>;
  connectInjected: () => Promise<void>;
  disconnect: () => void;
  /** One call path for both wallet kinds. Returns the transaction hash. */
  send: (calls: Call[]) => Promise<Hex>;
};

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
};

const CLIENT_KEY = process.env.NEXT_PUBLIC_CLIENT_KEY ?? "";
const CLIENT_URL = process.env.NEXT_PUBLIC_CLIENT_URL ?? "";
const CREDENTIAL_KEY = "arc.passkey.credential";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Hex | null>(null);
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [account, setAccount] = useState<SmartAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Passkeys need a Circle Client Key and a registered passkey domain. Without one the option
  // is hidden rather than offered and then failing at the click.
  const passkeyAvailable = Boolean(CLIENT_KEY && CLIENT_URL);

  const bundler = useMemo(() => {
    if (!passkeyAvailable) return null;
    const transport = toModularTransport(`${CLIENT_URL}/arcTestnet`, CLIENT_KEY);
    return {
      transport,
      client: createPublicClient({ chain: arcTestnet, transport }),
      bundlerClient: createBundlerClient({ chain: arcTestnet, transport }),
    };
  }, [passkeyAvailable]);

  const connectPasskey = useCallback(async (mode: "register" | "login") => {
    if (!bundler) return;
    setBusy(true); setError(null);
    try {
      const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY);
      const credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: mode === "register" ? WebAuthnMode.Register : WebAuthnMode.Login,
        username: mode === "register" ? `arc-${Date.now()}` : undefined,
      });
      localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
      const smart = await toCircleSmartAccount({
        client: bundler.client,
        owner: toWebAuthnAccount({ credential }) as WebAuthnAccount,
      });
      setAccount(smart);
      setAddress(smart.address as Hex);
      setKind("passkey");
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }, [bundler]);

  const connectInjected = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No browser wallet found. Install one, or use a passkey.");
      const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as Hex[];
      const hexId = `0x${arcTestnet.id.toString(16)}`;
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
      } catch (switchErr: any) {
        // 4902 = chain unknown to the wallet. Add it rather than telling the user to.
        if (switchErr?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: hexId, chainName: arcTestnet.name,
              nativeCurrency: arcTestnet.nativeCurrency,
              rpcUrls: [arcTestnet.rpcUrls.default.http[0]],
              blockExplorerUrls: [arcTestnet.blockExplorers!.default.url],
            }],
          });
        } else throw switchErr;
      }
      setAddress(addr); setKind("injected"); setAccount(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null); setKind(null); setAccount(null); setError(null);
  }, []);

  const send = useCallback(async (calls: Call[]): Promise<Hex> => {
    if (kind === "passkey") {
      if (!bundler || !account) throw new Error("passkey wallet not ready");
      // paymaster: true routes gas to Circle Gas Station, so a first-time visitor needs no USDC.
      const hash = await bundler.bundlerClient.sendUserOperation({ account, calls, paymaster: true });
      const { receipt } = await bundler.bundlerClient.waitForUserOperationReceipt({ hash });
      return receipt.transactionHash as Hex;
    }
    const eth = (window as any).ethereum;
    if (!eth || !address) throw new Error("wallet not connected");
    const wallet = createWalletClient({ account: address, chain: arcTestnet, transport: custom(eth) });
    let last: Hex = "0x" as Hex;
    for (const c of calls) {
      // Arc's mempool silently discards anything under 20 Gwei: no receipt, no error.
      last = await wallet.sendTransaction({
        to: c.to, data: c.data, value: c.value ?? 0n,
        maxFeePerGas: MIN_MAX_FEE_PER_GAS, maxPriorityFeePerGas: 0n, chain: arcTestnet,
      });
      await createPublicClient({ chain: arcTestnet, transport: custom(eth) })
        .waitForTransactionReceipt({ hash: last, confirmations: 1 });
    }
    return last;
  }, [kind, bundler, account, address]);

  // Restore a passkey session without re-prompting, if one exists.
  useEffect(() => {
    if (!bundler || address) return;
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    if (!raw) return;
    (async () => {
      try {
        const credential = JSON.parse(raw);
        const smart = await toCircleSmartAccount({
          client: bundler.client,
          owner: toWebAuthnAccount({ credential }) as WebAuthnAccount,
        });
        setAccount(smart); setAddress(smart.address as Hex); setKind("passkey");
      } catch {
        localStorage.removeItem(CREDENTIAL_KEY);
      }
    })();
  }, [bundler, address]);

  const value: Ctx = {
    address, kind, passkeyAvailable, busy, error,
    connectPasskey, connectInjected, disconnect, send,
  };
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
