"""Edit real demo takes into 90 s and 15 s H.264 releases. Raw takes stay private."""
from pathlib import Path
import json, subprocess, shutil, os, sys
root=Path(__file__).resolve().parent.parent; work=root/'test-artifacts/launch-media'; dest=root/'release/0.1.1'
ffmpeg=Path(os.environ.get('FFMPEG_EXE',str(root/'test-artifacts/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
dest.mkdir(parents=True,exist_ok=True);(work/'fonts').mkdir(exist_ok=True)
for name in ['malgun.ttf','segoeui.ttf']:
    source=Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts'/name
    if source.exists():shutil.copyfile(source,work/'fonts'/name)
def run(args):
    result=subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y',*map(str,args)],cwd=work,capture_output=True)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf8',errors='replace')[-5000:])
def stamp(t,ass=False):
    ms=round(t*1000);h=ms//3600000;m=ms//60000%60;s=ms//1000%60
    return f'{h}:{m:02}:{s:02}.{ms%1000//10:02}' if ass else f'{h:02}:{m:02}:{s:02},{ms%1000:03}'
def captions(name,rows):
    srt='\n\n'.join(f'{i+1}\n{stamp(a)} --> {stamp(b)}\n{text}' for i,(a,b,text) in enumerate(rows))+'\n'
    (dest/f'{name}.srt').write_text(srt,encoding='utf8');(dest/f'{name}.vtt').write_text('WEBVTT\n\n'+srt.replace(',', '.'),encoding='utf8')
    ass='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Malgun Gothic,30,&H00342410,&H00342410,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,3,10,0,2,70,70,28,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
    ass+='\n'.join(f'Dialogue: 0,{stamp(a,True)},{stamp(b,True)},Default,,0,0,0,,{text}' for a,b,text in rows)
    (work/f'{name}.ass').write_text(ass,encoding='utf8')
def segment(name,source,duration,start=0,still=False,pad=0,af=False):
    args=['-loop','1','-framerate','30'] if still else ['-ss',f'{start:.3f}']
    args+=['-i',source]
    if still:filter='scale=1920:1080,setsar=1'
    elif af:filter='crop=1270:790:118:223,scale=1530:952:flags=lanczos,pad=1920:1080:195:22:color=0xf3f5f7,setsar=1'
    else:filter='crop=1900:1018:10:45,scale=1772:950:flags=lanczos,pad=1920:1080:74:20:color=0xf3f5f7,setsar=1'
    if pad:filter+=f',trim=duration={duration-pad:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={pad:.3f}'
    filter+=',fps=30'
    args+=['-vf',filter,'-t',f'{duration:.3f}','-an','-r','30','-fps_mode','cfr','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',name]
    run(args);return name
def finish(name,parts,duration,rows):
    captions(name,rows);listing=work/f'{name}-concat.txt';listing.write_text(''.join(f"file '{p}'\n" for p in parts),encoding='utf8')
    run(['-f','concat','-safe','0','-i',listing,'-i','Dream Culture.mp3','-vf',f"drawbox=x=0:y=996:w=1920:h=84:color=white:t=fill,subtitles={name}.ass:fontsdir=fonts",'-af',f'loudnorm=I=-21:TP=-2:LRA=8,afade=t=in:d=1.2,afade=t=out:st={duration-3}:d=3','-map','0:v:0','-map','1:a:0','-t',str(duration),'-c:v','libx264','-preset','fast','-crf','20','-maxrate','7500k','-bufsize','15000k','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',dest/f'{name}.mp4'])
    run(['-v','error','-i',dest/f'{name}.mp4','-f','null','-'])
    print(name,round((dest/f'{name}.mp4').stat().st_size/1000000,2),'MB',flush=True)
for lang in sys.argv[1:] or ['en','ko']:
    take=json.loads((work/f'take-{lang}.json').read_text(encoding='utf8'));marks={m['name']:m['time'] for m in take['marks']};raw=take['outputPath'];af=take['affinityClip'];ko=lang=='ko'
    extra=90-(4+marks['af-export']+6+7+5)
    if not 0<=extra<=15:raise ValueError('Take timing needs editorial review')
    # Explicit still segment: some FFmpeg builds omit tpad clone frames after trim.
    # Holding the last table frame gives time to read without speeding up any action.
    run(['-ss',str(marks['compose']-.1),'-i',raw,'-frames:v','1','-vf','crop=1900:1018:10:45,scale=1772:950:flags=lanczos,pad=1920:1080:74:20:color=0xf3f5f7',f'{lang}-table-hold.png'])
    parts=[segment(f'{lang}-intro.mp4',f'intro-{lang}.png',4,still=True),segment(f'{lang}-source.mp4',raw,marks['compose']),segment(f'{lang}-hold.mp4',f'{lang}-table-hold.png',extra,still=True),segment(f'{lang}-compose.mp4',raw,marks['af-export']-marks['compose'],start=marks['compose']),segment(f'{lang}-brands.mp4',f'brands-{lang}.png',6,still=True),segment(f'{lang}-affinity.mp4',af,7,af=True),segment(f'{lang}-outro.mp4',f'outro-{lang}.png',5,still=True)]
    when=lambda name:4+marks[name]+(extra if marks[name]>=marks['compose'] else 0)
    labels=[('markdown','익숙한 마크다운으로 씁니다.','Write in Markdown. Keep your own words.'),('abstract','초록도, 원고 속성에 한 번만.','Give recurring information a home in YAML.'),('headings','제목의 위계는 마크다운 그대로.','Headings keep their hierarchy.'),('figure','그림은 평소처럼 링크로.','Add an image with a familiar link.'),('table','표와 주석도, 같은 원고 안에.','Tables and notes stay with the manuscript.'),('compose','조판을 누르면, 글이 지면이 됩니다.','Compose. Let the page take shape.'),('switch','원고는 그대로, 저널을 바꿉니다.','Choose the journal for this paper.'),('new-journal','네이비에서 틸과 핑크로.','Your words. A different journal.'),('pdf-export','PDF와 편집용 AF를 내보냅니다.','Export the proof and an editable AF file.')]
    rows=[(0,4,'당신의 글이, 저널이 되다.' if ko else 'Your words. A journal.')]
    for i,(key,kr,en) in enumerate(labels):rows.append((when(key),when(labels[i+1][0])-.15 if i+1<len(labels) else 72,kr if ko else en))
    rows += [(72,78,'두 가지 프리셋이 기본으로 들어 있습니다.' if ko else 'Two ready-to-use journal presets.'),(78,85,'연결된 본문 프레임. 마지막 편집은 Affinity에서.' if ko else 'Connected body frames. The final touch in Affinity.'),(85,90,'설명서 원고로 시작해 보세요.' if ko else 'Start with the working guide.')]
    finish(f'aaeu-demo-{lang}-90s',parts,90,rows)
    teaser=[segment(f'{lang}-short-intro.mp4',f'intro-{lang}.png',3,still=True),segment(f'{lang}-short-source.mp4',raw,3,start=marks['markdown']+3),segment(f'{lang}-short-proof.mp4',raw,3,start=marks['new-journal']+1),segment(f'{lang}-short-brands.mp4',f'brands-{lang}.png',3,still=True),segment(f'{lang}-short-af.mp4',af,3,af=True)]
    messages=['마크다운으로 쓰면.','글이 지면이 됩니다.','당신만의 저널로.','두 가지 기본 프리셋.','마지막 편집까지, 당신에게.'] if ko else ['Write in Markdown.','Let the page follow.','Make it your journal.','Two ready-to-use presets.','Keep the final touch yours.']
    finish(f'aaeu-teaser-{lang}-15s',teaser,15,[(i*3,(i+1)*3,s) for i,s in enumerate(messages)])
credit='Dream Culture — Kevin MacLeod (incompetech.com). CC BY 4.0: https://creativecommons.org/licenses/by/4.0/\nMusic excerpt trimmed, normalized and faded. ISRC USUAN1300046.\n'
(dest/'MEDIA-CREDITS.txt').write_text(credit,encoding='utf8')
