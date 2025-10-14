import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorVault } from "../target/types/anchor_vault";
import { assert, should } from "chai";

describe("anchor-vault", () => {
  // Configure the client to use the local cluster.
  let provider: anchor.AnchorProvider;
  let program: Program<AnchorVault>;
  let user: anchor.web3.Keypair;
  let vaultStatePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let vaultStateBump: number;
  let vaultBump: number;

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

    program = anchor.workspace.AnchorVault as Program<AnchorVault>;

    user = anchor.web3.Keypair.generate();

    await provider.connection
      .requestAirdrop(user.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
      .then(confirm);

    // derive PDAs
    [vaultStatePDA, vaultStateBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("state"), user.publicKey.toBuffer()],
        program.programId
      );

    [vaultPDA, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("Initialize vault", async () => {
    it("should initialize the vault successfully", async () => {
      const tx = await program.methods
        .initialize()
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);
      // .then(log);

      await checkVault(program, vaultStatePDA, vaultBump, vaultStateBump);
    });

    it("should fail to initilize the vault if wrong seeds used", async () => {
      let should_fail = "This Should Fail";

      try {
        const [vaultState, vaultStateBump] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("hello"), user.publicKey.toBuffer()],
            program.programId
          );

        const tx = await program.methods
          .initialize()
          .accountsPartial({
            user: user.publicKey,
            vault: vaultPDA,
            vaultState: vaultState,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user])
          .rpc()
          .then(confirm);
      } catch (error) {
        should_fail = "Failed";
      }
      assert.strictEqual(
        should_fail,
        "Failed",
        "Vault initialization should have failed with wrong seeds"
      );
    });
  });

  describe("vault deposit", async () => {
    it("should deposit SOL successfully", async () => {
      // initialize first to create and populate vault_state
      await program.methods
        .initialize()
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);

      const tx = await program.methods
        .deposit(new anchor.BN(2_000_000_000))
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);
      // .then(log);
    });

    it("should fail to deposit SOL because negative", async () => {
      let should_fail = "This Should Fail";

      try {
        await program.methods
          .deposit(new anchor.BN(1_000_000_000))
          .accountsPartial({
            user: user.publicKey,
            vault: vaultPDA,
            vaultState: vaultStatePDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user])
          .rpc()
          .then(confirm);
      } catch (error) {
        should_fail = "Failed";
      }
      assert.strictEqual(
        should_fail,
        "Failed",
        "Vault deposit should have failed with negative amount"
      );
    });
  });

  describe("vault withdraw", async () => {
    it("should withdraw SOL successfully", async () => {
      // initialize first to create and populate vault_state
      await program.methods
        .initialize()
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);

      await program.methods
        .deposit(new anchor.BN(1_000_000_000))
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);

      await program.methods
        .withdraw(new anchor.BN(1_000_000_000))
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);
    });

    it("should fail to withdraw SOL because negative", async () => {
      let should_fail = "This Should Fail";

      try {
        await program.methods
          .withdraw(new anchor.BN(-1_000_000_000))
          .accountsPartial({
            user: user.publicKey,
            vault: vaultPDA,
            vaultState: vaultStatePDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user])
          .rpc()
          .then(confirm);
      } catch (error) {
        should_fail = "Failed";
      }
      assert.strictEqual(
        should_fail,
        "Failed",
        "Vault withdraw should have failed with negative amount"
      );
    });

    it("should fail to withdraw SOL because insufficient funds", async () => {
      let should_fail = "This Should Fail";

      try {
        await program.methods
          .withdraw(new anchor.BN(1_000_000_000))
          .accountsPartial({
            user: user.publicKey,
            vault: vaultPDA,
            vaultState: vaultStatePDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user])
          .rpc()
          .then(confirm);
      } catch (error) {
        should_fail = "Failed";
      }
      assert.strictEqual(
        should_fail,
        "Failed",
        "Vault withdraw should have failed with insufficient funds"
      );
    });
  });

  describe("vault close", async () => {
    it("should close the vault successfully", async () => {
      // initialize first to create and populate vault_state
      await program.methods
        .initialize()
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);

      await program.methods
        .deposit(new anchor.BN(1_000_000_000))
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);

      await program.methods
        .closeVault()
        .accountsPartial({
          user: user.publicKey,
          vault: vaultPDA,
          vaultState: vaultStatePDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc()
        .then(confirm);

      const vault = await provider.connection.getAccountInfo(vaultPDA);
      console.log("vault", vault);
    });
  });
});

async function checkVault(
  program: anchor.Program<AnchorVault>,
  vaultStatePubkey: anchor.web3.PublicKey,
  vaultBump?: number,
  vaultStateBump?: number
) {
  let vaultSateData = await program.account.vaultState.fetch(vaultStatePubkey);

  if (vaultBump) {
    assert.strictEqual(
      vaultSateData.vaultBump.toString(),
      vaultBump.toString(),
      `Vault bump should be ${vaultSateData.vaultBump} but was ${vaultBump}`
    );
  }

  if (vaultStateBump) {
    assert.strictEqual(
      vaultSateData.stateBump.toString(),
      vaultStateBump.toString(),
      `Vault bump should be ${vaultSateData.stateBump} but was ${vaultStateBump}`
    );
  }
}
