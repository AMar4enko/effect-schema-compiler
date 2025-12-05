import { Option, SchemaAST, Record } from './imports.js'
import {
  type AST,
  Declaration,
  Refinement,
  Suspend,
  TemplateLiteral,
  TemplateLiteralSpan,
  Transformation,
  TupleType,
  OptionalType,
  Type,
  TypeLiteral,
  PropertySignature,
  IndexSignature,
  Union,
} from 'effect/SchemaAST'

export const map = <A extends AST, B extends AST>(
  predicate: (ast: AST) => Option.Option<A>,
  mapFn: (ast: A, path: readonly PropertyKey[]) => B,
) => {
  const id = (ast: AST) => ast

  const maybeTransform =
    <T extends AST>(
      fn: (ast: T, compile: SchemaAST.Compiler<AST>, path: readonly PropertyKey[]) => AST,
    ) =>
    (ast: T, compile: SchemaAST.Compiler<AST>, path: readonly PropertyKey[]) => {
      const matched = predicate(ast)
      if (matched._tag == `Some`) {
        const newAst = mapFn(matched.value, path)
        if (newAst._tag == ast._tag) {
          return fn(newAst as unknown as T, compile, path)
        }

        return compile(newAst, path)
      }

      return fn(ast, compile, path)
    }

  const branches = Record.map(
    {
      AnyKeyword: id,
      BigIntKeyword: id,
      BooleanKeyword: id,
      NumberKeyword: id,
      ObjectKeyword: id,
      NeverKeyword: id,
      StringKeyword: id,
      SymbolKeyword: id,
      UndefinedKeyword: id,
      UnknownKeyword: id,
      VoidKeyword: id,
      UniqueSymbol: id,
      Enums: id,
      Literal: id,
      Declaration: (ast, compile, path) => {
        return new Declaration(
          ast.typeParameters.map((ast) => compile(ast, path)),
          ast.decodeUnknown,
          ast.encodeUnknown,
          ast.annotations,
        )
      },
      Refinement: (ast, compile, path) => {
        return new Refinement(compile(ast.from, path), ast.filter, ast.annotations)
      },
      Suspend: (ast, compile, path) => {
        return new Suspend(() => compile(ast.f(), path), ast.annotations)
      },
      TemplateLiteral: (ast, compile, path) => {
        return new TemplateLiteral(
          ast.head,
          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
          ast.spans.map(
            (span) => new TemplateLiteralSpan(compile(span.type, path), span.literal),
          ) as any,
        )
      },
      Transformation: (ast, compile, path) => {
        return new Transformation(
          compile(ast.from, path),
          compile(ast.to, path),
          ast.transformation,
          ast.annotations,
        )
      },
      TupleType: (ast, compile, path) => {
        return new TupleType(
          ast.elements.map(
            (element) =>
              new OptionalType(
                compile(element.type, path),
                element.isOptional,
                element.annotations,
              ),
          ),
          ast.rest.map((element) => new Type(compile(element.type, path), element.annotations)),
          ast.isReadonly,
          ast.annotations,
        )
      },
      TypeLiteral: (ast, compile, path) => {
        return new TypeLiteral(
          ast.propertySignatures.map(
            (sig) =>
              new PropertySignature(
                sig.name,
                compile(sig.type, [sig.name, ...path]),
                sig.isOptional,
                sig.isReadonly,
                sig.annotations,
              ),
          ),
          ast.indexSignatures.map(
            (sig) =>
              new IndexSignature(
                compile(sig.parameter, path),
                compile(sig.type, path),
                sig.isReadonly,
              ),
          ),
          ast.annotations,
        )
      },
      Union: (ast, compile, path) => {
        return Union.make(
          ast.types.map((type) => compile(type, path)),
          ast.annotations,
        )
      },
    } satisfies SchemaAST.Match<AST>,
    maybeTransform as any, // @ts-ignore
  ) as unknown as SchemaAST.Match<AST>

  const cmp = SchemaAST.getCompiler(branches)

  return (ast: AST) => cmp(ast, [])
}
