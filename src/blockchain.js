import { ethers } from "ethers";

const contractAddress = "0xD0D24d292fE76F078c43A9Ab0ae54394c3a18c60";

const abi = [
  "function storeDocument(bytes32 hash)",
  "function verifyDocument(bytes32 hash) view returns (bool)"
];

async function getContract() {
  try {

    if (!window.ethereum) {
      alert("Install MetaMask");
      return null;
    }

    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    const provider = new ethers.BrowserProvider(
      window.ethereum
    );

    const signer = await provider.getSigner();

    return new ethers.Contract(
      contractAddress,
      abi,
      signer
    );

  } catch (err) {
    console.log("CONTRACT ERROR:", err);
    return null;
  }
}


// STORE HASH ON BLOCKCHAIN
export async function registerHash(hash) {

  try {

    const contract = await getContract();

    if (!contract) return;

    console.log("STORE HASH:", hash);

    const tx = await contract.storeDocument(
      hash
    );

    await tx.wait();

    alert("✅ Document stored on blockchain!");

  } catch (err) {

    console.log("STORE ERROR:", err);

    alert("❌ Blockchain error");
  }
}


// VERIFY HASH FROM BLOCKCHAIN
export async function verifyHash(hash) {

  try {

    const contract = await getContract();

    if (!contract) return false;

    console.log("VERIFY HASH:", hash);

    const exists =
      await contract.verifyDocument(hash);

    console.log(
      "BLOCKCHAIN RESULT:",
      exists
    );

    return exists;

  } catch (err) {

    console.log("VERIFY ERROR:", err);

    return false;
  }
}