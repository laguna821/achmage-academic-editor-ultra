"""Reproduce vector-only journal wordmarks with PyMuPDF; no licensed font files needed."""
from pathlib import Path
import fitz
import json

dest = Path(__file__).resolve().parent.parent / 'assets/brands'
navy = (0, 46/255, 110/255)
d = fitz.open()
p = d.new_page(width=900, height=180)
p.insert_text((170, 48), 'J O U R N A L   O F', fontname='helv', fontsize=24, color=navy)
p.insert_text((165, 137), 'Achmage', fontname='tiro', fontsize=103, color=navy)
p.draw_polyline([(20,147),(70,30),(121,147)], color=navy, width=13)
p.draw_line((44,106),(96,106), color=(0,102/255,179/255), width=10)
p.draw_line((23,158),(121,158), color=(0,181/255,173/255), width=5)
p.draw_line((157,20),(157,159), color=navy, width=1)
d.set_metadata({'title':'Journal of Achmage — vector wordmark','author':'Achmage','subject':'Original typographic journal lockup. Navy #002E6E; blue #0066B3; teal #00B5AD.'})
d.save(dest/'journal-of-achmage.pdf', deflate=True, no_new_id=True)
(dest/'journal-of-achmage.svg').write_text(p.get_svg_image(text_as_path=True), encoding='utf8')
logo=fitz.open(dest/'cmdspace-supplied-mark.pdf')
d2=fitz.open(); p2=d2.new_page(width=900,height=180)
p2.insert_text((20,39),'J O U R N A L   O F',fontname='helv',fontsize=22,color=(0,127/255,121/255))
p2.show_pdf_page(fitz.Rect(18,61,760,162),logo,0,keep_proportion=True)
p2.draw_rect(fitz.Rect(794,63,816,158),color=None,fill=(0,127/255,121/255))
p2.draw_rect(fitz.Rect(832,63,854,158),color=None,fill=(233/255,133/255,162/255))
d2.set_metadata({'title':'Journal of Command & Space — vector lockup','author':'CMDSPACE / Achmage','subject':'Supplied CMDSPACE vector mark with a journal descriptor.'})
d2.save(dest/'journal-of-command-space.pdf',deflate=True,no_new_id=True)
(dest/'journal-of-command-space.svg').write_text(p2.get_svg_image(text_as_path=True),encoding='utf8')
print(json.dumps({f.name:{'bytes':f.stat().st_size,'rasterImages':len(fitz.open(f)[0].get_images())} for f in dest.glob('journal*.pdf')}))
