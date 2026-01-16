# Pricing Engine - Modern Stack Migration

This guide covers migrating from Google Apps Script + Sheets to **Supabase + Lovable**.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOVABLE FRONTEND                         │
│  React + Tailwind + shadcn/ui                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Dashboard │ │  Quote   │ │  Admin   │ │ Customer │           │
│  │          │ │ Builder  │ │  Panel   │ │   Mgmt   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE BACKEND                           │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   PostgreSQL     │  │  Edge Functions  │                    │
│  │   - SKUs         │  │  - Pricing Calc  │                    │
│  │   - Pricing      │  │  - Aggregation   │                    │
│  │   - Quotes       │  │  - PDF Export    │                    │
│  │   - Customers    │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Authentication  │  │  Row Level       │                    │
│  │  (Built-in)      │  │  Security        │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key (Settings → API)

### 1.2 Run Migrations

**Option A: Via Supabase Dashboard**
1. Go to SQL Editor
2. Copy contents of `supabase/migrations/001_initial_schema.sql`
3. Run the query
4. Copy contents of `supabase/migrations/002_seed_data.sql`
5. Run the query

**Option B: Via Supabase CLI**
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

### 1.3 Deploy Edge Function

```bash
# Navigate to project root
cd pricing-engine-main

# Deploy the pricing calculation function
supabase functions deploy calculate-pricing
```

### 1.4 Test the Setup

In Supabase Dashboard → SQL Editor, run:

```sql
-- Verify SKUs loaded
SELECT code, description, category FROM skus;

-- Verify pricing models
SELECT s.code, pm.base_unit_price, pm.mode 
FROM pricing_models pm 
JOIN skus s ON pm.sku_id = s.id;

-- Verify term factors
SELECT * FROM term_factors ORDER BY category, term_months;
```

---

## Part 2: Lovable Frontend

### 2.1 Initial Setup Prompt

Start a new project in Lovable with this prompt:

```
Create a B2B pricing quote application with Supabase backend.

Tech stack:
- React with TypeScript
- Tailwind CSS + shadcn/ui components
- Supabase for auth and database
- React Query for data fetching

Core features:
1. Dashboard showing recent quotes and key metrics
2. Quote builder with packages and line items
3. SKU/product management admin
4. Customer management
5. PDF quote export

The app should support:
- Multi-package quotes (each package can have different terms)
- Volume-based pricing (quantity discounts)
- Term-based pricing (commitment discounts)
- Environment factors (production vs reference pricing)
- Aggregated pricing across packages for volume discounts

Use a clean, professional B2B SaaS design with a sidebar navigation.
```

### 2.2 Connect Supabase

After initial generation, prompt:

```
Connect to Supabase:
- Project URL: [YOUR_SUPABASE_URL]
- Anon Key: [YOUR_ANON_KEY]

Set up the Supabase client and add authentication with email/password.
Create a login page and protect all routes.
```

### 2.3 Dashboard Screen

```
Create the Dashboard page with:

1. Key metrics cards at top:
   - Total quotes this month
   - Total value of pending quotes
   - Conversion rate
   - Average quote value

2. Recent quotes table showing:
   - Quote number
   - Customer name
   - Status (badge with colors)
   - Total monthly value
   - Created date
   - Action buttons (view, edit, duplicate)

3. Quick actions:
   - "New Quote" button
   - "View All Quotes" link

Fetch data from Supabase 'quotes' table with customer info joined.
Use the quote_summary view for optimized queries.
```

### 2.4 Quote Builder Screen

```
Create a Quote Builder page with:

LEFT PANEL (2/3 width):
1. Quote header section:
   - Customer selector (searchable dropdown)
   - Quote title input
   - Valid until date picker
   - Toggle for "Use aggregated pricing"

2. Packages section:
   - List of packages as expandable cards
   - Each package shows: name, term months, status
   - "Add Package" button

3. When package is expanded:
   - Editable package name
   - Term months selector (1-60 months)
   - Line items table:
     - SKU (searchable dropdown showing description)
     - Quantity (number input)
     - Environment (production/reference dropdown)
     - Term override (optional)
     - Calculated unit price
     - Monthly total
   - "Add Line Item" button
   - Package subtotal row

4. Grand total section at bottom

RIGHT PANEL (1/3 width):
1. Quote summary card:
   - Total monthly
   - Total annual
   - Total contract value
   
2. Actions:
   - "Calculate Pricing" button (calls Edge Function)
   - "Save Draft" button
   - "Generate PDF" button
   - Status dropdown

When "Calculate Pricing" is clicked, call the Supabase Edge Function 
'calculate-pricing' with action='calculate_quote' and the quote_id.
Refresh the data after calculation completes.
```

### 2.5 SKU Admin Screen

```
Create a SKU Management admin page:

1. Header with "Add SKU" button

2. SKUs table with columns:
   - Code
   - Description
   - Unit
   - Category (badge)
   - Base charge? (yes/no badge)
   - Active status toggle
   - Actions (edit, view pricing)

3. When clicking a SKU row, show a slide-over panel with:
   
   TAB 1 - Basic Info:
   - Code (readonly after creation)
   - Description
   - Unit
   - Category dropdown
   - Is base charge toggle
   - Active toggle
   
   TAB 2 - Pricing Model:
   - Mode selector (stepped/smooth/manual)
   - If stepped/smooth:
     - Base quantity
     - Base unit price
     - Per-double discount %
     - Floor price
     - Steps count
     - Max quantity
     - Breakpoints (comma-separated input)
   - Show generated price tiers preview table
   
   TAB 3 - Base Charge (if is_base_charge):
   - Monthly recurring charge
   - Apply term discount toggle
   
   TAB 4 - Environment Factors:
   - Production factor
   - Reference factor

4. Include a "Preview Pricing" section that shows:
   - Input for test quantity
   - Calculated unit price at that quantity
   - Price tiers table

Connect to 'skus', 'pricing_models', 'base_charges', 'env_factors' tables.
```

