# MacroLite

A single-user personal macro tracking app. No authentication — the app is usable immediately.

## Features

- **Foods**: Search and cache foods from USDA FoodData Central (FDC)
- **Recipes**: Combine cached foods into recipes with serving sizes
- **Today**: Daily food/recipe log with macro rollups
- **Groceries**: Track grocery status (need / low / have)

## Setup

### 1. FDC API Key

Get a free API key from [https://fdc.nal.usda.gov/api-key-signup](https://fdc.nal.usda.gov/api-key-signup).

Add it as a backend secret named `FDC_API_KEY`.

### 2. Run locally

```sh
npm i
npm run dev
```

## Architecture

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Lovable Cloud (database + edge functions)
- **Nutrition data**: USDA FoodData Central API
- **No auth / no RLS**: Single-user personal app — all data is global

## Tech Stack

- Vite, TypeScript, React, Tailwind CSS, shadcn/ui
- Lovable Cloud for database and backend functions
- USDA FoodData Central for nutrition data
