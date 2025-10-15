import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import * as spl from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";

describe("anchor-escrow", () => {
  let provider: anchor.AnchorProvider;
  let program: Program<AnchorEscrow>;
  let programId: anchor.web3.PublicKey;
  let tokenProgram: anchor.web3.PublicKey;
  let maker: anchor.web3.Keypair;
  let taker: anchor.web3.Keypair;
  let mintA: anchor.web3.Keypair;
  let mintB: anchor.web3.Keypair;
  let makerAtaA: anchor.web3.PublicKey;
  let makerAtaB: anchor.web3.PublicKey;
  let takerAtaB: anchor.web3.PublicKey;
  let takerAtaA: anchor.web3.PublicKey;
  let escrow: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;

  const confirm = async (signature: string): Promise<string> => {
    const block = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature,
      ...block,
    });
    return signature;
  };

  const log = async (signature: string): Promise<string> => {
    console.log(
      `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${provider.connection.rpcEndpoint}`
    );
    return signature;
  };

  beforeEach(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    program = anchor.workspace.anchorEscrow as Program<AnchorEscrow>;
    programId = program.programId;
    tokenProgram = spl.TOKEN_2022_PROGRAM_ID;
  });

  describe("make", () => {
    const SEED = new anchor.BN(0);
    let accounts: any;

    beforeEach(async () => {
      [maker, taker, mintA, mintB] = generateKeyPairs(4);
      [makerAtaA, makerAtaB, takerAtaA, takerAtaB] = generateAta(
        [maker, taker],
        [mintA, mintB],
        programId
      );

      [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          maker.publicKey.toBuffer(),
          SEED.toArrayLike(Buffer, "le", 8),
        ],
        programId
      );

      [vault] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), maker.publicKey.toBuffer()],
        programId
      );

      accounts = {
        maker: maker.publicKey,
        taker: taker.publicKey,
        mintA: mintA.publicKey,
        mintB: mintB.publicKey,
        makerAtaA: makerAtaA,
        makerAtaB: makerAtaB,
        takerAtaA: takerAtaA,
        takerAtaB: takerAtaB,
        escrow: escrow,
        vault: vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgram,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      };

      let lamports = await spl.getMinimumBalanceForRentExemptMint(
        provider.connection
      );
      let tx = new anchor.web3.Transaction();

      tx.instructions = [
        // airdrop a few sol to maker and taker
        ...[maker, taker].map((a) =>
          anchor.web3.SystemProgram.transfer({
            fromPubkey: provider.publicKey,
            toPubkey: a.publicKey,
            lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
          })
        ),

        // create mintA and mintB
        ...[mintA, mintB].map((m) =>
          SystemProgram.createAccount({
            fromPubkey: provider.publicKey,
            newAccountPubkey: m.publicKey,
            lamports: lamports,
            space: spl.MINT_SIZE,
            programId: tokenProgram,
          })
        ),

        ...[
          { mint: mintA.publicKey, authority: maker.publicKey, ata: makerAtaA },
          { mint: mintB.publicKey, authority: taker.publicKey, ata: takerAtaB },
        ].flatMap((x) => [
          spl.createInitializeMint2Instruction(
            x.mint,
            6,
            x.authority,
            null,
            tokenProgram
          ),

          spl.createAssociatedTokenAccountIdempotentInstruction(
            provider.publicKey,
            x.ata,
            x.authority,
            x.mint,
            tokenProgram
          ),

          spl.createMintToInstruction(
            x.mint,
            x.ata,
            x.authority,
            1e9,
            undefined,
            tokenProgram
          ),
        ]),
      ];

      await provider.sendAndConfirm(tx, [maker, taker, mintA, mintB]).then(log);
    });

    it("Make", async () => {
      await program.methods
        .make(SEED, new anchor.BN(1e6), new anchor.BN(1e6))
        .accounts({ ...accounts })
        .signers([maker]) // signer is req here because maker is supposed to sign this tx else the provider wallet will sign the tx
        .rpc()
        .then(confirm)
        .then(log);
    });

    xit("Refund", async () => {
      await program.methods
        .refund()
        .accounts({ ...accounts })
        .signers([maker]) // signer is req here because maker is supposed to sign this tx else the provider wallet will sign the tx
        .rpc()
        .then(confirm)
        .then(log);
    });

    it("Take", async () => {
      await program.methods
        .take()
        .accounts({ ...accounts })
        .signers([taker]) // signer is req here because taker is supposed to sign this tx else the provider wallet will sign the tx
        .rpc()
        .then(confirm)
        .then(log);
    });
  });
});

function generateKeyPairs(length: number) {
  return Array.from({ length }, () => anchor.web3.Keypair.generate());
}

function generateAta(
  keypairs: anchor.web3.Keypair[],
  mints: anchor.web3.Keypair[],
  tokenProgram: anchor.web3.PublicKey
) {
  return keypairs
    .map((a) =>
      mints.map((m) =>
        spl.getAssociatedTokenAddressSync(
          m.publicKey,
          a.publicKey,
          true,
          tokenProgram
        )
      )
    )
    .flat();
}
