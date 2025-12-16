import { get } from 'effect/Chunk'
import {
  Array,
  Data,
  Effect,
  flow,
  Layer,
  Pipeable,
  Option,
  SchemaAST,
  Context,
} from './imports.js'
import type { Matcher, MatchTransformation } from './match.ts'

export class CompilerError extends Data.TaggedError(`CompilerError`)<{
  ast: SchemaAST.AST
  message: string
}> {}

export class Skip extends Data.TaggedError(`Skip`)<{}> {}

export const skip = new Skip()

const CompilerContextId = Symbol.for(`@effect-schema-compiler/CompilerContext`)
const CompilerContextTag = Context.GenericTag(`@effect-schema-compiler/CompilerContext`)

export namespace Compiler {
  export type CompilerContextId = typeof CompilerContextId
  export type Context<ContextValue> = ContextValue & { readonly '~Id': typeof CompilerContextId }

  export interface Compiler<A, ContextValue, R> {
    makeContextLayer: <E, R1>(
      build: Effect.Effect<ContextValue, E, R1>,
    ) => Layer.Layer<Context<ContextValue>, E, R1>
    compile: Context<ContextValue> extends R
      ? <Ctx extends ContextValue | undefined>(
          ast: SchemaAST.AST,
          context?: Ctx,
        ) => Effect.Effect<
          A,
          CompilerError,
          Ctx extends ContextValue ? Exclude<R, Context<ContextValue>> : R
        >
      : (ast: SchemaAST.AST) => Effect.Effect<A, CompilerError, R>

    rule: {
      <B, R2 = R | Context<ContextValue>>(): <M>(
        matcher: Matcher<M>,
        compile: (
          match: M,
          go: Compiler<A | B, ContextValue, R | R2>['compile'],
          context: Effect.Effect<ContextValue, never, Context<ContextValue>>,
        ) => Effect.Effect<B, CompilerError, R2>,
      ) => Compiler<A | B, ContextValue, R | R2>

      <M>(
        matcher: Matcher<M>,
        compile: (
          match: M,
          go: Compiler<A, ContextValue, R>['compile'],
          context: Effect.Effect<ContextValue, never, Context<ContextValue>>,
        ) => Effect.Effect<A, CompilerError | Skip, R | Context<ContextValue>>,
      ): Compiler<A, ContextValue, R | Context<ContextValue>>

      <B, R2 = R>(): <M>(
        matcher: Matcher<M>,
        compile: (
          match: M,
          go: Compiler<A | B, ContextValue, R | R2>['compile'],
        ) => Effect.Effect<B, CompilerError | Skip, R2>,
      ) => Compiler<A | B, ContextValue, R | R2>

      <M>(
        matcher: Matcher<M>,
        compile: (
          match: M,
          go: Compiler<A, ContextValue, R>['compile'],
        ) => Effect.Effect<A, CompilerError | Skip, R>,
      ): Compiler<A, ContextValue, R>
    }
  }
}
type CompilerWithRules<A, ContextValue, R> = Compiler.Compiler<A, ContextValue, R> & {
  readonly rules: Array<any>
}

function isCompilerWithRules<A, ContextValue, R>(
  compiler: Compiler.Compiler<A, ContextValue, R>,
): asserts compiler is CompilerWithRules<A, ContextValue, R> {
  if (`rules` in compiler && Array.isArray((compiler as any).rules)) {
    return
  }

  throw new Error(`Compiler must have rules array`)
}

export const matchTags = <T extends SchemaAST.AST['_tag']>(
  ...tags: T[]
): ((ast: SchemaAST.AST) => Option.Option<Extract<SchemaAST.AST, { _tag: T }>>) => {
  const s = new Set<string>(tags)
  const predicate = (ast: SchemaAST.AST): ast is Extract<SchemaAST.AST, { _tag: T }> =>
    s.has(ast._tag)
  const fromPredicate = Option.liftPredicate(predicate)

  return fromPredicate
}

