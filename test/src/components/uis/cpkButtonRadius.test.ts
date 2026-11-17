import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function styleSheetRadiusKeys(source: string): Set<string> {
  const keys = new Set<string>();
  const sheet = /StyleSheet\.create\(\{([\s\S]*?)\n\}\);/g;
  const key = /(\w+):\s*\{([^}]*)\}/g;
  for (const match of source.matchAll(sheet)) {
    const body = match[1] ?? '';
    for (const entry of body.matchAll(key)) {
      if ((entry[2] ?? '').includes('borderRadius')) keys.add(entry[1] ?? '');
    }
  }
  return keys;
}

function buttonOpenTags(source: string): {readonly attrs: string; readonly line: number}[] {
  const tags: {attrs: string; line: number}[] = [];
  const start = /<(Button|BookooButton)\b/g;
  for (const match of source.matchAll(start)) {
    const from = match.index ?? 0;
    let i = from + match[0].length;
    let depth = 0;
    let attrs = '';
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{') {
        depth += 1;
        if (depth === 1) attrs += ch;
      } else if (ch === '}') {
        if (depth === 1) attrs += ch;
        depth = Math.max(0, depth - 1);
      } else if (ch === '>' && depth === 0) {
        tags.push({
          attrs,
          line: source.slice(0, from).split('\n').length,
        });
        break;
      } else if (depth === 0) attrs += ch;
      i += 1;
    }
  }
  return tags;
}

describe('cpk-ui Button corner radius', () => {
  it('uses the borderRadius prop, never style or styles.container', () => {
    const roots = [join(process.cwd(), 'app'), join(process.cwd(), 'src')];
    const violations: string[] = [];
    for (const path of roots.flatMap(collectTsxFiles)) {
      const source = readFileSync(path, 'utf8');
      if (
        !source.includes('<Button') &&
        !source.includes('<BookooButton')
      )
        continue;
      const radiusKeys = styleSheetRadiusKeys(source);
      const rel = relative(process.cwd(), path);
      for (const tag of buttonOpenTags(source)) {
        if (/style=\{\{[^}]*borderRadius/.test(tag.attrs))
          violations.push(`${rel}:${String(tag.line)} inline style borderRadius`);
        const styleKeys = [
          ...tag.attrs.matchAll(/style=\{(?:\[)?styles\.(\w+)/g),
        ].map((match) => match[1] ?? '');
        for (const key of styleKeys) {
          if (radiusKeys.has(key))
            violations.push(
              `${rel}:${String(tag.line)} style={styles.${key}} carries borderRadius`,
            );
        }
        if (
          /styles=\{\{[\s\S]*?container:\s*\{[\s\S]*?borderRadius/.test(
            tag.attrs,
          )
        )
          violations.push(
            `${rel}:${String(tag.line)} styles.container borderRadius`,
          );
      }
    }
    expect(violations).toEqual([]);
  });
});
