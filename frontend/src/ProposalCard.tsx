import { useEffect, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  SystemProgram,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Buffer } from "buffer";
import idl from "./idl/voting_dapp.json";
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

// Ia discriminatorul de 8 bytes pentru o instrucțiune din IDL sau calculează fallback.
function getIxDiscriminator(ixName: string): Buffer {
  const ix = (idl as any)?.instructions?.find((i: any) => i.name === ixName);
  if (
    ix?.discriminator &&
    Array.isArray(ix.discriminator) &&
    ix.discriminator.length === 8
  ) {
    return Buffer.from(ix.discriminator);
  }
  const hex = anchor.utils.sha256.hash(`global:${ixName}`);
  return Buffer.from(hex, "hex").subarray(0, 8);
}
function encodeBool(b: boolean): Buffer {
  return Buffer.from([b ? 1 : 0]);
}

async function sendTxWithWallet(params: {
  connection: any;
  wallet: ReturnType<typeof useWallet>;
  tx: Transaction;
}) {
  const { connection, wallet, tx } = params;
  if (!wallet.connected || !wallet.publicKey)
    throw new Error("Wallet not connected");
  if (!wallet.signTransaction)
    throw new Error("Wallet cannot sign transactions");

  tx.feePayer = wallet.publicKey;
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature: sig, ...latest },
    "confirmed"
  );
  return sig;
}

export default function ProposalCard({
  program,
  programId,
  pubkey,
  account,
  walletPubkey,
  onChanged,
}: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  // actualizează "acum" la fiecare secundă ca să se (de)activeze butoanele corect
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const end = account.endTs.toNumber();

  // Permite vot până la deadline INCLUSIV
  const canVote = account.isActive && now <= end;
  const isCreator = walletPubkey?.equals(account.creator) ?? false;
  const canClose = isCreator && now >= end && account.isActive;

  async function vote(choice: boolean) {
    try {
      if (!wallet.connected || !wallet.publicKey) {
        alert("Conectează wallet-ul");
        return;
      }
      // PDA: ["vote", proposal, voter]
      const votePda = deriveVotePda(programId, pubkey, wallet.publicKey);

      // Data: discriminator("vote") + bool(choice)
      const data = Buffer.concat([
        getIxDiscriminator("vote"),
        encodeBool(choice),
      ]);

      // Ordinea conturilor conform IDL-ului pentru `vote`:
      // proposal (mut), vote (mut/init), voter (signer, mut), system_program
      const keys = [
        { pubkey, isWritable: true, isSigner: false },
        { pubkey: votePda, isWritable: true, isSigner: false },
        { pubkey: wallet.publicKey, isWritable: true, isSigner: true },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ];

      const ix = new TransactionInstruction({
        programId: (program as any).programId as PublicKey,
        keys,
        data,
      });
      const tx = new Transaction().add(ix);

      const sig = await sendTxWithWallet({ connection, wallet, tx });
      console.log("vote tx:", sig);
      onChanged?.();
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    }
  }

  async function close() {
    try {
      if (!wallet.connected || !wallet.publicKey) {
        alert("Conectează wallet-ul");
        return;
      }
      // Data: discriminator("close_proposal"), fără args
      const data = getIxDiscriminator("close_proposal");

      // Ordinea conturilor conform IDL-ului pentru `close_proposal`:
      // proposal (mut), creator (signer, mut)
      const keys = [
        { pubkey, isWritable: true, isSigner: false },
        { pubkey: wallet.publicKey, isWritable: true, isSigner: true },
      ];

      const ix = new TransactionInstruction({
        programId: (program as any).programId as PublicKey,
        keys,
        data,
      });
      const tx = new Transaction().add(ix);

      const sig = await sendTxWithWallet({ connection, wallet, tx });
      console.log("close_proposal tx:", sig);
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
  if (/ProposalClosed/i.test(msg)) return "Propunerea este închisă.";
  if (/Unauthorized/i.test(msg)) return "Doar creatorul poate închide.";
  if (/DeadlinePassed|VotingClosed/i.test(msg))
    return "A trecut deadline-ul de vot.";
  if (/TooEarlyToClose/i.test(msg)) return "Prea devreme pentru închidere.";
  if (/already in use|already initialized|account .* exists/i.test(msg))
    return "Ai votat deja pentru această propunere (1 vot per wallet).";
  if (/does not exist|program .* not exist/i.test(msg))
    return "Programul nu există pe cluster. Verifică VITE_PROGRAM_ID și Devnet.";
  if (/insufficient funds|lamports/i.test(msg))
    return "Fonduri insuficiente pentru fee. Fă un airdrop în wallet (Devnet).";
  if (/recentBlockhash|Blockhash not found/i.test(msg))
    return "Blockhash expirat. Reîncearcă sau reîncarcă pagina.";
  return msg;
}

function short(x: string, n: number = 4) {
  return `${x.slice(0, n)}...${x.slice(-n)}`;
}
