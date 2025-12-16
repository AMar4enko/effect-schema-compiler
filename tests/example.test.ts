import { it, expect } from '@codeforbreakfast/bun-test-effect'
import * as S from 'effect/Schema'
import * as AST from 'effect/SchemaAST'
import { Compiler } from '../src/index.js'
import { Effect, flow, Option } from 'effect'
import { skip } from '../src/compiler.js'

const Order = S.Struct({
  id: S.String,
  amount: S.Number,
}).pipe(S.annotations({ identifier: `Order` }))

const User = S.Struct({
  id: S.String,
  deletedAt: S.optional(S.Date),
  orders: S.Array(Order),
}).pipe(S.annotations({ identifier: `User` }))

/**
 * Let's compile schema above into the following text:
 * User.id (string)
 * User.deletedAt? (Date)
 * User.orders (Array<Order>)
 *        Order.id (string)
 *        Order.amount (number)
 */

/**
 * We need state to keep track of current indentation level
 */
interface State {
  level: number
}

/**
 * Short and expanded representations
 */
type Result = [short: string, expanded: Option.Option<string>]

let primitive = Compiler.make<State, Result>()
  /**
   * Handle primitive types
   */
  .rule(Compiler.matchTags(`StringKeyword`, `NumberKeyword`), (ast) =>
    // Use title annotation as result if available (there are defaults)
    AST.getAnnotation<string>(ast, AST.TitleAnnotationId).pipe(
      Effect.orElse(() => new Compiler.CompilerError({ ast, message: `Missing title annotation` })),
      Effect.map((desc) => [desc, Option.none()]),
    ),
  )

it.effect(`compiles primitive type`, () =>
  Effect.gen(function* () {
    const go = primitive
      .compile(User.fields.id.ast, { level: 0 })
      .pipe(Effect.andThen(([short]) => short))
    expect(yield* go).toMatchInlineSnapshot(`"string"`)
  }),
)

let extended = primitive
  /**
   * Let's handle structs.
   */
  .rule(Compiler.matchTags(`TypeLiteral`), (match: AST.TypeLiteral, go, context) =>
    Effect.gen(function* () {
      const currentCtx = yield* context
      const increaseIdent = { level: currentCtx.level + 1 }
      const id = yield* AST.getAnnotation<string>(match, AST.IdentifierAnnotationId).pipe(
        Effect.orElse(
          () =>
            new Compiler.CompilerError({ ast: match, message: `Missing identifier annotation` }),
        ),
      )

      /**
       * Loop over properties, recursively compile them and format the result
       */
      const expanded = yield* Effect.forEach(match.propertySignatures, (prop) => {
        const line = `${` `.repeat(currentCtx.level * 4)}${id}.${String(prop.name)}${prop.isOptional ? `?` : ``}`

        return go(prop.type, increaseIdent).pipe(
          Effect.map(([short, expanded]) => {
            const maybeExpand = expanded.pipe(
              Option.map((e) => `\n${e}`),
              Option.getOrElse(() => ``),
            )
            return `${line} (${short})${maybeExpand}`
          }),
        )
      })

      return [id, Option.some(expanded.join(`\n`))] as Result
    }),
  )

it.effect(`compiles struct type`, () =>
  Effect.gen(function* () {
    const go = extended
      .compile(Order.ast, { level: 0 })
      .pipe(Effect.andThen(([_, expanded]) => expanded))
    expect(yield* go).toMatchInlineSnapshot(`
      "Order.id (string)
      Order.amount (number)"
    `)
  }),
)

const singleElementArray = Option.liftPredicate(
  (types: readonly AST.AST[]): types is [AST.AST] => types.length === 1,
)

/**
 * Custom matcher to extract actual type from `A | undefined` union
 */
const matchOptionalUnion = flow(
  Option.liftPredicate(AST.isUnion),
  Option.andThen((union) => {
    return singleElementArray(union.types.filter((ast) => ast._tag !== `UndefinedKeyword`))
  }),
)

/**
 * Custom matcher to catch Tuples with single rest element (Array<T>)
 */
const matchArray = flow(
  Option.liftPredicate(AST.isTupleType),
  Option.andThen(
    (tuple): Option.Option<AST.AST> =>
      tuple.elements.length === 0 && tuple.rest.length === 1
        ? Option.some(tuple.rest[0].type)
        : Option.none(),
  ),
)

/**
 * Date schema is Refinement AST with Identifier annotation "Date"
 */
let matchDate = flow(
  Compiler.matchTags(`Refinement`),
  Option.andThen((ast) =>
    AST.getAnnotation<string>(ast, AST.IdentifierAnnotationId).pipe(
      Option.filter((id) => id === `Date`),
    ),
  ),
)

let withOptionalAndNestedStruct = extended
  .rule(matchOptionalUnion, (match, go) => go(match[0]))
  .rule(matchArray, (arrayTypeParameter, go, context) =>
    Effect.gen(function* () {
      const [short, expanded] = yield* go(arrayTypeParameter)

      return [`Array<${short}>`, expanded]
    }),
  )
  .rule(matchDate, (match) => {
    console.log(match)
    return Effect.succeed([`Date`, Option.none()] as Result)
  })

it.effect(`withOptionalAndNestedStruct`, () =>
  Effect.gen(function* () {
    const go = withOptionalAndNestedStruct
      .compile(User.ast, { level: 0 })
      .pipe(Effect.andThen(([_, expanded]) => expanded))
    expect(yield* go).toMatchInlineSnapshot(`
      "User.id (string)
      User.deletedAt? (Date)
      User.orders (Array<Order>)
          Order.id (string)
          Order.amount (number)"
    `)
  }),
)
