import { Buffer } from "buffer";
import process from "process";
if (typeof window !== "undefined") {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
  // @ts-ignore
  window.process = window.process || process;
}
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

const endpoint = import.meta.env.VITE_RPC_URL as string;
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
