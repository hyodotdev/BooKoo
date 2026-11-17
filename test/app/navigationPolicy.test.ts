import {readFileSync, readdirSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import ts from 'typescript';

const root = resolve(__dirname, '../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(path)
        ? [path]
        : [];
  });
}

describe('forward navigation policy', () => {
  it('gives app and ledger stack screens a stable route identity', () => {
    for (const file of [
      'app/(app)/_layout.tsx',
      'app/(app)/ledger/[ledgerId]/_layout.tsx',
    ]) {
      const source = ts.createSourceFile(
        file,
        readFileSync(join(root, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const missing: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
          node.tagName.getText(source) === 'Stack.Screen' &&
          !node.attributes.properties.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(source) === 'dangerouslySingular',
          )
        ) {
          missing.push(node.getText(source));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(missing).toEqual([]);
    }
  });

  it('does not introduce duplicate-instance push calls or Link push flags', () => {
    const violations: string[] = [];
    for (const path of [
      ...sourceFiles(join(root, 'app')),
      ...sourceFiles(join(root, 'src')),
    ]) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        const call =
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'push' &&
          ['router', 'navigation', 'StackActions'].includes(
            node.expression.expression.getText(source),
          );
        const link =
          (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
          node.tagName.getText(source) === 'Link' &&
          node.attributes.properties.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(source) === 'push',
          );
        if (call || link)
          violations.push(
            `${relative(root, path)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          );
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    // Current product flows have no legitimate duplicate-instance exception.
    // Add one only with a product reason and a real stack/Back regression.
    expect(violations).toEqual([]);
  });
});
