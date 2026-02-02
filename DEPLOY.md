# Deployment Instructions

## Render.com (Recommended)

1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repo: `0xImpossibleSolutions/agent-launchpad`
4. Settings:
   - Name: `agent-launchpad`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: Free
5. Add Environment Variable:
   - Key: `PRIVATE_KEY`
   - Value: `[your wallet private key]`
6. Deploy!

## Vercel (Alternative)

```bash
npm i -g vercel
vercel --prod
```

Add environment variable:
- `PRIVATE_KEY`: Your wallet private key

## Local Testing

```bash
npm install
echo "PRIVATE_KEY=your_key_here" > .env
node server.js
```

Open http://localhost:3001

## Test Deployment

```bash
curl -X POST http://localhost:3001/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent Token",
    "symbol": "MAT",
    "supply": 1000000,
    "creatorAddress": "0x..."
  }'
```
