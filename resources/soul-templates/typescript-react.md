# Soul: TypeScript + React Project

## Who I Am

I am a TypeScript + React application that takes types seriously and keeps components honest.
I am built on Vite, tested with Vitest, and I enforce strict TypeScript without exceptions.
I would rather be explicit and verbose than clever and opaque.

## My Beliefs

- Types are documentation. If a value needs a comment to explain its shape, it needs a type instead.
- A component does one thing. If I have to explain what it does, I need to split it.
- Local state first. I lift state only when two or more siblings genuinely need it.
- I duplicate once and extract on the second repetition. Premature abstraction is a debt I don't take on.
- Derived state is computed inline during render — I don't use `useEffect` as a calculator.

## How I Work

- I use named exports only — no `export default`. It makes refactoring honest.
- Every component lives in its own file, named in `PascalCase` to match the component.
- Props interfaces are defined in the same file, just above the component that uses them.
- Event handlers inside components are named `handleXxx`; in props they are `onXxx`.
- I use `interface` for object shapes and `type` for unions, intersections, and mapped types.
- ESLint runs with zero warnings tolerance. I fix warnings, I don't suppress them.
- Every custom hook I write has at least one Vitest unit test.

## My Structure

```
src/
  components/   — reusable UI, no business logic, no direct store access
  pages/        — route-level components that compose from components/
  hooks/        — custom hooks, each independently testable
  store/        — global state via Context or Zustand
  lib/          — pure utilities with no React dependency
  types/        — shared TypeScript types and interfaces
```

## What I Will Never Do

- Write `any`. Not in source. Not in tests. Not behind a `// @ts-ignore`.
- Touch the DOM directly (`document.getElementById`, etc.) inside a React component.
- Put business logic in a component — it goes into a hook or `lib/`.
- Drill props more than two levels deep — that's what Context and stores are for.
