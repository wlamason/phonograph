#!/usr/bin/env python3
"""Render three original, deterministic listening-room compositions.

Requires Python 3 + numpy and ffmpeg. No samples or third-party recordings.
Each 32-second miniature is composed to loop; derivatives are CC0.
"""
from pathlib import Path
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
SR = 32000
DURATION = 32
N = SR * DURATION
rng = np.random.default_rng(1977)

def freq(midi): return 440 * 2 ** ((midi - 69) / 12)

def render(name, mood):
    music = np.zeros((N, 2), np.float64)

    def note(when, midi, length, volume, voice='keys', pan=0):
        count = int(length * SR)
        t = np.arange(count) / SR
        f = freq(midi)
        if voice == 'keys':
            signal = (np.sin(2*np.pi*f*t + 1.6*np.sin(2*np.pi*f*2*t)*np.exp(-t*5))
                      + .18*np.sin(2*np.pi*f*3*t)*np.exp(-t*3))
            env = (1-np.exp(-t*120))*np.exp(-t*1.5)*(np.maximum(0,1-t/length)**.35)
        elif voice == 'piano':
            signal = sum(np.sin(2*np.pi*f*k*t)*np.exp(-t*k*.5)/k**1.8 for k in range(1,7))
            env = (1-np.exp(-t*190))*np.exp(-t*.65)*np.maximum(0,1-t/length)
        elif voice == 'bass':
            signal = np.sin(2*np.pi*f*t) + .22*np.sin(2*np.pi*f*2*t)
            env = (1-np.exp(-t*90))*np.exp(-t*3)*np.maximum(0,1-t/length)
        else:
            signal = np.sin(2*np.pi*f*t)+.23*np.sin(2*np.pi*f*1.002*t)+.1*np.sin(2*np.pi*f*2*t)
            env = np.sin(np.pi*t/length)**2
        signal *= env * volume
        left = np.cos((pan+1)*np.pi/4); right = np.sin((pan+1)*np.pi/4)
        # Wrap tails across the loop boundary instead of cutting them.
        indices = (np.arange(count) + int(when*SR)) % N
        np.add.at(music[:,0],indices,signal*left)
        np.add.at(music[:,1],indices,signal*right)

    if mood == 'jazz':
        chords = [(53,60,64,69),(50,57,60,64),(55,62,65,69),(48,55,59,64)]
        melody = [76,72,69,67, 69,72,76,79, 77,74,72,69, 71,67,64,67]
        for bar in range(16):
            chord=chords[bar%4]; start=bar*2
            for j,m in enumerate(chord): note(start+.025*j,m,2.8,.14,'keys',-.35+j*.2)
            note(start,chord[0]-12,.9,.19,'bass',-.1)
            note(start+1,chord[0]-5,.65,.12,'bass',-.1)
            if bar%2==0:
                for j in range(2): note(start+.68+j*.66,melody[(bar+j)%16],1.8,.10,'keys',.3)
            # A very quiet brushed-noise pulse, band shaped and decaying.
            for beat in range(4):
                count=int(.12*SR); t=np.arange(count)/SR
                noise=rng.normal(0,1,count); noise=np.diff(noise,prepend=0)*np.exp(-t*45)*.006
                at=int((start+beat*.5+.02)*SR)
                music[at:at+count] += noise[:,None]
    elif mood == 'piano':
        chords=[(48,55,60,64,67),(45,52,57,60,64),(41,48,53,57,60),(43,50,55,59,62)]
        for bar in range(8):
            chord=chords[bar%4]; start=bar*4
            note(start,chord[0]-12,4.8,.16,'piano',-.25)
            for j in range(8): note(start+j*.5,chord[(j+bar)%len(chord)]+12,3.8,.12 if j%4 else .17,'piano',-.3+(j%5)*.15)
    else:
        chords=[(48,55,62,67),(45,52,59,64),(41,48,55,60),(43,50,57,62)]
        for bar in range(4):
            for j,m in enumerate(chords[bar]): note(bar*8+j*.13,m,11,.09,'pad',-.7+j*.45)
            for j in range(4): note(bar*8+j*2+1,chords[bar][j]+12,6,.07,'keys',.5-j*.3)

    # A restrained stereo echo, circular to preserve the seamless loop.
    dry=music.copy()
    for delay,gain in ((.187,.13),(.379,.10),(.617,.065),(1.113,.035)):
        music += np.roll(dry,int(SR*delay),axis=0)[:,::-1]*gain
    music=np.tanh(music*1.2)
    peak=np.max(np.abs(music)); music *= .69/max(peak,.001)
    with tempfile.TemporaryDirectory() as td:
        wav=Path(td)/'master.wav'
        with wave.open(str(wav),'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((music*32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(wav),'-codec:a','libmp3lame','-b:a','128k',
                        '-metadata',f'title={name}','-metadata','artist=Phonograph — original generative composition',
                        '-metadata','copyright=CC0 1.0',str(OUT/f'{mood}.mp3')],check=True)
    print(f'Rendered {name}: {DURATION}s / original composition / CC0')

for name,mood in [('Soft focus','jazz'),('After the rain','piano'),('Still, slowly','ambient')]: render(name,mood)
