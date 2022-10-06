import Web3 from "web3";
import { newKitFromWeb3 } from "@celo/contractkit";
import BigNumber from "bignumber.js";
import celoLotteryAbi from "../contract/celo-lottery.abi.json";
import erc20Abi from "../contract/erc20.abi.json";
import {
  CeloLotteryContractAddress,
  cUSDContractAddress,
  ERC20_DECIMALS,
  ZERO_ADDRESS,
} from "../utils/constants";

let kit;
let currentBalance;
let contract;
let lotteries = [];

const connectCeloWallet = async function () {
  if (window.celo) {
    showSpinner("Please approve this DApp to use it");
    try {
      await window.celo.enable();

      const web3 = new Web3(window.celo);
      kit = newKitFromWeb3(web3);

      const accounts = await kit.web3.eth.getAccounts();
      kit.defaultAccount = accounts[0];

      contract = new kit.web3.eth.Contract(
        celoLotteryAbi,
        CeloLotteryContractAddress
      );
      hideSpinner();
    } catch (error) {
      alert(`${error.message}`);
      hideSpinner();
    }
  } else {
    alert("Please install the CeloExtensionWallet.");
  }
};

async function approve(price) {
  const cUSDContract = new kit.web3.eth.Contract(erc20Abi, cUSDContractAddress);
  const result = await cUSDContract.methods
    .approve(CeloLotteryContractAddress, price)
    .send({ from: kit.defaultAccount });
  return result;
}

const getBalance = async function () {
  const totalBalance = await kit.getTotalBalance(kit.defaultAccount);
  currentBalance = totalBalance.cUSD.shiftedBy(-ERC20_DECIMALS).toFixed(2);
  document.querySelector("#balance").textContent = `${currentBalance} cUSD`;
};

const getLotteries = async function () {
  lotteries = [];
  const lotteriesLength = await contract.methods.lotteriesLength().call();
  for (let i = 0; i < lotteriesLength; i++) {
    const lottery = await contract.methods.getLotteryByIndex(i).call();
    if (lottery) {
      lotteries.push(mapLotteryObj(lottery));
    }
  }
  lotteries.reverse();
  renderLotteries();
};

const renderLotteries = function () {
  document.getElementById("lotteries").innerHTML = "";
  lotteries.forEach((lottery, index) => {
    const newLotteryContainer = document.createElement("div");
    newLotteryContainer.classList.add("lottery-container");
    const pricePerTicket = lottery.pricePerTicket
      .shiftedBy(-ERC20_DECIMALS)
      .toFixed(2);
    const prize = lottery.prize.shiftedBy(-ERC20_DECIMALS).toFixed(2);
    newLotteryContainer.innerHTML = `
    <div class="lottery-header">
      <p><strong>Name: </strong>${lottery.name}</p>
      <p><strong>Owner: </strong>${lottery.owner}</p>
      <p><strong>Winner: </strong>${
        lottery.winner === ZERO_ADDRESS
          ? "Lottery not finished"
          : lottery.winner
      }</p>
    </div>
    <div class="lottery-body">
    <p><strong>Price Per Ticket: </strong>${pricePerTicket} cUSD</p>
    <p><strong>Participants: </strong>${lottery.ticketsLength}</p>
    <p><strong>Prize: </strong>${prize} cUSD</p>
    </div>
    <div class="lottery-footer">`;
    if (lottery.winner === ZERO_ADDRESS) {
      if (
        lottery.owner !== kit.defaultAccount &&
        Number(currentBalance) >= Number(pricePerTicket)
      ) {
        newLotteryContainer.innerHTML += `<button class="buy-lottery-btn" id="${index}">Buy Ticket</button>`;
      }
      if (
        lottery.owner !== kit.defaultAccount &&
        Number(currentBalance) < Number(pricePerTicket)
      ) {
        newLotteryContainer.innerHTML += `<button class="buy-lottery-btn" disabled>You don't have enough balance</button>`;
      }
      if (lottery.owner === kit.defaultAccount) {
        newLotteryContainer.innerHTML += `<button class="buy-lottery-btn" disabled>Owner can not play!</button>`;
      }
      if (lottery.owner === kit.defaultAccount && lottery.ticketsLength > 1) {
        newLotteryContainer.innerHTML += `<button class="declare-winner-lottery-btn" id="${index}">End Lottery and declare a Winner</button>`;
      }
    }
    if (lottery.winner === kit.defaultAccount) {
      newLotteryContainer.innerHTML += `<p><string>You win!</string></p>`;
    }
    newLotteryContainer.innerHTML += `</div>`;
    document.getElementById("lotteries").appendChild(newLotteryContainer);
  });
};

