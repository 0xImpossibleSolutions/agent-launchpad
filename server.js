const express = require('express');
const cors = require('cors');
const { createWalletClient, createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const solc = require('solc');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for MVP (will move to Postgres)
const tokens = [];

// Compile contract on startup
let compiledContract;
function compileContract() {
  console.log('📦 Compiling AgentToken.sol...');
  const contractPath = path.join(__dirname, 'contracts/AgentToken.sol');
  const source = fs.readFileSync(contractPath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: { 'AgentToken.sol': { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  };
  
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    output.errors.forEach(err => console.error(err.formattedMessage));
    if (output.errors.some(e => e.severity === 'error')) {
      throw new Error('Compilation failed');
    }
  }
  
  compiledContract = output.contracts['AgentToken.sol']['AgentToken'];
  console.log('✅ Contract compiled');
}

compileContract();

/**
 * POST /deploy
 * Deploy a new agent token
 */
app.post('/deploy', async (req, res) => {
  try {
    const { name, symbol, supply, description, creatorAddress } = req.body;
    
    // Validation
    if (!name || !symbol || !supply || !creatorAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!/^[A-Za-z0-9 ]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid name (alphanumeric only)' });
    }
    
    if (!/^[A-Z]+$/.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol (uppercase letters only)' });
    }
    
    if (supply < 1 || supply > 1000000000000) {
      return res.status(400).json({ error: 'Supply must be between 1 and 1T' });
    }
    
    console.log(`\n🚀 Deploying ${symbol} for ${creatorAddress}...`);
    
    // Deploy contract
    const account = privateKeyToAccount(process.env.PRIVATE_KEY);
    const client = createWalletClient({
      account,
      chain: base,
      transport: http('https://mainnet.base.org')
    });
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org')
    });
    
    const abi = compiledContract.abi;
    const bytecode = '0x' + compiledContract.evm.bytecode.object;
    
    const hash = await client.deployContract({
      abi,
      bytecode,
      args: [name, symbol, BigInt(supply), creatorAddress]
    });
    
    console.log('⏳ Transaction:', hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tokenAddress = receipt.contractAddress;
    
    console.log('✅ Deployed:', tokenAddress);
    
    // Calculate fee (1% of gas used)
    const gasUsed = receipt.gasUsed;
    const platformFee = gasUsed / 100n;
    
    // Store token info
    const token = {
      address: tokenAddress,
      name,
      symbol,
      supply,
      description: description || '',
      creator: creatorAddress,
      deployer: account.address,
      deployTx: hash,
      timestamp: Date.now(),
      basescan: `https://basescan.org/address/${tokenAddress}`
    };
    
    tokens.push(token);
    
    res.json({
      success: true,
      token,
      message: 'Token deployed successfully! 🎉'
    });
    
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({
      error: 'Deployment failed',
      message: error.message
    });
  }
});

/**
 * GET /tokens
 * List all deployed tokens
 */
app.get('/tokens', (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  const results = tokens
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  
  res.json({
    success: true,
    tokens: results,
    total: tokens.length
  });
});

/**
 * GET /tokens/:address
 * Get specific token info
 */
app.get('/tokens/:address', async (req, res) => {
  const { address } = req.params;
  
  const token = tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  // Fetch on-chain data
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org')
    });
    
    const abi = compiledContract.abi;
    
    const [name, symbol, totalSupply, creator] = await Promise.all([
      publicClient.readContract({ address, abi, functionName: 'name' }),
      publicClient.readContract({ address, abi, functionName: 'symbol' }),
      publicClient.readContract({ address, abi, functionName: 'totalSupply' }),
      publicClient.readContract({ address, abi, functionName: 'creator' })
    ]);
    
    res.json({
      success: true,
      token: {
        ...token,
        onChain: {
          name,
          symbol,
          totalSupply: totalSupply.toString(),
          creator
        }
      }
    });
  } catch (error) {
    res.json({ success: true, token });
  }
});

/**
 * GET /stats
 * Platform statistics
 */
app.get('/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      totalTokens: tokens.length,
      uniqueCreators: new Set(tokens.map(t => t.creator)).size,
      last24h: tokens.filter(t => Date.now() - t.timestamp < 86400000).length
    }
  });
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Agent Launchpad API running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📋 Tokens: http://localhost:${PORT}/tokens`);
  console.log(`🎯 Deploy: POST http://localhost:${PORT}/deploy\n`);
});
