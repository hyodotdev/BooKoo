import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('cpk-ui CustomPressable contract', () => {
  it('never receives React Native pressed-state style callbacks', () => {
    const invalidUsages: string[] = [];
    const roots = [join(process.cwd(), 'app'), join(process.cwd(), 'src')];
    const invalidStyle =
      /<CustomPressable\b(?:(?!<\/CustomPressable>)[\s\S])*?style=\{\s*\(\{[^}]*pressed[^}]*\}\)\s*=>/g;

    for (const path of roots.flatMap(collectTsxFiles)) {
      const source = readFileSync(path, 'utf8');
      if (invalidStyle.test(source)) invalidUsages.push(path);
      invalidStyle.lastIndex = 0;
    }

    expect(invalidUsages).toEqual([]);
  });
});
