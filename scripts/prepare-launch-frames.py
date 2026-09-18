"""Extract actual recorded UI and render the sample PDFs for the launch layout."""
from pathlib import Path
import json, cv2, fitz
root=Path(__file__).resolve().parent.parent
media=root/'test-artifacts/launch-media'; proofs=root/'test-artifacts/launch-presets'
for lang in ['en','ko']:
    take=json.loads((media/f'take-{lang}.json').read_text(encoding='utf8'))
    marks={m['name']:m['time'] for m in take['marks']}
    capture=cv2.VideoCapture(take['outputPath'])
    for name in ['markdown','headings','figure','table','template-preview','new-journal','affinity']:
        source=cv2.VideoCapture(take['affinityClip']) if name=='affinity' and take.get('affinityClip') else capture
        source.set(cv2.CAP_PROP_POS_MSEC,(2 if source is not capture else marks[name]+2)*1000)
        ok,frame=source.read()
        if source is not capture:source.release()
        if not ok: raise RuntimeError(f'Missing {lang} {name} frame')
        encoded_ok,encoded=cv2.imencode('.png',frame)
        if not encoded_ok: raise RuntimeError('PNG encoding failed')
        (media/f'{lang}-{name}.png').write_bytes(encoded.tobytes())
    capture.release()
    for brand in ['achmage','command-space']:
        pdf=fitz.open(proofs/f'{brand}-{lang}.pdf')
        for index in range(3):pdf[index].get_pixmap(matrix=fitz.Matrix(2,2)).save(proofs/f'{brand}-{lang}-p{index+1}.png')
print('Extracted actual UI frames and exact sample PDF pages.')
