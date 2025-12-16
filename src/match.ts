import { Option } from './imports.js'
import { type AST, Transformation, type TransformationKind } from 'effect/SchemaAST'

export type Matcher<A> = (ast: AST) => Option.Option<A>

export type ApplyMatchers<A extends { [key in keyof A]: A[key] }> = {
  [K in keyof A]: A[K] extends Matcher<infer U> ? U : never
}

export type MatchTransformation<
  Kind extends TransformationKind['_tag'],
  S extends {
    from?: Matcher<unknown>
    to?: Matcher<unknown>
  } = never,
> = {
  ast: Transformation
  kind: Extract<
    TransformationKind,
    {
      _tag: Kind
    }
  >
  structure: [S] extends [never] ? never : ApplyMatchers<S>
}
