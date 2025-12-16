/**
 * AST matching predicates collection
 */

import { SchemaAST as AST, Array, Option, flow } from './imports.js'

const singleElementArray = Option.liftPredicate(
  (types: readonly AST.AST[]): types is [AST.AST] => types.length === 1,
)

/**
 * Match union and extract actual type from `A | undefined` union
 */
export const optionalUnionType = flow(
  Option.liftPredicate(AST.isUnion),
  Option.andThen((union) => {
    return singleElementArray(union.types.filter((ast) => ast._tag !== `UndefinedKeyword`))
  }),
  Option.map(Array.headNonEmpty),
)

/**
 * Match Array<T> represented as Tuple with single rest element
 * and return array item type AST
 */
export const arrayType = flow(
  Option.liftPredicate(AST.isTupleType),
  Option.andThen(
    (tuple): Option.Option<AST.AST> =>
      tuple.elements.length === 0 && tuple.rest.length === 1
        ? Option.fromNullable(tuple.rest[0]?.type)
        : Option.none(),
  ),
)
