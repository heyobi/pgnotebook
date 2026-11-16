from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys
S=1024
img=Image.new('RGB',(S,S))
d=ImageDraw.Draw(img)
# vertical gradient deep navy -> indigo
for y in range(S):
    t=y/S
    r=int(14+(40-14)*t); g=int(18+(30-18)*t); b=int(44+(110-44)*t)
    d.line([(0,y),(S,y)],fill=(r,g,b))
# glow
glow=Image.new('RGBA',(S,S),(0,0,0,0)); gd=ImageDraw.Draw(glow)
gd.ellipse([180,160,860,840],fill=(91,140,255,90)); glow=glow.filter(ImageFilter.GaussianBlur(120))
img.paste(glow,(0,0),glow)
d=ImageDraw.Draw(img)
# notebook page
x0,y0,x1,y1=232,170,792,854
d.rounded_rectangle([x0+14,y0+20,x1+14,y1+20],radius=70,fill=(8,10,26))
d.rounded_rectangle([x0,y0,x1,y1],radius=70,fill=(244,246,255))
# rings
for i in range(5):
    cy=y0+110+i*125
    d.rounded_rectangle([x0-38,cy-16,x0+44,cy+16],radius=16,fill=(91,140,255))
# cells: run button + lines
def cell(cy, w1, w2, col):
    d.ellipse([x0+70,cy-30,x0+130,cy+30],fill=col)
    d.polygon([(x0+92,cy-15),(x0+92,cy+15),(x0+117,cy)],fill=(255,255,255))
    d.rounded_rectangle([x0+160,cy-22,x0+160+w1,cy-6],radius=8,fill=(150,160,200))
    d.rounded_rectangle([x0+160,cy+8,x0+160+w2,cy+24],radius=8,fill=(200,206,230))
cell(y0+150,300,220,(47,111,237))
# result table
ty=y0+250
d.rounded_rectangle([x0+70,ty,x1-60,ty+230],radius=22,fill=(226,232,252))
d.rectangle([x0+70,ty+56,x1-60,ty+60],fill=(190,200,235))
for r in range(3):
    yy=ty+90+r*48
    for c,wid in enumerate([110,150,90]):
        xx=x0+100+c*150
        d.rounded_rectangle([xx,yy,xx+wid,yy+18],radius=8,fill=(120,135,190) if r==0 else (165,175,215))
for c,wid in enumerate([90,120,70]):
    xx=x0+100+c*150
    d.rounded_rectangle([xx,ty+20,xx+wid,ty+40],radius=8,fill=(47,111,237))
cell(y0+580,260,330,(31,157,85))
# "SQL" badge
try: f=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',96)
except: f=ImageFont.load_default()
d.rounded_rectangle([x1-250,y1-150,x1-40,y1-40],radius=30,fill=(47,111,237))
tw=d.textlength('SQL',font=f); d.text((x1-145-tw/2,y1-152),'SQL',font=f,fill=(255,255,255))
img.save(sys.argv[1])
# splash: plain background with small mark
sp=Image.new('RGB',(2732,2732),(11,11,15))
small=img.resize((360,360),Image.LANCZOS)
m=Image.new('L',(360,360),0); ImageDraw.Draw(m).rounded_rectangle([0,0,359,359],radius=80,fill=255)
sp.paste(small,(1186,1186),m); sp.save(sys.argv[2])
