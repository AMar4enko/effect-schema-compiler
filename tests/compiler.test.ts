import { describe, it, expect } from '@codeforbreakfast/bun-test-effect'
import { Effect, SchemaAST as AST, Option, Ref } from 'effect'
import * as Compiler from '../src/compiler.js'

interface CompilerState {
  readonly counter: Ref.Ref<number>
}

class TestService extends Effect.Service<TestService>()(`TestService`, {
  accessors: true,
  sync: () => {
    return {
      getValue: () => Effect.succeed(42),
    }
  },
}) {}
describe(`Compiler`, () => {
  it.effect(`empty compiler fails with NotImplemented`, () =>
    Effect.gen(function* () {
      const compiler = Compiler.make<string>()

      const err = yield* compiler.compile(AST.stringKeyword).pipe(Effect.flip)

      expect(err).toBeInstanceOf(Compiler.CompilerError)
    }),
  )
  it.effect(`extends compiler`, () =>
    Effect.gen(function* () {
      const compiler = Compiler.make<CompilerState, string>().rule(
        Option.liftPredicate(AST.isStringKeyword),
        () => Effect.succeed(`success`),
      )

      const counter = yield* Ref.make(0)

      const ctx = compiler.makeContextLayer(Effect.succeed({ counter }))

      const result = yield* compiler.compile(AST.stringKeyword).pipe(Effect.provide(ctx))
      expect(result).toBe(`success`)
    }),
  )
  it.effect(`uses context correctly`, () =>
    Effect.gen(function* () {
      const compiler = Compiler.make<CompilerState, string>().rule(
        Option.liftPredicate(AST.isStringKeyword),
        (match, go, context) =>
          Effect.gen(function* () {
            const ctx = yield* context

            const newValue = yield* Ref.updateAndGet(ctx.counter, (n) => n + 1)

            return `${newValue}`
          }),
      )

      const counter = yield* Ref.make(42)

      const ctx = compiler.makeContextLayer(Effect.succeed({ counter }))

      const result = yield* compiler.compile(AST.stringKeyword).pipe(Effect.provide(ctx))

      expect(result).toBe(`43`)
      expect(yield* Ref.get(counter)).toBe(43)
    }),
  )
  it.layer(TestService.Default)((it) =>
    it.effect(`Correctly handles extra requirements in compile effects`, () =>
      Effect.gen(function* () {
        const compiler = Compiler.make().rule<number, TestService>()(
          Option.liftPredicate(AST.isStringKeyword),
          (match, go) => TestService.getValue(),
        )
        const result = yield* compiler.compile(AST.stringKeyword)

        expect(result).toBe(42)
      }),
    ),
  )
})
