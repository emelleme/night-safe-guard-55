# CurrentTrees Deployment Guide

## 🎄 **Overview**

CurrentTrees Reality Bond System is ready for deployment to Cloudflare Pages + Workers!

## ✅ **What's Been Created**

### **1. Database Schema**
- `migrations/0010_create_currenttrees_schema_renamed.sql` - Creates all tables:
  - `christmas_trees` - Decorated trees
  - `generated_stars` - Procedurally generated stars
  - `currenttrees_bonds` - Reality bonds (renamed to avoid conflict)
  - `currenttrees_drops` - Drop codes with recovery
  - `currenttrees_snapshots` - Social sharing metadata

### **2. API Functions**
- `functions/_utils/id-generator.js` - Utility functions
- `functions/api/save-tree.js` - Save decorated trees
- `functions/api/generate-star.js` - Generate procedural stars
- `functions/api/create-bond.js` - Create reality bonds with staking
- `functions/api/get-drop.js` - Retrieve drop data

### **3. Frontend Pages**
- `src/drop-landing.twig` - Drop landing page with QR
- `src/bond-completion.twig` - Success page with QR code

### **4. Configuration**
- `wrangler.toml` - Cloudflare Pages + Workers configuration
  - D1 database: `cseas-db` (ID: `bda5f0c8-a6b3-4951-b794-0f0b59fc96a4`)
  - KV namespaces: `SHORT_URLS`, `TREE_SESSIONS`, `DROP_METADATA`, `STAR_CACHE`
  - Environment variables configured

## 🚀 **Deployment Steps**

### **Step 1: Run Migration on Cloudflare D1**

```bash
# Run the migration to create tables
npx wrangler d1 execute cseas-db --file=./migrations/0010_create_currenttrees_schema_renamed.sql

# Verify tables were created
npx wrangler d1 execute cseas-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### **Step 2: Build Static Assets**

```bash
# Build frontend for Cloudflare Pages
npm run build
```

### **Step 3: Deploy API Functions to Workers**

```bash
# Deploy individual functions
npx wrangler deploy functions/api/save-tree.js
npx wrangler deploy functions/api/generate-star.js
npx wrangler deploy functions/api/create-bond.js
npx wrangler deploy functions/api/get-drop.js
```

### **Step 4: Deploy Frontend to Pages**

```bash
# Deploy static assets to Cloudflare Pages
npx wrangler pages deploy ./dist
```

### **Step 5: Verify Deployment**

```bash
# Test APIs
curl https://your-worker-name.workers.dev/api/save-tree \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"species":"balsam","name":"Test Tree","decorations":[],"costUsd":10}'

# Test drop retrieval
curl https://cseas.fun/api/get-drop?code=ABC123
```

## 📊 **API Endpoints**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/save-tree` | POST | Save decorated tree, generate short link |
| `/api/generate-star` | POST | Generate procedural star from tree |
| `/api/create-bond` | POST | Create reality bond with staking |
| `/api/get-drop` | GET | Retrieve drop data by code |

## 🗃️ **Database Tables**

| Table | Purpose |
|-------|---------|
| `christmas_trees` | Stores decorated trees with cost, species, decorations |
| `generated_stars` | Procedurally generated stars with params, rarity, haiku |
| `currenttrees_bonds` | Reality bonds with C-Protocol metadata, staking terms |
| `currenttrees_drops` | Drop codes, recovery codes, short links |
| `currenttrees_snapshots` | Social sharing metadata for OG images |

## 🔐 **KV Namespaces**

| Binding | Purpose |
|---------|---------|
| `SHORT_URLS` | Short links for trees/drops (cseas.fun/s/XXX) |
| `TREE_SESSIONS` | Tree session data |
| `DROP_METADATA` | Drop metadata cache (TTL: 30 days) |
| `STAR_CACHE` | Star data cache (TTL: 24 hours) |

## 🔄 **Data Flow**

```
User decorates tree (treedec.html)
    ↓
POST /api/save-tree
    ↓
Tree saved, short link generated (cseas.fun/s/XXXX)
    ↓
Redirect to /star
    ↓
POST /api/generate-star
    ↓
Star generated procedurally (params, rarity, haiku)
    ↓
User selects staking tier (0/3/6/9/12 months)
    ↓
POST /api/create-bond
    ↓
Bond created, drop code generated (ABC123), recovery code generated
    ↓
Redirect to /bond-completion
    ↓
QR code displayed, short link shown (cseas.fun/s/XXXX)
    ↓
User shares link
    ↓
Scanner visits cseas.fun/drop/ABC123
    ↓
GET /api/get-drop?code=ABC123
    ↓
Full data displayed (star, tree, bond, drop details)
```

