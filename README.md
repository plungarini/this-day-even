# This Day

Even Realities glasses app built with [even-toolkit](https://github.com/fabioglimb/even-toolkit).

## Structure

```
src/
  glasses/                  — Glasses display layer
    shared.ts               — AppSnapshot + AppActions types
    selectors.ts            — Screen router wiring
    splash.ts               — Splash screen
    AppGlasses.tsx          — Glasses connection component (mount at root)
    screens/
      {page}/                 — Screen
        {page}.ts             — Logic container (component class)
        {Page}View.ts         — Pure display function (component template)
  App.tsx                   — Web UI root
  main.tsx                  — Entry point
  app.css                   — Tailwind + even-toolkit theme imports
```

## Dev

```bash
npm run dev      # start dev server at localhost:5173
npm run build    # production build
npm run pack     # build + package as .ehpk for Even Hub
npm run qr       # show QR code for sideloading
```

## Adding a screen

1. Create `src/glasses/screens/<name>/` with `<name>.ts` (logic) and `<Name>View.ts` (display)
2. Register it in `src/glasses/selectors.ts`
3. Add a route pattern to `deriveScreen` in `AppGlasses.tsx`