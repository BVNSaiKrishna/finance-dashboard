# Finance Dashboard

A Vite + React personal finance dashboard that reads expenses from a Google Sheet through OpenSheet and turns them into monthly spending insights.

## Features

- Monthly expense summary with total spend, average transaction, and top category
- Search and category filters
- Category mix donut chart
- Daily spend bar chart
- Monthly comparison chart with clickable month bars
- Editable monthly budget saved in the browser
- Expandable transaction lists
- Loading, empty, and error states

## Sheet Format

The dashboard expects a sheet tab named `Expense` with these columns:

| Column | Example |
| --- | --- |
| Date | 23/05/2026 |
| Expense | Lunch |
| Amount | 250 |
| Category | Food |

## Local Setup

```bash
npm install
npm run dev
```

To use your own sheet, copy `.env.example` to `.env` and set:

```bash
VITE_SHEET_URL=https://opensheet.elk.sh/YOUR_SHEET_ID/Expense
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```