## 📝 **Environment Variables**

Set in `wrangler.toml`:

```toml
[vars]
CSEAS_MINT = "92dLaNpWekXPkqiFXKmBgEGjfzZJ5bC79AKeLaqAjXUo"
CSEAS_PRICE_USD = "0.00006"
TREASURY_WALLET = "YOUR_TREASURY_WALLET_ADDRESS_HERE"
SOLANA_RPC = "https://api.mainnet-beta.solana.com"
MESHMINT_API = "https://meshmint.currentseas.io/api"
NODE_ENV = "production"
```

## 🎨 **Next Steps After Deployment**

### **1. Frontend Integration**

Update existing frontend to call APIs:

**treedec.html:**
- Add JavaScript to call `/api/save-tree` after decoration
- Store `treeId` and `shortId` in local state
- Redirect to star page: `window.location.href = '/star?treeId=' + treeId`

**star.twig:**
- Add JavaScript to call `/api/generate-star` on load
- Display star with animated canvas
- Add staking tier selector (0-12 months)
- Add "Create Bond" button calling `/api/create-bond`
- Redirect to completion: `window.location.href = '/bond-completion?bondId=' + bondId`

**bond-completion.twig:**
- Already created! Displays bond ID, recovery code, QR code
- Download QR functionality
- Copy link functionality
- Share with Web Share API

### **2. On-Chain Integration** (Optional)

When ready to integrate real Solana transactions:

1. Update `functions/api/create-bond.js`:
   - Replace mock transaction generation with real Solana web3.js
   - Use `@solana/web3.js` library
   - Call staking program (create staking instruction)
   - Sign transaction with user's wallet
   - Send transaction to blockchain
   - Get actual `txSignature` and `blockHeight`

2. Update environment variables:
   - Set `TREASURY_WALLET` to actual address
   - Ensure `SOLANA_RPC` points to mainnet

### **3. Monitoring & Analytics**

- Cloudflare Analytics enabled (`analytics_enabled = true`)
- Monitor API response times via Workers logs
- Track drop views/shares/conversions via database
- Set up Sentry or similar for error tracking

## 🔧 **Local Development**

```bash
# Run Workers locally with simulated bindings
npx wrangler dev

# This uses local D1 (SQLite) and in-memory KV
# Good for testing without deploying
```

## 📚 **Documentation**

- API endpoints: `/api/save-tree`, `/api/generate-star`, `/api/create-bond`, `/api/get-drop`
- Database schema: See `migrations/0010_create_currenttrees_schema_renamed.sql`
- Configuration: See `wrangler.toml`
- Frontend templates: `src/drop-landing.twig`, `src/bond-completion.twig`

## 🎯 **Launch Checklist**

- [ ] Run migration: `npx wrangler d1 execute cseas-db --file=./migrations/0010_create_currenttrees_schema_renamed.sql`
- [ ] Verify tables created
- [ ] Build frontend: `npm run build`
- [ ] Deploy APIs: `npx wrangler deploy functions/api/save-tree.js` etc.
- [ ] Deploy Pages: `npx wrangler pages deploy ./dist`
- [ ] Test endpoints manually
- [ ] Integrate frontend JavaScript (treedec.html, star.twig)
- [ ] Test end-to-end flow
- [ ] Launch! 🚀

## 💡 **Important Notes**

1. **Table Names**: Tables are renamed to avoid conflicts:
   - `currenttrees_bonds` (not `reality_bonds`)
   - `currenttrees_drops` (not `reality_drops`)
   - `currenttrees_snapshots` (not `bond_snapshots`)

2. **C-Protocol**: Bond metadata follows C-Protocol standard:
   - Voyage: vessel, port of origin, destination
   - Cargo: funds, impact units, description
   - Term: staking months, multiplier, validity dates
   - Blockchain: network, tx signature, block height
   - Verification: document hash, verification status

3. **Drop Pattern**: Recovery codes use drop-main format:
   - 6-character drop code: "bear-123"
   - 3-word recovery code: "Cosmic-Brave-Star" (WORD-WORD-WORD)
   - Short link: `cseas.fun/s/XXXX` (4-char short ID)

4. **Viral Loop**: Each drop page has CTAs:
   - "Create Your Own Reality Bond"
   - Links to `/treedec` and `/star`
   - QR code for easy sharing
   - 90/10 model explanation

## 🎉 **Ready to Launch!**

All infrastructure is in place. Follow the steps above to deploy and start accepting Christmas Trees, Stars, and Bonds!