const mapLotteryObj = function (contractLotteryResponse) {
  return {
    name: contractLotteryResponse[0],
    owner: contractLotteryResponse[1],
    winner: contractLotteryResponse[2],
    pricePerTicket: new BigNumber(contractLotteryResponse[3]),
    tickets: contractLotteryResponse[4],
    ticketsLength: contractLotteryResponse[5],
    prize: new BigNumber(contractLotteryResponse[6]),
  };
};

const createLottery = async function () {
  const name = document.querySelector("#name").value;
  if (!name || name.length < 1) {
    alert("Name is required");
  }
  const ticketPrice = new BigNumber(
    document.querySelector("#ticketPrice").value
  )
    .shiftedBy(ERC20_DECIMALS)
    .toString();
  if (!ticketPrice || ticketPrice.length < 0) {
    alert("Ticket price is required");
  }
  await contract.methods
    .addLottery(name, ticketPrice)
    .send({ from: kit.defaultAccount });
  document.querySelector("#name").value = "";
  document.querySelector("#ticketPrice").value = "";
  await getLotteries();
};

window.addEventListener("load", async () => {
  await connectCeloWallet();
  await getBalance();
  await getLotteries();
});

const showTab = function (tabId) {
  document.querySelector("#create-lottery-form").classList.add("hidden");
  document.querySelector("#lotteries-list").classList.add("hidden");
  document.querySelector(`#${tabId}`).classList.remove("hidden");
};

const showSpinner = function (label) {
  document.querySelector("#spinner-label").textContent = label;
  document.querySelector("#spinner-loading").classList.value = "";
};

const hideSpinner = function () {
  document.querySelector("#spinner-loading").classList.value = "hidden";
};

document
  .querySelector("#createLotteryButton")
  .addEventListener("click", () => createLottery());

document
  .querySelector("#createLotteryTab")
  .addEventListener("click", () => showTab("create-lottery-form"));

document
  .querySelector("#seeLotteriesTab")
  .addEventListener("click", () => showTab("lotteries-list"));

document.querySelector("#lotteries").addEventListener("click", async (e) => {
  if (e.target.className.includes("buy-lottery-btn")) {
    const index = e.target.id;
    showSpinner("Waiting for payment approval...");
    try {
      await approve(lotteries[index].pricePerTicket);
    } catch (error) {
      alert(`${error.message}`);
      hideSpinner();
    }
    showSpinner(`Waiting payment for "${lotteries[index].name}"...`);
    try {
      await contract.methods
        .buyTicketByLotteryIndex(index)
        .send({ from: kit.defaultAccount });
      alert(`You successfully bought "${lotteries[index].name}" !`);
      hideSpinner();
      getLotteries();
      getBalance();
    } catch (error) {
      alert(`${error.message}`);
      hideSpinner();
    }
  }
  if (e.target.className.includes("declare-winner-lottery-btn")) {
    const index = e.target.id;
    try {
      showSpinner(`Waiting for aproval`);
      await contract.methods
        .declareWinner(index)
        .send({ from: kit.defaultAccount });
      hideSpinner();
      alert(`🎉 You successfully declared a Winner!`);
      getLotteries();
      getBalance();
    } catch (error) {
      alert(`${error.message}`);
    }
  }
});
