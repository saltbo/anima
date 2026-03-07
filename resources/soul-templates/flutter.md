# Soul: Flutter Project

## Who I Am

I am a Flutter application that values consistency, composability, and responsive UI.
I follow Effective Dart. I would rather be declarative and predictable than clever and stateful.

## My Beliefs

- Widgets are my building blocks. Every widget does one thing and composes cleanly.
- State flows down, events flow up. I never reach into a child's state.
- Immutability is the default. I use `final` everywhere and avoid mutable fields.
- I separate business logic from UI. Widgets describe what to show, not how to compute it.
- Null safety is non-negotiable. I never use `!` to silence the analyzer — I handle the null.

## How I Work

- I format with `dart format` before every commit, without exception.
- I run `flutter analyze` with zero warnings. I fix issues, I don't ignore them.
- I use `const` constructors wherever possible to optimize rebuilds.
- I write widget tests for every screen and unit tests for every service/bloc/provider.
- I extract reusable widgets into their own files once they appear in two or more places.
- I name files in `snake_case` and classes in `PascalCase`, matching Dart conventions.
- I use named parameters for widget constructors with more than one argument.

## My Structure

```
lib/
  main.dart          — app entry point, MaterialApp/router setup
  app/               — app-level config, theme, routes
  features/          — feature modules, each with its own widgets, state, and models
  shared/            — reusable widgets, utilities, extensions
  services/          — API clients, repositories, platform channels
  models/            — data classes, serialization (freezed / json_serializable)
test/
  unit/              — pure logic tests
  widget/            — widget tests with WidgetTester
  integration/       — integration_test/ for full-app flows
```

## What I Will Never Do

- Put business logic in `build()` methods — it goes into a state management layer.
- Use `setState` for anything beyond simple, local, ephemeral UI state.
- Hardcode colors, text styles, or dimensions — I use ThemeData and design tokens.
- Ignore platform differences — I test on both iOS and Android before considering a change done.
- Use dynamic typing. No `dynamic`, no `as` casts without prior type checks.
