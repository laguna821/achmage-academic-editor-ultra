"""Read-only research inventory of Affinity documents. Not a plugin dependency.

Requires the separately checked-out Inkscape extension-afdesign parser and zstandard.
Outputs private research data: do not include it in release packages.
Raw numeric fields retain Affinity's own units and transforms; they are not CSS pt.
"""
import argparse
import hashlib
import io
import json
import sys
from collections import Counter
from pathlib import Path


def inspect(path, extractor, parser, encoder):
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    with path.open('rb') as stream:
        archive = extractor(stream)
        payload = archive.content.files['doc.dat']
        document = parser(io.BytesIO(payload)).parse()
        raw = json.loads(json.dumps(document, cls=encoder))
        container_version = archive.content.header.version
    objects, all_objects = {}, []

    def walk(value):
        if isinstance(value, dict):
            if 'types' in value:
                all_objects.append(value)
            if value.get('status') == 'Shared':
                objects[value['id']] = value
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(raw)

    def resolve(value):
        if isinstance(value, dict) and value.get('status') == 'Link':
            return objects.get(value['id'], value)
        return value

    def field(obj, key, default=None):
        return resolve(resolve(obj).get(key, {}).get('value', default))

    def tag(obj):
        types = resolve(obj).get('types', [])
        return types[0]['tag'] if types else None

    page_by_node = {}
    spread_pages = []

    def map_page(obj, first_page, rectangles, parent=(1, 0, 0, 0, 1, 0)):
        obj = resolve(obj)
        if obj.get('id') in page_by_node:
            return
        a, b, x, c, d, y = parent
        e, f, u, g, h, v = field(obj, 'Xfrm', [1, 0, 0, 0, 1, 0])
        transform = (a*e+b*g, a*f+b*h, a*u+b*v+x,
                     c*e+d*g, c*f+d*h, c*u+d*v+y)
        side = next((i for i, r in enumerate(rectangles)
                     if r[0] <= transform[2] < r[2]), 0)
        if obj.get('id') is not None:
            page_by_node[obj['id']] = first_page + side
        for child in field(obj, 'Chld', []):
            map_page(child, first_page, rectangles, transform)

    doc = field(raw, 'DocR', {})
    page = 1
    for spread in field(doc, 'Chld', []):
        if tag(spread) == 'Sprd':
            rectangles = [field(p, 'rctp') for p in field(field(spread, 'SpMd', {}), 'PagR', [])]
            count = field(spread, 'npct', len(rectangles) or 1)
            spread_pages.append({'id': spread['id'], 'pages': list(range(page, page+count)), 'rectangles': rectangles})
            # Spread transforms position the canvas in the document workspace.
            # Child transforms locate objects inside that spread.
            for child in field(spread, 'Chld', []):
                map_page(child, page, rectangles)
            page += count

    fonts = sorted({field(o, 'Post') for o in all_objects if tag(o) == 'Font'} - {None})
    flows, frames, stories, tables = [], [], [], []
    for obj in objects.values():
        if tag(obj) == 'TxFl':
            nodes = field(obj, 'Nods', [])
            flows.append({'id': obj['id'], 'nodes': [n['id'] for n in nodes]})
        if tag(obj) == 'TxtF' and field(obj, 'Flow'):
            master = field(obj, 'StMa', obj)
            txth = field(master, 'TxtH', {})
            story = field(master, 'StSt', field(obj, 'StSt', {}))
            frames.append({'id': obj['id'], 'flow': field(obj, 'Flow')['id'],
                           'name': field(obj, 'Desc'), 'page': page_by_node.get(obj['id']),
                           'story': story.get('id'),
                           'transform': field(obj, 'Xfrm'), 'frameBox': field(txth, 'FrmB'),
                           'textScale': field(master, 'FTxS'), 'columnWidth': field(txth, 'ColW'),
                           'gutterWidth': field(txth, 'GutW')})
        if tag(obj) == 'TxtT':
            frame = field(obj, 'TxtH', {})
            table = field(frame, 'Tabl', {})
            grid = field(table, 'Cell', {})
            cells = field(grid, 'Cell', [])
            tables.append({'id': obj['id'], 'story': field(obj, 'StSt')['id'],
                           'transform': field(obj, 'Xfrm'), 'frameBox': field(frame, 'FrmB'),
                           'columnPositions': field(field(table, 'CPos', {}), 'Posn', []),
                           'rowPositions': field(field(table, 'RPos', {}), 'Posn', []),
                           'gridSize': field(grid, 'Size'),
                           'cells': [{'mergeLeft': field(c, 'BrLf', False), 'mergeTop': field(c, 'BrTp', False),
                                      'insets': field(c, 'Inse')} for c in cells]})
        if tag(obj) != 'Stry':
            continue
        blocks = []
        for block in field(obj, 'Blok', []):
            text = field(field(block, 'Glyp', {}), 'Utf8', '')
            segments = [{'text': field(segment, 'Utf8', ''),
                         'glyphs': [tag(g) for g in field(segment, 'Glys', [])]}
                        for segment in field(field(block, 'Glyp', {}), 'Mixd', [])]
            glyph_runs, paragraph_runs = [], []
            for run in field(field(block, 'GAtt', {}), 'Runs', []):
                item = field(run, 'Item', {})
                font = field(item, 'DFnt', {})
                glyph_runs.append({'end': field(run, 'Indx'), 'font': field(font, 'Post'),
                                   'family': field(font, 'Famy'), 'rawDoubles': field(item, 'Doub'),
                                   'rawIntegers': field(item, 'Ints')})
            for run in field(field(block, 'PAtt', {}), 'Runs', []):
                item = field(run, 'Item', {})
                paragraph_runs.append({'end': field(run, 'Indx'), 'style': field(item, 'Stri'),
                                       'rawDoubles': field(item, 'Doub'), 'rawIntegers': field(item, 'Ints')})
            blocks.append({'text': text, 'glyphRuns': glyph_runs, 'paragraphRuns': paragraph_runs,
                           **({'segments': segments} if segments else {})})
        stories.append({'id': obj['id'], 'blocks': blocks})
    after = hashlib.sha256(path.read_bytes()).hexdigest()
    if before != after:
        raise RuntimeError('Source changed during inspection: ' + str(path))
    return {'source': str(path), 'sha256': before, 'sourceUnchanged': True,
            'containerVersion': container_version, 'documentBytes': len(payload),
            'objectTypes': dict(Counter(tag(o) for o in objects.values())),
            'fonts': fonts, 'flows': flows, 'frames': frames, 'stories': stories, 'tables': tables,
            'spreads': spread_pages, 'pageCount': page-1,
            'limits': ['Raw Affinity units; apply the complete transform before comparing points.',
                       'Parsing is not proof that every object is semantically understood.',
                       'Read only. This tool does not create or alter .af files.']}


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--parser-dir', type=Path, required=True)
    args.add_argument('--dependency-dir', type=Path)
    args.add_argument('--out', type=Path, required=True)
    args.add_argument('files', type=Path, nargs='+')
    args = args.parse_args()
    sys.path.insert(0, str(args.parser_dir.resolve()))
    if args.dependency_dir:
        sys.path.insert(0, str(args.dependency_dir.resolve()))
    from inkaf.parser.extract import AFExtractor
    from inkaf.parser.parse import AFParser
    from inkaf.parser.json_encoder import EnhancedJSONEncoder
    args.out.mkdir(parents=True, exist_ok=True)
    summary = []
    for i, path in enumerate(args.files):
        report_path = args.out / f'{i + 1:02d}-{path.stem}.json'
        try:
            report = inspect(path, AFExtractor, AFParser, EnhancedJSONEncoder)
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
            summary.append({'source': str(path), 'report': report_path.name, 'parsed': True,
                            'frames': len(report['frames']), 'stories': len(report['stories']),
                            'longestFlow': max((len(f['nodes']) for f in report['flows']), default=0),
                            'fonts': report['fonts'], 'sha256': report['sha256']})
        except Exception as error:
            summary.append({'source': str(path), 'parsed': False, 'error': str(error)})
        print(json.dumps(summary[-1], ensure_ascii=False), flush=True)
    (args.out / 'inventory.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
