import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import ts from 'typescript';

const ROOTS = [resolve('app'), resolve('src')];
const PROVIDER_BOOTSTRAP = 'src/components/providers/index.tsx';

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('Convex query cache usage', () => {
  it('routes application query hooks through the session memory cache', () => {
    const violations: string[] = [];

    for (const file of ROOTS.flatMap(sourceFiles)) {
      const projectPath = relative(process.cwd(), file);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      for (const statement of source.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          statement.moduleSpecifier.getText(source) !== "'convex/react'" ||
          projectPath === PROVIDER_BOOTSTRAP
        )
          continue;

        const bindings = statement.importClause?.namedBindings;
        if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
        const forbidden = bindings.elements
          .map((element) => element.name.text)
          .filter((name) => name === 'useQuery' || name === 'usePaginatedQuery');
        if (forbidden.length > 0)
          violations.push(`${projectPath}: ${forbidden.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
