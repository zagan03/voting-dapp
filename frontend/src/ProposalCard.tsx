import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { deriveVotePda } from "./pdas";

type ProposalAccount = {
  creator: PublicKey;
  description: string;
  votesYes: anchor.BN;
  votesNo: anchor.BN;
  isActive: boolean;
  startTs: anchor.BN;
  endTs: anchor.BN;
};

type Props = {
  program: Program<any>;
  programId: PublicKey;
  pubkey: PublicKey;
  account: ProposalAccount;
  walletPubkey?: PublicKey;
  onChanged?: () => void;
};

export default function ProposalCard({
  program,
  programId,
  pubkey,
  account,
  walletPubkey,
  onChanged,
}: Props) {
  const now = Math.floor(Date.now() / 1000);
  const end = account.endTs.toNumber();
  const canVote = account.isActive && now < end;
  const isCreator = walletPubkey?.equals(account.creator) ?? false;
  const canClose = isCreator && now >= end && account.isActive;

  async function vote(choice: boolean) {
    if (!walletPubkey) return alert("Conectează wallet-ul");
    const votePda = deriveVotePda(programId, pubkey, walletPubkey);
    try {
      await program.methods
        .vote(choice)
        .accountsStrict({
          proposal: pubkey,
          vote: votePda,
          voter: walletPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      onChanged?.();
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    }
  }

  async function close() {
    if (!walletPubkey) return;
    try {
      await program.methods
        .closeProposal()
        .accountsStrict({
          proposal: pubkey,
          creator: walletPubkey,
        })
        .rpc();
      onChanged?.();
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    }
  }

  return (
    <div
      style={{
        border: "1px solid #eee",
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{account.description}</strong>
        <span>{short(pubkey.toBase58())}</span>
      </div>
      <div style={{ marginTop: 6, color: "#666" }}>
        Creator: {short(account.creator.toBase58())}
      </div>
      <div style={{ marginTop: 6 }}>
        Yes: {account.votesYes.toNumber()} | No: {account.votesNo.toNumber()}
      </div>
      <div style={{ marginTop: 6 }}>
        Status: {account.isActive ? "Active" : "Closed"} | Ends at:{" "}
        {new Date(end * 1000).toLocaleString()}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button onClick={() => vote(true)} disabled={!canVote}>
          Vote Yes
        </button>
        <button onClick={() => vote(false)} disabled={!canVote}>
          Vote No
        </button>
        {canClose && <button onClick={close}>Close Proposal</button>}
      </div>
    </div>
  );
}

function parseAnchorError(e: any): string {
  const msg = e?.error?.errorMessage || e?.message || "Transaction failed";
  if (msg.includes("ProposalClosed")) return "Propunerea este închisă.";
  if (msg.includes("Unauthorized")) return "Doar creatorul poate închide.";
  if (msg.includes("DeadlinePassed")) return "A trecut deadline-ul de vot.";
  if (msg.includes("TooEarlyToClose")) return "Prea devreme pentru închidere.";
  return msg;
}

function short(x: string, n: number = 4) {
  return `${x.slice(0, n)}...${x.slice(-n)}`;
}
