import { describe, expect, test } from 'tstyche'
import { CompilerError, make, type Compiler } from '../src/compiler.js'
import * as AST from 'effect/SchemaAST'
import { Effect, Option } from 'effect'

type Ctx = number

const compiler = make<Ctx, string>()

class FauxService extends Effect.Service<FauxService>()(`FauxService`, {
  accessors: true,
  sync: () => ({ test: () => true }),
}) {}

describe(`Ergonomic schema compiler`, () => {
  test(`compile without provided initial value and no compiler context requirement`, () => {
    const eff = compiler.compile(AST.stringKeyword)

    expect<typeof eff>().type.toBe<Effect.Effect<string, CompilerError, never>>()
  })

  test(`compile without provided initial value`, () => {
    const eff = compiler
      .rule(Option.liftPredicate(AST.isStringKeyword), (match, go, ctx) => {
        return ctx.pipe(Effect.andThen(() => Effect.succeed(`string with context`)))
      })
      .compile(AST.stringKeyword)

    expect<typeof eff>().type.toBe<Effect.Effect<string, CompilerError, Compiler.Context<number>>>()
  })

  test(`compile with provided initial value`, () => {
    const eff = compiler
      .rule(Option.liftPredicate(AST.isStringKeyword), (match, go, ctx) => {
        return ctx.pipe(Effect.andThen(() => Effect.succeed(`string with context`)))
      })
      .compile(AST.stringKeyword, 42)

    expect<typeof eff>().type.toBe<Effect.Effect<string, CompilerError, never>>()
  })

  describe(`'extend' method`, () => {
    test(`widening overload`, () => {
      const comp = compiler
        .rule<`test`>()(Option.liftPredicate(AST.isTupleType), (match, go, ctx) => {
          return ctx.pipe(Effect.andThen(() => Effect.succeed(`test` as const)))
        })
        .rule<number, FauxService>()(Option.liftPredicate(AST.isTypeLiteral), (match, go) =>
        Effect.gen(function* () {
          yield* FauxService
          return 1
        }),
      )

      const eff = comp.compile(AST.anyKeyword)

      expect(eff).type.toBe<
        Effect.Effect<string | `test` | number, CompilerError, FauxService | Compiler.Context<Ctx>>
      >()
    })

    test(`non-widening overload`, () => {
      const comp = compiler
        .rule<string>()(Option.liftPredicate(AST.isNumberKeyword), (match) =>
          Effect.succeed(`number`),
        )
        .rule(Option.liftPredicate(AST.isStringKeyword), (match, go, ctx) => {
          return Effect.succeed(`another string`)
        })

      const eff = comp.compile(AST.stringKeyword)

      expect(eff).type.toBe<Effect.Effect<string, CompilerError, Compiler.Context<Ctx>>>()
    })
  })
})
