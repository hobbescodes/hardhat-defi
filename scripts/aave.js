const { getNamedAccounts, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("./getWeth")

const main = async () => {
    await getWeth()

    const { deployer } = await getNamedAccounts()

    const lendingPool = await getLendingPool(deployer)
    console.log(`LendingPool address: ${lendingPool.address}`)

    // DEPOSIT
    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    await approveERC20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)

    console.log("Depositing...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited!")

    // BORROW
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)
    const daiPrice = await getDaiPrice()
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
    console.log(`You can borrow ${amountDaiToBorrow} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString()) // need the amount in wai
    const daiTokenAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)
    await getBorrowUserData(lendingPool, deployer)

    // REPAY
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer) // NOTE: even after you repay, you will still have a small amount borrowed because you accrued some interest
    await getBorrowUserData(lendingPool, deployer)
}

// get the lendingPool address from the provider (provide ABI for AddressProvider, its address, and an account to lend from)
const getLendingPool = async (account) => {
    const lendingPoolAddressProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    )
    const lendingPoolAddress = await lendingPoolAddressProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}

// in order for contracts to do a safeTransferFrom we most approve an amount to be withdrawn from our account
const approveERC20 = async (erc20Address, spenderAddress, amountToSpend, account) => {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account)

    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)

    console.log("Approved!")
}

// There is a function in the lendingPool contract that you can call that will provider import info
const getBorrowUserData = async (lendingPool, account) => {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(`Total Collateral: ${totalCollateralETH} ETH`)
    console.log(`Total Debt: ${totalDebtETH} ETH`)
    console.log(`Available to Borrow: ${availableBorrowsETH} ETH`)
    return { availableBorrowsETH, totalDebtETH }
}

// Get the conversion rate for ETH / DAI
const getDaiPrice = async () => {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    )
    // once the function returns grab the first index which is the answer (price)
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`The DAI / ETH price is ${price.toString()}`)
    return price
}

const borrowDai = async (daiAddress, lendingPool, amountDaiToBorrowWei, account) => {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account)
    await borrowTx.wait(1)
    console.log(`Youve borrowed!`)
}

const repay = async (amount, daiAddress, lendingPool, account) => {
    await approveERC20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("Repaid!")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