### 2.6 Term Factors Admin

```
Create a Term Factors admin page:

1. Tabs for each category: Default, CAS, CNO, CCS

2. Each tab shows a table:
   - Term (months)
   - Factor
   - Effective discount %
   - Actions (edit, delete)

3. "Add Term" button opens modal:
   - Term months input
   - Factor input (with helper showing "0.80 = 20% discount")
   
4. Show a line chart visualization of the term curve

5. Include interpolation preview:
   - Input for any term (e.g., 18 months)
   - Show interpolated factor

Connect to 'term_factors' table.
```

### 2.7 Customer Management

```
Create a Customers page:

1. Customer list with search/filter:
   - Name
   - Company
   - Email
   - Quote count
   - Total quote value
   - Last activity

2. Customer detail slide-over:
   - Edit customer info
   - Quote history table
   - Notes/activity log

3. "Add Customer" button with form:
   - Name
   - Company
   - Email
   - Phone
   - Address
   - Notes

Connect to 'customers' table with quote aggregations.
```

### 2.8 Price Calculator Widget

```
Create a standalone Price Calculator component that can be embedded:

1. SKU selector dropdown
2. Quantity input
3. Term months slider (1-60)
4. Environment toggle (production/reference)

5. Results display:
   - List price
   - Volume discount %
   - Term discount %
   - Environment factor
   - Final unit price
   - Total monthly
   - Discount breakdown visualization

6. "Add to Quote" button (if in quote context)

This should call the Edge Function with action='calculate_items'
for real-time pricing preview without saving.
```

### 2.9 PDF Quote Export

```
Add PDF export functionality:

1. Create a print-friendly quote template component:
   - Company logo header
   - Quote details (number, date, valid until)
   - Customer info
   - Package-by-package breakdown:
     - Package name and term
     - Line items with all pricing details
     - Package subtotal
   - Grand total section
   - Terms and conditions footer
   - Signature lines

2. Use react-pdf or html2pdf for generation

3. Add "Download PDF" button to quote builder

4. Include option to email PDF directly (integrate with Supabase Edge Function)
```

---

## Part 3: Advanced Features

### 3.1 Quote Versioning

```
Add quote versioning:

1. When editing a sent/accepted quote, create a new version
2. Show version history in quote detail
3. Allow comparing versions side-by-side
4. Track who made changes and when

Add 'version' column to quotes table and version history tracking.
```

### 3.2 Approval Workflow

```
Add approval workflow:

1. Quotes over certain thresholds require approval
2. Configurable approval rules (by value, discount %, etc.)
3. Approver notification
4. Approval/rejection with comments
5. Approval history log

Create 'approval_rules' and 'quote_approvals' tables.
```

### 3.3 Analytics Dashboard

```
Create an Analytics page:

1. Quote metrics over time (line chart)
2. Win/loss rate by customer segment
3. Average discount by SKU
4. Revenue forecast based on pending quotes
5. Top customers by quote volume
6. SKU popularity ranking

Use Recharts for visualizations.
```

---

## Database Schema Reference

### Core Tables
- `skus` - Product catalog
- `pricing_models` - Algorithmic pricing rules
- `ladders` - Manual price tiers
- `term_factors` - Commitment discounts by category
- `base_charges` - Fixed monthly fees
- `env_factors` - Environment multipliers

### Business Tables
- `customers` - Customer directory
- `quotes` - Quote headers
- `quote_packages` - Packages within quotes
- `quote_items` - Line items within packages

### Views
- `sku_pricing_summary` - SKUs with pricing info joined
- `quote_summary` - Quotes with customer and totals

---

## Edge Function API

### Calculate Quote
```javascript
const { data } = await supabase.functions.invoke('calculate-pricing', {
  body: {
    action: 'calculate_quote',
    quote_id: 'uuid-here'
  }
});
```

### Calculate Items (Preview)
```javascript
const { data } = await supabase.functions.invoke('calculate-pricing', {
  body: {
    action: 'calculate_items',
    items: [{
      id: 'temp-id',
      sku_id: 'sku-uuid',
      quantity: 100,
      term_months: 24,
      environment: 'production'
    }]
  }
});
```

### Get Price Tiers
```javascript
const { data } = await supabase.functions.invoke('calculate-pricing', {
  body: {
    action: 'get_price_tiers',
    sku_id: 'sku-uuid'
  }
});
```

---

## Migration from Google Sheets

If you have existing data in Google Sheets:

1. Export each sheet as CSV
2. Use Supabase's CSV import feature (Table Editor → Import)
3. Map columns to the new schema
4. Run the Edge Function to recalculate all quotes

---

## Environment Variables

For Lovable, set these in project settings:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

For Edge Functions (set in Supabase Dashboard → Functions):
```
SUPABASE_URL (auto-set)
SUPABASE_SERVICE_ROLE_KEY (auto-set)
```

---

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Run migrations
3. ✅ Deploy Edge Function
4. ⬜ Create Lovable project with prompts above
5. ⬜ Connect Supabase
6. ⬜ Build each screen iteratively
7. ⬜ Test pricing calculations
8. ⬜ Migrate existing data
9. ⬜ Deploy to production
