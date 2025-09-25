import { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl/voting_dapp.json";
import { getAnchorProgram, fetchAllAccounts } from "./anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import CreateProposalForm from "./CreateProposalForm";
import ProposalCard from "./ProposalCard";

// UI type (camelCase)
type ProposalAccount = {
  creator: PublicKey;
  description: string;
  votesYes: anchor.BN;
  votesNo: anchor.BN;
  isActive: boolean;
  startTs: anchor.BN;
  endTs: anchor.BN;
};

// Raw account type as defined in IDL (snake_case)
type RawProposalAccount = {
  creator: PublicKey;
  description: string;
  votes_yes: anchor.BN;
  votes_no: anchor.BN;
  is_active: boolean;
  start_ts: anchor.BN;
  end_ts: anchor.BN;
};

type AnchorAccount<T> = { pubkey: PublicKey; account: T };

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const PROGRAM_ID = import.meta.env.VITE_PROGRAM_ID as string;
  const programId = useMemo(() => new PublicKey(PROGRAM_ID), [PROGRAM_ID]);

  // Initialize Anchor Program
  const program = useMemo(() => {
    if (!wallet.publicKey) return undefined;
    return getAnchorProgram(idl as any, PROGRAM_ID, connection, wallet as any);
  }, [connection, wallet, PROGRAM_ID]);

  const [proposals, setProposals] = useState<AnchorAccount<ProposalAccount>[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  // Load proposals without program.account.* (avoids the crash)
  async function load() {
    if (!program) return;
    setLoadingList(true);
    setError(null);
    try {
      const raw = await fetchAllAccounts<RawProposalAccount>(
        connection,
        programId,
        idl as any,
        "Proposal" // account name from IDL
      );

      const mapped: AnchorAccount<ProposalAccount>[] = raw.map((r) => ({
        pubkey: r.pubkey,
        account: {
          creator: r.account.creator,
          description: r.account.description,
          votesYes: r.account.votes_yes,
          votesNo: r.account.votes_no,
          isActive: r.account.is_active,
          startTs: r.account.start_ts,
          endTs: r.account.end_ts,
        },
      }));

      mapped.sort(
        (a, b) => b.account.endTs.toNumber() - a.account.endTs.toNumber()
      );
      setProposals(mapped);
    } catch (e: any) {
      console.error("Eroare la load():", e);
      setError(e?.message || "A apărut o eroare la încărcarea propunerilor.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programId.toBase58()]);

  // Optional event listeners (keep as you had)
  useEffect(() => {
    if (!program) return;
    let subs: number[] = [];
    (async () => {
      try {
        const names = ["ProposalCreated", "VoteCast", "ProposalClosed"];
        for (const name of names) {
          const hasEvent =
            Array.isArray((program as any).idl?.events) &&
            (program as any).idl.events.some((e: any) => e?.name === name);
          if (hasEvent) {
            const id = await program.addEventListener(name, () => load());
            subs.push(id);
          }
        }
      } catch (e) {
        console.warn("Nu s-au putut atașa toți event listeners:", e);
      }
    })();
    return () => {
      subs.forEach((s) => {
        try {
          program.removeEventListener(s);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programId.toBase58()]);

  return (
    <div style={{ maxWidth: 800, margin: "24px auto", padding: "0 16px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Voting dApp</h2>
        <WalletMultiButton />
      </header>

      {!wallet.connected ? (
        <p>Conectează un wallet pe Devnet pentru a continua.</p>
      ) : !program ? (
        <p>Se inițializează programul...</p>
      ) : (
        <>
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#ffe6e6",
                color: "#a30000",
                borderRadius: 8,
              }}
            >
              <strong>Eroare:</strong> {error}
            </div>
          )}

          <CreateProposalForm program={program} onCreated={() => load()} />

          <div style={{ marginTop: 16 }}>
            <h3>Propuneri</h3>
            {loadingList && <p>Se încarcă propunerile...</p>}
            {!loadingList && proposals.length === 0 && (
              <p>Nu există propuneri.</p>
            )}
            {!loadingList &&
              proposals.map((p) => (
                <ProposalCard
                  key={p.pubkey.toBase58()}
                  program={program}
                  programId={programId}
                  pubkey={p.pubkey}
                  account={p.account}
                  walletPubkey={wallet.publicKey!}
                  onChanged={() => load()}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
