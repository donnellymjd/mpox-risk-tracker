# D2Sci Figma Make integration

Figma MCP can read Figma Make source files, but the current official write tool
(`use_figma`) does not support Make files. The MCP returned:

> This tool is not supported for Make files.

This bundle contains the source-ready implementation for adding the mpox tracker
to the D2Sci Figma Make project.

## Files to add

Replace `PublicAnalyticsPage.tsx` with the version in this folder:

```text
src/app/components/PublicAnalyticsPage.tsx
```

This version fetches `risk_data.json`, validates `data.styling`, falls back to
the previous hardcoded colors if the styling block is missing or malformed, and
uses the JSON values for Recharts lines and risk-band fills.

## Route update

In `src/app/routes.tsx`, add the import:

```tsx
import { PublicAnalyticsPage } from "./components/PublicAnalyticsPage";
```

Then add this child route inside the root route:

```tsx
{ path: "analytics", Component: PublicAnalyticsPage },
```

Recommended placement is near the existing demo/apps routes:

```tsx
{ path: "apps", Component: ConsumerAppsPage },
{ path: "analytics", Component: PublicAnalyticsPage },
```

## Navigation update

In `src/app/components/Navigation.tsx`, add this item to `navigationItems`:

```tsx
{ id: "analytics", label: "Public Data", path: "/analytics" },
```

Recommended placement:

```tsx
{ id: "services", label: "Services", path: "/services" },
{ id: "analytics", label: "Public Data", path: "/analytics" },
{ id: "apps", label: "Apps", path: "/apps" },
```

To avoid desktop nav crowding, change:

```tsx
<div className="hidden md:flex items-center space-x-8">
```

to:

```tsx
<div className="hidden md:flex items-center space-x-5 lg:space-x-8">
```

## Homepage update

In `src/app/components/HomePage.tsx`, add `ShieldCheck` to the lucide import:

```tsx
ShieldCheck,
```

Update `demoFeatures` so each item has `path` and `buttonLabel`, then add the
mpox tracker item:

```tsx
const demoFeatures = [
  {
    icon: <TrendingUp className="h-6 w-6 brand-blue" />,
    title: "Time Series Forecasting",
    description:
      "Upload your data and see advanced forecasting models in action",
    path: "/demo",
    buttonLabel: "Try Demo",
  },
  {
    icon: <Target className="h-6 w-6 brand-teal" />,
    title: "Marketing Budget Optimization",
    description:
      "Optimize your marketing spend across channels with mCAC analysis",
    path: "/demo",
    buttonLabel: "Try Demo",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 brand-blue" />,
    title: "NYC Mpox Spread Risk Tracker",
    description:
      "Explore a regularly refreshed public health risk signal built from NYC case data",
    path: "/analytics",
    buttonLabel: "View Tracker",
  },
];
```

Change the demo grid from two to three columns:

```tsx
<div className="grid md:grid-cols-3 gap-8 mb-12">
```

Change the card click and button label inside the `demoFeatures.map` block:

```tsx
onClick={() => navigate(demo.path)}
```

and:

```tsx
{demo.buttonLabel}
```

## Footer update

In `src/app/components/Root.tsx`, add a footer link under `Company`:

```tsx
<li>
  <button
    onClick={() => navigate('/analytics')}
    className="hover:text-brand-teal transition-colors"
  >
    Public Data Tools
  </button>
</li>
```

## Publish step

After these edits are applied inside Figma Make, publish the Figma Sites project
so `d2sci.co/analytics` becomes live.

The Figma MCP can currently read Figma Make source, but cannot write Make files
directly. Apply this file through Figma Make's AI editor or source editor.
