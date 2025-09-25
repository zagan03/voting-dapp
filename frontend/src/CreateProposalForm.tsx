import { useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  PublicKey,
} from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Buffer } from "buffer";

// Discriminator din IDL pentru create_proposal
// "discriminator": [132,116,68,174,216,160,198,22]
const CREATE_PROPOSAL_DISC = Buffer.from([
  132, 116, 68, 174, 216, 160, 198, 22,
]);

function encodeStringBorsh(s: string): Buffer {
  const bytes = new TextEncoder().encode(s);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0); // little-endian
  return Buffer.concat([len, Buffer.from(bytes)]);
}

function encodeI64LE(n: anchor.BN | number | string): Buffer {
  const bn = anchor.BN.isBN(n as any)
    ? (n as anchor.BN)
    : new anchor.BN(n as any);
  const big = BigInt(bn.toString());
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(big);
  return buf;
}

type Props = {
  program: Program<any>;
  onCreated?: (proposalPubkey: string) => void;
};

export default function CreateProposalForm({ program, onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [durationSec, setDurationSec] = useState<number>(60);
  const [loading, setLoading] = useState(false);

  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  async function sendTxManually(tx: Transaction, extraSigners: Keypair[] = []) {
    if (!connected || !publicKey) throw new Error("Wallet not connected");

    // Setează fee payer + recentBlockhash ÎNAINTE de orice semnătură
    tx.feePayer = publicKey;
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;

    // Semnează cu keypair-urile extra (ex: contul nou de proposal)
    extraSigners.forEach((kp) => tx.sign(kp));

    if (!signTransaction) throw new Error("Wallet cannot sign transactions");
    const signed = await signTransaction(tx);

    // Trimite + confirmă
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

  async function submit() {
    if (!connected || !publicKey) {
      alert("Conectează wallet-ul înainte de a crea o propunere.");
      return;
    }
    if (!description.trim()) return alert("Descrierea este goală");
    if (durationSec <= 0) return alert("Durata trebuie > 0");

    setLoading(true);
    try {
      const proposalKp = Keypair.generate();

      // Data: discriminator + (description: string) + (duration_sec: i64)
      const descB = encodeStringBorsh(description);
      const durB = encodeI64LE(durationSec);
      const data = Buffer.concat([CREATE_PROPOSAL_DISC, descB, durB]);

      // Cheile în ordinea din IDL pentru create_proposal
      const keys = [
        { pubkey: proposalKp.publicKey, isWritable: true, isSigner: true },
        { pubkey: publicKey, isWritable: true, isSigner: true },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ];

      const programId = (program as any).programId as PublicKey;
      const ix = new TransactionInstruction({ programId, keys, data });

      const tx = new Transaction().add(ix);

      // Semnăm manual (setăm blockhash + feePayer, apoi semnăm cu proposalKp și wallet)
      const sig = await sendTxManually(tx, [proposalKp]);

      onCreated?.(proposalKp.publicKey.toBase58());
      setDescription("");
      setDurationSec(60);
      console.log("create_proposal tx:", sig);
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
      <h3>Crează propunere</h3>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          placeholder="Descriere (<=200)"
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <input
          type="number"
          min={1}
          value={durationSec}
          onChange={(e) => setDurationSec(Number(e.target.value))}
          style={{ width: 120, padding: 8 }}
        />
        <button disabled={loading} onClick={submit}>
          {loading ? "Se creează..." : "Creează"}
        </button>
      </div>
      <small>Durată: {durationSec} secunde</small>
    </div>
  );
}

function parseAnchorError(e: any): string {
  const msg = e?.error?.errorMessage || e?.message || "Transaction failed";
  if (msg.includes("DescriptionTooLong"))
    return "Descriere prea lungă (<=200).";
  if (msg.includes("InvalidDuration")) return "Durata trebuie > 0.";
  if (msg.toLowerCase().includes("program that does not exist"))
    return "Programul nu există pe cluster. Verifică VITE_PROGRAM_ID / Devnet / deploy.";
  if (msg.toLowerCase().includes("insufficient funds"))
    return "Fonduri insuficiente pe Devnet. Cere un airdrop în Phantom.";
  if (msg.toLowerCase().includes("recentblockhash required"))
    return "A apărut o problemă de blockhash. Încearcă din nou sau reîncarcă pagina.";
  return msg;
}
