# @amar4enko/effect-schema-compiler

Attempt at ergonomic effect/Schema compiler

## Installation

```bash
bun add @amar4enko/effect-schema-compiler
```

```typescript
const compiler = Compiler.make<Result, Context>()
  .rule(hasReference, ({ referenceId, propertySignatures }, go, context) => {
    //...
  })
  .rule(isUnionWithUndefined, ({ type }, go, context) => {
    //...
  })


const result = yield* compiler.compile(MySchema.ast, initialContext)
```

## Rationale

Working with effect/Schema AST is non-trivial to say the least.  
I've put together this library after spending some time on writing code compiling schemas to Confluence docs, other language types etc.  
It doesn't automagically weave the need to understand AST, yet provides some nice-to-haves when working with it.

## Usage example with tests

[example.test.ts](tests/example.test.ts)