const transformation = matchTags(`Transformation`)

export const matchTransformation = <
  Kind extends SchemaAST.TransformationKind['_tag'],
  S extends { from?: Matcher<unknown>; to?: Matcher<unknown> } = never,
>(
  kind: Kind,
  structure?: S,
) => {
  const matchKind = (ast: SchemaAST.Transformation) =>
    ast.transformation._tag === kind
      ? Option.some(
          ast.transformation as Extract<SchemaAST.TransformationKind, { _tag: typeof kind }>,
        )
      : Option.none()

  return flow(
    transformation,
    Option.bindTo(`ast`),
    Option.bind(`kind`, ({ ast }) => matchKind(ast)),
    Option.bind(`structure`, ({ ast }) => {
      if (structure === undefined) {
        return Option.some({ ast, kind })
      }
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      const s = {} as any
      if (structure.from) {
        s.from = structure.from(ast.from)
      }
      if (structure.to) {
        s.to = structure.to(ast.to)
      }
      return Option.all(s)
    }),
  ) as unknown as Matcher<MatchTransformation<Kind, S>>
}

const rule = (
  compiler: Compiler.Compiler<any, any, any>,
  predicate: Matcher<any>,
  fn: (
    match: any,
    go: (ast: SchemaAST.AST, context?: any) => Effect.Effect<any, CompilerError, any>,
    ctx: Context.Tag<any, any>,
  ) => Effect.Effect<any, CompilerError | Skip, any>,
) => {
  isCompilerWithRules(compiler)

  return Object.create(proto, {
    rules: {
      value: [{ predicate, fn }].concat(compiler.rules),
    },
  })
}

const proto = Object.freeze({
  rules: [] as Array<any>,
  makeContextLayer(build: Effect.Effect<any, any, any>) {
    return Layer.effect(CompilerContextTag, build)
  },
  compile(this: Compiler.Compiler<any, any, any>, ast: SchemaAST.AST, ctx?: any) {
    isCompilerWithRules(this)

    /**
     * Find all matches
     */
    const matches = Array.filterMap(this.rules, ({ predicate, fn }) =>
      predicate(ast).pipe(Option.map((value) => ({ value, fn }))),
    )

    /**
     * Get first match from the list
     * @returns
     */
    const getNextToCheck = (): Option.Option<unknown> => Array.head(matches)

    const go: any = () =>
      getNextToCheck().pipe(
        Option.match({
          onNone: () => new CompilerError({ ast, message: `No matching compiler rule found` }),
          onSome: (entry: any) => {
            return (
              (
                entry.fn(
                  entry.value,
                  (ast: SchemaAST.AST, context?: any) => {
                    const cmp = this.compile(ast)
                    return cmp.pipe(
                      (context ?? ctx)
                        ? Effect.provideService(CompilerContextTag, context ?? ctx)
                        : Effect.zipLeft(Effect.void),
                    )
                  },
                  CompilerContextTag,
                ) as Effect.Effect<any, CompilerError | Skip, any>
              )
                .pipe(
                  ctx
                    ? Effect.provideService(CompilerContextTag, ctx)
                    : Effect.zipLeft(Effect.void),
                )
                // If match was skipped, try next one
                .pipe(Effect.catchTag(`Skip`, () => (matches.splice(0, 1), go())))
            )
          },
        }),
      )

    return go()
  },
  // oxlint-disable-next-line no-unused-vars
  rule(...args: any[]) {
    if (args.length === 0) {
      return function (this: any, ...args: any[]) {
        return rule(this, args[0], args[1])
      }.bind(this)
    }
    return rule(this as any, args[0], args[1])
  },
  ...Pipeable.Prototype,
})

export const make = <ContextValue = never, A = never>(): Compiler.Compiler<
  A,
  ContextValue,
  never
> => Object.create(proto)
